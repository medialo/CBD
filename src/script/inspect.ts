import { describeExpr, describeStep, describeTrigger } from './describe'
import type { Expr, PagePoint, Script, Step, Target } from './model'

// Inventaire de ce qu'un script touche dans la page, pour le mode débug.

export type DebugItem =
  | { readonly kind: 'click' | 'type' | 'trigger'; readonly target: Target; readonly label: string }
  | { readonly kind: 'clickAt'; readonly point: PagePoint; readonly label: string }
  /** Condition élémentaire (les et / ou / non sont décomposés) et les éléments qu'elle lit. */
  | { readonly kind: 'condition'; readonly condition: Expr; readonly targets: readonly Target[]; readonly label: string }

export function inspectScript(script: Script): DebugItem[] {
  const items: DebugItem[] = []
  if (script.trigger.kind === 'elementAppears') {
    items.push({ kind: 'trigger', target: script.trigger.target, label: describeTrigger(script.trigger) })
  }
  script.steps.forEach((step) => inspectStep(step, items))
  // Une même condition peut apparaître plusieurs fois (ex. dans « tant que » et « si ») : on ne l'affiche qu'une fois.
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = JSON.stringify(item)
    return !seen.has(key) && seen.add(key)
  })
}

function inspectStep(step: Step, items: DebugItem[]): void {
  switch (step.kind) {
    case 'waitUntil':
      items.push(...conditions(step.condition))
      return
    case 'if':
      items.push(...conditions(step.condition))
      step.then.forEach((s) => inspectStep(s, items))
      step.else.forEach((s) => inspectStep(s, items))
      return
    case 'while':
      items.push(...conditions(step.condition))
      step.steps.forEach((s) => inspectStep(s, items))
      return
    case 'repeat':
      step.steps.forEach((s) => inspectStep(s, items))
      return
    case 'clickElement':
      items.push({ kind: 'click', target: step.target, label: describeStep(step) })
      return
    case 'typeText':
      items.push({ kind: 'type', target: step.target, label: describeStep(step) })
      return
    case 'clickAt':
      items.push({ kind: 'clickAt', point: step.point, label: describeStep(step) })
      return
    case 'setVariable':
    case 'changeVariable':
    case 'stop':
    case 'log':
    case 'reload':
    case 'wait':
      return
  }
}

/** Décompose et / ou / non en conditions élémentaires. */
function conditions(expr: Expr): DebugItem[] {
  if (expr.kind === 'logic') return [...conditions(expr.left), ...conditions(expr.right)]
  if (expr.kind === 'not') return conditions(expr.operand)
  return [{ kind: 'condition', condition: expr, targets: readTargets(expr), label: describeExpr(expr) }]
}

/** Éléments de la page lus par une expression. */
function readTargets(expr: Expr): Target[] {
  switch (expr.kind) {
    case 'readElement':
    case 'elementValue':
    case 'elementExists':
    case 'elementVisible':
      return [expr.target]
    case 'arithmetic':
    case 'compare':
    case 'logic':
      return [...readTargets(expr.left), ...readTargets(expr.right)]
    case 'join':
      return expr.parts.flatMap(readTargets)
    case 'not':
      return readTargets(expr.operand)
    case 'literal':
    case 'variable':
      return []
  }
}
