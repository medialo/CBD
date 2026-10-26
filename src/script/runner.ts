import { compareValues, toNumber } from './compare'
import { describeStep, describeTarget, describeTrigger } from './describe'
import type { ArithmeticOp, Expr, PagePoint, Script, ScriptId, Step, Target, Value } from './model'

/** Ce dont l'interpréteur a besoin de la page. Implémenté par `page/DomPageDriver`. */
export interface PageDriver {
  exists(target: Target): boolean
  isVisible(target: Target): boolean
  /** Présent, visible et non désactivé. */
  isClickable(target: Target): boolean
  /** Valeur d'un champ, sinon texte de l'élément ; `null` si absent. */
  readValue(target: Target): string | null
  click(target: Target): boolean
  clickAt(point: PagePoint): boolean
  typeText(target: Target, text: string): boolean
  reload(): void
  /**
   * Résout `true` dès que `check()` devient vrai (réévalué à chaque changement de la page),
   * `false` après `timeoutMs` (0 = sans limite). Rejette si `signal` est annulé.
   */
  waitFor(check: () => boolean, timeoutMs: number, signal: AbortSignal): Promise<boolean>
  sleep(ms: number, signal: AbortSignal): Promise<void>
}

export type LogLevel = 'info' | 'success' | 'error'

export interface RunEvent {
  readonly scriptId: ScriptId
  readonly scriptName: string
  readonly at: number
  readonly level: LogLevel
  readonly message: string
}

class StepFailure extends Error {}

/** Levée par le bloc « Arrêter le script ». */
class StopSignal extends Error {}

type Log = (level: LogLevel, message: string) => void

export interface RunContext {
  readonly driver: PageDriver
  readonly signal: AbortSignal
  readonly log: Log
  /** Variables du script ; conservées d'un déclenchement à l'autre tant que la page reste ouverte. */
  readonly variables: Map<string, Value>
}

export interface ScriptHandle {
  stop(): void
  /** Évalue une expression dans l'état courant du script (ses variables), sans rien exécuter. */
  evaluate(expr: Expr): Value
}

/**
 * Démarre un script : attend son déclencheur puis exécute ses étapes, autant de fois
 * que le déclencheur se produit.
 */
export function startScript(script: Script, driver: PageDriver, onEvent: (event: RunEvent) => void): ScriptHandle {
  const controller = new AbortController()
  const { signal } = controller
  const log: Log = (level, message) =>
    onEvent({ scriptId: script.id, scriptName: script.name, at: Date.now(), level, message })
  const context: RunContext = { driver, signal, log, variables: new Map() }

  const runOnce = async () => {
    log('info', describeTrigger(script.trigger))
    try {
      await runSteps(script.steps, context)
      log('success', 'Terminé')
    } catch (error) {
      if (signal.aborted) throw error
      if (error instanceof StopSignal) log('success', 'Arrêté par le bloc « Arrêter le script »')
      else log('error', error instanceof StepFailure ? error.message : `Erreur inattendue : ${String(error)}`)
    }
  }

  const loop = async () => {
    const { trigger } = script
    switch (trigger.kind) {
      case 'pageLoaded':
        await runOnce()
        return
      case 'elementAppears':
        for (;;) {
          await driver.waitFor(() => driver.exists(trigger.target), 0, signal)
          await runOnce()
          await driver.waitFor(() => !driver.exists(trigger.target), 0, signal)
        }
      case 'interval':
        for (;;) {
          await runOnce()
          await driver.sleep(trigger.everyMs, signal)
        }
    }
  }

  loop().catch((error) => {
    if (!signal.aborted) log('error', `Erreur inattendue : ${String(error)}`)
  })
  return {
    stop: () => controller.abort(),
    evaluate: (expr) => evaluate(expr, context),
  }
}

export async function runSteps(steps: readonly Step[], context: RunContext): Promise<void> {
  for (const step of steps) {
    context.signal.throwIfAborted()
    await runStep(step, context)
  }
}

