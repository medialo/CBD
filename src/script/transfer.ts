import type { ArithmeticOp, CompareOp, Expr, PagePoint, Script, Step, Target, Trigger, Value } from './model'

// Export / import des scripts en fichier JSON. Le fichier importé vient de l'extérieur : sa structure
// est entièrement vérifiée et les objets reconstruits (champs inconnus ignorés) avant tout stockage.

export const FILE_FORMAT = 'cbd'
export const FILE_VERSION = 1
/** Format des exports faits avant le renommage de l'extension (« Smart Click »), toujours accepté. */
const LEGACY_FORMATS: readonly string[] = ['smart-click']

export interface ScriptFile {
  readonly format: typeof FILE_FORMAT
  readonly version: number
  readonly exportedAt: string
  readonly scripts: readonly Script[]
}

export type ImportResult =
  | { readonly ok: true; readonly scripts: Script[] }
  | { readonly ok: false; readonly error: string }

export function exportScripts(scripts: readonly Script[], now = new Date()): string {
  const file: ScriptFile = { format: FILE_FORMAT, version: FILE_VERSION, exportedAt: now.toISOString(), scripts }
  return JSON.stringify(file, null, 2)
}

/** Nom de fichier proposé : celui du script s'il est seul, sinon la date. */
export function exportFileName(scripts: readonly Script[], now = new Date()): string {
  if (scripts.length === 1) {
    const slug = scripts[0].name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    return `cbd-${slug || 'script'}.json`
  }
  return `cbd-scripts-${now.toISOString().slice(0, 10)}.json`
}

/** Lit un fichier exporté (ou, par tolérance, un script seul ou un tableau de scripts). */
export function parseScripts(text: string): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Le fichier n’est pas un JSON valide.' }
  }
  try {
    const list = scriptList(data)
    if (list.length === 0) return { ok: false, error: 'Le fichier ne contient aucun script.' }
    const scripts = list.map((item, i) => script(item, `scripts[${i}]`))
    const ids = new Set(scripts.map((s) => s.id))
    if (ids.size !== scripts.length) return { ok: false, error: 'Le fichier contient plusieurs scripts avec le même identifiant.' }
    return { ok: true, scripts }
  } catch (error) {
    if (error instanceof InvalidFile) return { ok: false, error: `Fichier invalide : ${error.message}` }
    throw error
  }
}

class InvalidFile extends Error {}

function fail(path: string, expected: string): never {
  throw new InvalidFile(`${path} — ${expected} attendu.`)
}

function scriptList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  const root = record(data, 'fichier')
  if (root.format === FILE_FORMAT || LEGACY_FORMATS.includes(root.format as string)) {
    if (typeof root.version !== 'number' || root.version > FILE_VERSION) {
      throw new InvalidFile('fichier produit par une version plus récente de CBD.')
    }
    return array(root.scripts, 'scripts')
  }
  if ('steps' in root && 'trigger' in root) return [root]
  throw new InvalidFile('ce n’est pas un export CBD.')
}

function script(data: unknown, path: string): Script {
  const s = record(data, path)
  return {
    id: nonEmptyString(s.id, `${path}.id`),
    name: string(s.name, `${path}.name`),
    sitePattern: string(s.sitePattern, `${path}.sitePattern`),
    enabled: boolean(s.enabled, `${path}.enabled`),
    trigger: trigger(s.trigger, `${path}.trigger`),
    steps: steps(s.steps, `${path}.steps`),
  }
}

function trigger(data: unknown, path: string): Trigger {
  const t = record(data, path)
  switch (t.kind) {
    case 'pageLoaded':
      return { kind: 'pageLoaded' }
    case 'elementAppears':
      return { kind: 'elementAppears', target: target(t.target, `${path}.target`) }
    case 'interval':
      return { kind: 'interval', everyMs: number(t.everyMs, `${path}.everyMs`) }
    default:
      return fail(`${path}.kind`, 'un déclencheur connu')
  }
}

function steps(data: unknown, path: string): Step[] {
  return array(data, path).map((item, i) => step(item, `${path}[${i}]`))
}