async function runStep(step: Step, context: RunContext): Promise<void> {
  const { driver, signal, log, variables } = context
  const label = describeStep(step)
  switch (step.kind) {
    case 'waitUntil': {
      log('info', label)
      const ok = await driver.waitFor(() => isTrue(step.condition, context), step.timeoutMs, signal)
      if (!ok) throw new StepFailure(`Délai dépassé : ${label}`)
      return
    }
    case 'if': {
      const holds = isTrue(step.condition, context)
      log('info', `${label} → ${holds ? 'oui' : 'non'}`)
      await runSteps(holds ? step.then : step.else, context)
      return
    }
    case 'repeat': {
      const times = Math.floor(asNumber(evaluate(step.times, context)))
      log('info', `Répéter ${Number.isFinite(times) ? times : 0} fois`)
      for (let i = 0; i < times; i++) await runIteration(step.steps, context)
      return
    }
    case 'while':
      log('info', label)
      while (isTrue(step.condition, context) !== step.until) await runIteration(step.steps, context)
      return
    case 'setVariable':
      variables.set(step.name, evaluate(step.value, context))
      return
    case 'changeVariable':
      variables.set(step.name, asNumber(variables.get(step.name) ?? 0) + asNumber(evaluate(step.by, context)))
      return
    case 'stop':
      throw new StopSignal()
    case 'reload':
      log('info', label)
      driver.reload()
      // La page va être déchargée : rien d'autre ne doit s'exécuter d'ici là.
      await driver.waitFor(() => false, 0, signal)
      return
    case 'log':
      log('info', asText(evaluate(step.message, context)))
      return
    case 'clickElement': {
      log('info', label)
      const ready = await driver.waitFor(() => driver.isClickable(step.target), step.timeoutMs, signal)
      if (!ready) throw new StepFailure(`Élément introuvable ou non cliquable : ${describeTarget(step.target)}`)
      if (!driver.click(step.target)) throw new StepFailure(`Clic impossible : ${describeTarget(step.target)}`)
      return
    }
    case 'clickAt':
      log('info', label)
      if (!driver.clickAt(step.point)) throw new StepFailure(`Aucun élément à cette position : ${label}`)
      return
    case 'wait':
      log('info', label)
      await driver.sleep(step.durationMs, signal)
      return
    case 'typeText': {
      log('info', label)
      const found = await driver.waitFor(() => driver.isVisible(step.target), step.timeoutMs, signal)
      if (!found || !driver.typeText(step.target, step.text)) {
        throw new StepFailure(`Saisie impossible : ${describeTarget(step.target)}`)
      }
      return
    }
  }
}

/** Un tour de boucle cède la main à la page, pour ne jamais la geler même sans « Attendre ». */
async function runIteration(steps: readonly Step[], context: RunContext): Promise<void> {
  await runSteps(steps, context)
  await context.driver.sleep(0, context.signal)
}

export function evaluate(expr: Expr, context: RunContext): Value {
  const { driver, variables } = context
  switch (expr.kind) {
    case 'literal':
      return expr.value
    case 'readElement':
      return (driver.readValue(expr.target) ?? '').trim()
    case 'variable':
      return variables.get(expr.name) ?? 0
    case 'arithmetic': {
      const left = asNumber(evaluate(expr.left, context))
      const right = asNumber(evaluate(expr.right, context))
      return ARITHMETIC[expr.op](left, right)
    }
    case 'join':
      return expr.parts.map((part) => asText(evaluate(part, context))).join('')
    case 'compare':
      return compareValues(asText(evaluate(expr.left, context)), expr.op, asText(evaluate(expr.right, context)))
    case 'logic':
      // Court-circuit : « faux et … » / « vrai ou … » n'évaluent pas la droite.
      return expr.op === 'and'
        ? isTrue(expr.left, context) && isTrue(expr.right, context)
        : isTrue(expr.left, context) || isTrue(expr.right, context)
    case 'not':
      return !isTrue(expr.operand, context)
    case 'elementExists':
      return driver.exists(expr.target)
    case 'elementVisible':
      return driver.isVisible(expr.target)
    case 'elementValue': {
      const actual = driver.readValue(expr.target)
      return actual !== null && compareValues(actual, expr.op, expr.value)
    }
  }
}

const ARITHMETIC: Record<ArithmeticOp, (a: number, b: number) => number> = {
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (a, b) => a / b,
  pow: (a, b) => a ** b,
}

function isTrue(expr: Expr, context: RunContext): boolean {
  return asBoolean(evaluate(expr, context))
}

/** Texte numérique (« 0 », « 00:00 ») → nombre ≠ 0 ; autre texte → non vide. */
export function asBoolean(value: Value): boolean {
  if (typeof value !== 'string') return Boolean(value)
  const number = toNumber(value)
  return number !== null ? number !== 0 : value.trim() !== ''
}

export function asNumber(value: Value): number {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  return toNumber(value) ?? NaN
}

export function asText(value: Value): string {
  if (typeof value === 'boolean') return value ? 'vrai' : 'faux'
  return String(value)
}