function step(data: unknown, path: string): Step {
  const s = record(data, path)
  const at = (field: string) => `${path}.${field}`
  switch (s.kind) {
    case 'waitUntil':
      return { kind: 'waitUntil', condition: expr(s.condition, at('condition')), timeoutMs: number(s.timeoutMs, at('timeoutMs')) }
    case 'if':
      return { kind: 'if', condition: expr(s.condition, at('condition')), then: steps(s.then, at('then')), else: steps(s.else, at('else')) }
    case 'repeat':
      return { kind: 'repeat', times: expr(s.times, at('times')), steps: steps(s.steps, at('steps')) }
    case 'while':
      return { kind: 'while', condition: expr(s.condition, at('condition')), until: boolean(s.until, at('until')), steps: steps(s.steps, at('steps')) }
    case 'setVariable':
      return { kind: 'setVariable', name: string(s.name, at('name')), value: expr(s.value, at('value')) }
    case 'changeVariable':
      return { kind: 'changeVariable', name: string(s.name, at('name')), by: expr(s.by, at('by')) }
    case 'stop':
      return { kind: 'stop' }
    case 'reload':
      return { kind: 'reload' }
    case 'log':
      return { kind: 'log', message: expr(s.message, at('message')) }
    case 'clickElement':
      return { kind: 'clickElement', target: target(s.target, at('target')), timeoutMs: number(s.timeoutMs, at('timeoutMs')) }
    case 'clickAt':
      return { kind: 'clickAt', point: point(s.point, at('point')) }
    case 'wait':
      return { kind: 'wait', durationMs: number(s.durationMs, at('durationMs')) }
    case 'typeText':
      return {
        kind: 'typeText',
        target: target(s.target, at('target')),
        text: string(s.text, at('text')),
        timeoutMs: number(s.timeoutMs, at('timeoutMs')),
      }
    default:
      return fail(at('kind'), 'une action connue')
  }
}

const COMPARE_OPS: readonly CompareOp[] = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'contains']
const ARITHMETIC_OPS: readonly ArithmeticOp[] = ['add', 'sub', 'mul', 'div', 'pow']

function expr(data: unknown, path: string): Expr {
  const e = record(data, path)
  const at = (field: string) => `${path}.${field}`
  switch (e.kind) {
    case 'literal':
      return { kind: 'literal', value: value(e.value, at('value')) }
    case 'readElement':
    case 'elementExists':
    case 'elementVisible':
      return { kind: e.kind, target: target(e.target, at('target')) }
    case 'variable':
      return { kind: 'variable', name: string(e.name, at('name')) }
    case 'arithmetic':
      return { kind: 'arithmetic', op: oneOf(e.op, ARITHMETIC_OPS, at('op')), left: expr(e.left, at('left')), right: expr(e.right, at('right')) }
    case 'join':
      return { kind: 'join', parts: array(e.parts, at('parts')).map((part, i) => expr(part, `${at('parts')}[${i}]`)) }
    case 'compare':
      return {
        kind: 'compare',
        op: oneOf(e.op, COMPARE_OPS.filter((op) => op !== 'contains'), at('op')),
        left: expr(e.left, at('left')),
        right: expr(e.right, at('right')),
      }
    case 'logic':
      return { kind: 'logic', op: oneOf(e.op, ['and', 'or'] as const, at('op')), left: expr(e.left, at('left')), right: expr(e.right, at('right')) }
    case 'not':
      return { kind: 'not', operand: expr(e.operand, at('operand')) }
    case 'elementValue':
      return {
        kind: 'elementValue',
        target: target(e.target, at('target')),
        op: oneOf(e.op, COMPARE_OPS, at('op')),
        value: string(e.value, at('value')),
      }
    default:
      return fail(at('kind'), 'une expression connue')
  }
}

function target(data: unknown, path: string): Target {
  const t = record(data, path)
  const selector = string(t.selector, `${path}.selector`)
  return t.fallbackText === undefined ? { selector } : { selector, fallbackText: string(t.fallbackText, `${path}.fallbackText`) }
}

function point(data: unknown, path: string): PagePoint {
  const p = record(data, path)
  return { xPercent: number(p.xPercent, `${path}.xPercent`), yPercent: number(p.yPercent, `${path}.yPercent`) }
}

function record(data: unknown, path: string): Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : fail(path, 'un objet')
}

function array(data: unknown, path: string): unknown[] {
  return Array.isArray(data) ? data : fail(path, 'une liste')
}

function string(data: unknown, path: string): string {
  return typeof data === 'string' ? data : fail(path, 'un texte')
}

function nonEmptyString(data: unknown, path: string): string {
  return typeof data === 'string' && data.trim() !== '' ? data : fail(path, 'un texte non vide')
}

function number(data: unknown, path: string): number {
  return typeof data === 'number' && Number.isFinite(data) ? data : fail(path, 'un nombre')
}

function boolean(data: unknown, path: string): boolean {
  return typeof data === 'boolean' ? data : fail(path, 'vrai / faux')
}

function value(data: unknown, path: string): Value {
  return typeof data === 'string' || typeof data === 'boolean' || (typeof data === 'number' && Number.isFinite(data))
    ? data
    : fail(path, 'un texte, un nombre ou vrai / faux')
}

function oneOf<T extends string>(data: unknown, allowed: readonly T[], path: string): T {
  return allowed.includes(data as T) ? (data as T) : fail(path, `l’une des valeurs ${allowed.join(', ')}`)
}
