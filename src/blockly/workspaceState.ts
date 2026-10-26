// Traduction entre l'état sérialisé d'un workspace Blockly et le modèle de script.
// Fonctions pures : on ne manipule que le JSON produit par `Blockly.serialization.workspaces.save`,
// ce qui permet de les tester sans Blockly et garde le modèle indépendant de l'éditeur.

import type { CompareOp, Expr, Step, Target, Trigger } from '../script/model'

/** Sous-ensemble du format de sérialisation Blockly utilisé ici. */
export interface BlockState {
  type: string
  id?: string
  x?: number
  y?: number
  enabled?: boolean
  data?: string
  extraState?: { itemCount?: number }
  fields?: Record<string, unknown>
  /** `shadow` : valeur par défaut d'un emplacement (ex. le 10 de « répéter 10 fois »), remplacée par `block`. */
  inputs?: Record<string, { block?: BlockState; shadow?: BlockState }>
  next?: { block?: BlockState }
}

export interface VariableState {
  id: string
  name: string
}

export interface WorkspaceState {
  blocks?: { languageVersion?: number; blocks?: BlockState[] }
  variables?: VariableState[]
}

/** Ce que le mode pointer mémorise dans `block.data` avec le sélecteur. */
export interface TargetData {
  selector: string
  text?: string
}

export type Translation = { ok: true; trigger: Trigger; steps: Step[] } | { ok: false; errors: string[] }

const TRIGGERS = new Set(['trigger_page_loaded', 'trigger_element_appears', 'trigger_interval'])

/** Correspondance opérateurs Blockly ⇄ modèle. */
const SHORTCUT_OPS = new Set<CompareOp>(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'contains'])
const COMPARE_OPS = { EQ: 'eq', NEQ: 'neq', LT: 'lt', LTE: 'lte', GT: 'gt', GTE: 'gte' } as const
const ARITHMETIC_OPS = { ADD: 'add', MINUS: 'sub', MULTIPLY: 'mul', DIVIDE: 'div', POWER: 'pow' } as const

/** Libellés des blocs, pour des messages d'erreur compréhensibles. */
const LABELS: Record<string, string> = {
  step_wait_until: 'Attendre que',
  step_if: 'Si',
  step_log: 'Écrire dans le journal',
  controls_repeat_ext: 'Répéter … fois',
  controls_whileUntil: 'Répéter tant que',
  variables_set: 'Définir variable',
  math_change: 'Incrémenter variable',
  logic_compare: 'Comparaison',
  logic_operation: 'et / ou',
  logic_negate: 'non',
  math_arithmetic: 'Calcul',
}

class TranslationError extends Error {}

export function fromWorkspace(state: WorkspaceState): Translation {
  const topBlocks = (state.blocks?.blocks ?? []).filter((block) => block.enabled !== false)
  const triggers = topBlocks.filter((block) => TRIGGERS.has(block.type))
  const errors: string[] = []
  if (triggers.length === 0) errors.push('Ajoutez un déclencheur (catégorie « Déclencheurs »).')
  if (triggers.length > 1) errors.push('Un script ne peut avoir qu’un seul déclencheur.')
  if (topBlocks.length > triggers.length) {
    errors.push('Certains blocs ne sont reliés à aucun déclencheur : accrochez-les ou supprimez-les.')
  }
  if (errors.length) return { ok: false, errors }

  try {
    const reader = new Reader(state.variables ?? [])
    const [triggerBlock] = triggers
    return { ok: true, trigger: reader.trigger(triggerBlock), steps: reader.steps(triggerBlock.next?.block) }
  } catch (error) {
    if (error instanceof TranslationError) return { ok: false, errors: [error.message] }
    throw error
  }
}

export function toWorkspace(trigger: Trigger, steps: readonly Step[]): WorkspaceState {
  const writer = new Writer()
  const root: BlockState = { ...writer.trigger(trigger), x: 40, y: 40, next: writer.chain(steps) }
  return {
    blocks: { languageVersion: 0, blocks: [root] },
    ...(writer.variables.size && { variables: [...writer.variables].map((name) => ({ id: variableId(name), name })) }),
  }
}

// --- Blockly → modèle ---

class Reader {
  private readonly variableNames: Map<string, string>

  constructor(variables: VariableState[]) {
    this.variableNames = new Map(variables.map((v) => [v.id, v.name]))
  }

  trigger(block: BlockState): Trigger {
    switch (block.type) {
      case 'trigger_page_loaded':
        return { kind: 'pageLoaded' }
      case 'trigger_element_appears':
        return { kind: 'elementAppears', target: toTarget(block) }
      case 'trigger_interval':
        return { kind: 'interval', everyMs: seconds(block, 'SECONDS') }
      default:
        throw new TranslationError(`Déclencheur inconnu : ${block.type}`)
    }
  }

  steps(first: BlockState | undefined): Step[] {
    const steps: Step[] = []
    for (let block = first; block; block = block.next?.block) {
      if (block.enabled !== false) steps.push(this.step(block))
    }
    return steps
  }

  private step(block: BlockState): Step {
    switch (block.type) {
      case 'step_wait_until':
        return { kind: 'waitUntil', condition: this.input(block, 'COND'), timeoutMs: seconds(block, 'TIMEOUT') }
      case 'step_if':
        return {
          kind: 'if',
          condition: this.input(block, 'COND'),
          then: this.steps(block.inputs?.THEN?.block),
          else: this.steps(block.inputs?.ELSE?.block),
        }
      case 'controls_repeat_ext':
        return { kind: 'repeat', times: this.input(block, 'TIMES'), steps: this.steps(block.inputs?.DO?.block) }
      case 'controls_whileUntil':
        return {
          kind: 'while',
          condition: this.input(block, 'BOOL'),
          until: text(block, 'MODE') === 'UNTIL',
          steps: this.steps(block.inputs?.DO?.block),
        }
      case 'variables_set':
        return { kind: 'setVariable', name: this.variable(block), value: this.input(block, 'VALUE') }
      case 'math_change':
        return { kind: 'changeVariable', name: this.variable(block), by: this.input(block, 'DELTA') }
      case 'step_stop':
        return { kind: 'stop' }
      case 'step_reload':
        return { kind: 'reload' }
      case 'step_log':
        return { kind: 'log', message: this.input(block, 'MESSAGE') }
      case 'step_click_element':
        return { kind: 'clickElement', target: toTarget(block), timeoutMs: seconds(block, 'TIMEOUT') }
      case 'step_click_at':
        return { kind: 'clickAt', point: { xPercent: number(block, 'X'), yPercent: number(block, 'Y') } }
      case 'step_wait':
        return { kind: 'wait', durationMs: seconds(block, 'SECONDS') }
      case 'step_type_text':
        return { kind: 'typeText', target: toTarget(block), text: text(block, 'TEXT'), timeoutMs: seconds(block, 'TIMEOUT') }
      default:
        throw new TranslationError(
          TRIGGERS.has(block.type) ? 'Un déclencheur doit être en haut du script.' : `Bloc inconnu : ${block.type}`,
        )
    }
  }

  /** Expression branchée dans l'entrée `name` ; erreur si l'emplacement est vide. */
  private input(owner: BlockState, name: string): Expr {
    const block = valueIn(owner, name)
    if (!block) throw new TranslationError(`Le bloc « ${LABELS[owner.type] ?? owner.type} » est incomplet : un emplacement est vide.`)
    return this.expr(block)
  }

  private expr(block: BlockState): Expr {
    switch (block.type) {
      case 'math_number':
        return { kind: 'literal', value: number(block, 'NUM') }
      case 'text':
        return { kind: 'literal', value: text(block, 'TEXT') }
      case 'logic_boolean':
        return { kind: 'literal', value: text(block, 'BOOL') === 'TRUE' }
      case 'variables_get':
        return { kind: 'variable', name: this.variable(block) }
      case 'value_element':
        return { kind: 'readElement', target: toTarget(block) }
      case 'math_arithmetic':
        return {
          kind: 'arithmetic',
          op: lookup(ARITHMETIC_OPS, text(block, 'OP')),
          left: this.input(block, 'A'),
          right: this.input(block, 'B'),
        }
      case 'text_join': {
        const count = block.extraState?.itemCount ?? 2
        const parts = Array.from({ length: count }, (_, i): Expr => {
          const part = valueIn(block, `ADD${i}`)
          return part ? this.expr(part) : { kind: 'literal', value: '' }
        })
        return { kind: 'join', parts }
      }
      case 'logic_compare':
        return {
          kind: 'compare',
          op: lookup(COMPARE_OPS, text(block, 'OP')),
          left: this.input(block, 'A'),
          right: this.input(block, 'B'),
        }
      case 'logic_operation':
        return {
          kind: 'logic',
          op: text(block, 'OP') === 'OR' ? 'or' : 'and',
          left: this.input(block, 'A'),
          right: this.input(block, 'B'),
        }
      case 'logic_negate':
        return { kind: 'not', operand: this.input(block, 'BOOL') }
      case 'cond_element_value': {
        const op = text(block, 'OP') as CompareOp
        if (!SHORTCUT_OPS.has(op)) throw new TranslationError(`Opérateur inconnu : ${op}`)
        return { kind: 'elementValue', target: toTarget(block), op, value: text(block, 'VALUE') }
      }
      case 'cond_element_exists':
        return { kind: 'elementExists', target: toTarget(block) }
      case 'cond_element_visible':
        return { kind: 'elementVisible', target: toTarget(block) }
      default:
        throw new TranslationError(`Bloc de valeur inconnu : ${block.type}`)
    }
  }

  /** Le champ VAR est sérialisé `{ id }` ; le nom est dans la liste des variables du workspace. */
  private variable(block: BlockState): string {
    const field = block.fields?.VAR as { id?: string; name?: string } | string | undefined
    if (typeof field === 'string') return this.variableNames.get(field) ?? field
    return (field?.id && this.variableNames.get(field.id)) || field?.name || ''
  }
}

function valueIn(owner: BlockState, input: string): BlockState | undefined {
  const slot = owner.inputs?.[input]
  return slot?.block ?? slot?.shadow
}

function lookup<K extends string, V>(table: Record<K, V>, key: string): V {
  if (!(key in table)) throw new TranslationError(`Opérateur inconnu : ${key}`)
  return table[key as K]
}

/** Le texte capturé n'est conservé que s'il correspond encore au sélecteur affiché. */
function toTarget(block: BlockState): Target {
  const selector = text(block, 'SELECTOR').trim()
  const data = parseTargetData(block.data)
  return data?.text && data.selector === selector ? { selector, fallbackText: data.text } : { selector }
}

export function parseTargetData(data: string | undefined): TargetData | null {
  if (!data) return null
  try {
    const parsed = JSON.parse(data) as Partial<TargetData>
    return typeof parsed.selector === 'string' ? { selector: parsed.selector, text: parsed.text } : null
  } catch {
    return null
  }
}

function text(block: BlockState, field: string): string {
  return String(block.fields?.[field] ?? '')
}

function number(block: BlockState, field: string): number {
  return Number(block.fields?.[field] ?? 0)
}

function seconds(block: BlockState, field: string): number {
  return Math.round(number(block, field) * 1000)
}

// --- modèle → Blockly ---

const variableId = (name: string) => `var:${name}`
const reverse = <K extends string, V extends string>(table: Record<K, V>) =>
  Object.fromEntries(Object.entries(table).map(([k, v]) => [v, k])) as Record<V, K>
const BLOCKLY_COMPARE = reverse(COMPARE_OPS)
const BLOCKLY_ARITHMETIC = reverse(ARITHMETIC_OPS)

class Writer {
  /** Variables rencontrées, à déclarer dans le workspace. */
  readonly variables = new Set<string>()

  trigger(trigger: Trigger): BlockState {
    switch (trigger.kind) {
      case 'pageLoaded':
        return { type: 'trigger_page_loaded' }
      case 'elementAppears':
        return targetBlock('trigger_element_appears', trigger.target)
      case 'interval':
        return { type: 'trigger_interval', fields: { SECONDS: trigger.everyMs / 1000 } }
    }
  }

  chain(steps: readonly Step[]): { block: BlockState } | undefined {
    return steps.reduceRight<{ block: BlockState } | undefined>(
      (next, step) => ({ block: { ...this.step(step), ...(next && { next }) } }),
      undefined,
    )
  }

  private statements(name: string, steps: readonly Step[]): Record<string, { block: BlockState }> {
    const chained = this.chain(steps)
    return chained ? { [name]: chained } : {}
  }

  private step(step: Step): BlockState {
    switch (step.kind) {
      case 'waitUntil':
        return {
          type: 'step_wait_until',
          fields: { TIMEOUT: step.timeoutMs / 1000 },
          inputs: { COND: { block: this.expr(step.condition) } },
        }
      case 'if':
        return {
          type: 'step_if',
          inputs: {
            COND: { block: this.expr(step.condition) },
            ...this.statements('THEN', step.then),
            ...this.statements('ELSE', step.else),
          },
        }
      case 'repeat':
        return {
          type: 'controls_repeat_ext',
          inputs: { TIMES: { block: this.expr(step.times) }, ...this.statements('DO', step.steps) },
        }
      case 'while':
        return {
          type: 'controls_whileUntil',
          fields: { MODE: step.until ? 'UNTIL' : 'WHILE' },
          inputs: { BOOL: { block: this.expr(step.condition) }, ...this.statements('DO', step.steps) },
        }
      case 'setVariable':
        return { type: 'variables_set', fields: this.variable(step.name), inputs: { VALUE: { block: this.expr(step.value) } } }
      case 'changeVariable':
        return { type: 'math_change', fields: this.variable(step.name), inputs: { DELTA: { block: this.expr(step.by) } } }
      case 'stop':
        return { type: 'step_stop' }
      case 'reload':
        return { type: 'step_reload' }
      case 'log':
        return { type: 'step_log', inputs: { MESSAGE: { block: this.expr(step.message) } } }
      case 'clickElement':
        return withFields(targetBlock('step_click_element', step.target), { TIMEOUT: step.timeoutMs / 1000 })
      case 'clickAt':
        return { type: 'step_click_at', fields: { X: step.point.xPercent, Y: step.point.yPercent } }
      case 'wait':
        return { type: 'step_wait', fields: { SECONDS: step.durationMs / 1000 } }
      case 'typeText':
        return withFields(targetBlock('step_type_text', step.target), { TEXT: step.text, TIMEOUT: step.timeoutMs / 1000 })
    }
  }

  private expr(expr: Expr): BlockState {
    switch (expr.kind) {
      case 'literal':
        if (typeof expr.value === 'number') return { type: 'math_number', fields: { NUM: expr.value } }
        if (typeof expr.value === 'boolean') return { type: 'logic_boolean', fields: { BOOL: expr.value ? 'TRUE' : 'FALSE' } }
        return { type: 'text', fields: { TEXT: expr.value } }
      case 'variable':
        return { type: 'variables_get', fields: this.variable(expr.name) }
      case 'readElement':
        return targetBlock('value_element', expr.target)
      case 'arithmetic':
        return this.binary('math_arithmetic', BLOCKLY_ARITHMETIC[expr.op], expr.left, expr.right)
      case 'join':
        return {
          type: 'text_join',
          extraState: { itemCount: expr.parts.length },
          inputs: Object.fromEntries(expr.parts.map((part, i) => [`ADD${i}`, { block: this.expr(part) }])),
        }
      case 'compare':
        return this.binary('logic_compare', BLOCKLY_COMPARE[expr.op], expr.left, expr.right)
      case 'logic':
        return this.binary('logic_operation', expr.op === 'and' ? 'AND' : 'OR', expr.left, expr.right)
      case 'not':
        return { type: 'logic_negate', inputs: { BOOL: { block: this.expr(expr.operand) } } }
      case 'elementValue':
        return withFields(targetBlock('cond_element_value', expr.target), { OP: expr.op, VALUE: expr.value })
      case 'elementExists':
        return targetBlock('cond_element_exists', expr.target)
      case 'elementVisible':
        return targetBlock('cond_element_visible', expr.target)
    }
  }

  private binary(type: string, op: string, left: Expr, right: Expr): BlockState {
    return { type, fields: { OP: op }, inputs: { A: { block: this.expr(left) }, B: { block: this.expr(right) } } }
  }

  private variable(name: string): Record<string, unknown> {
    this.variables.add(name)
    return { VAR: { id: variableId(name) } }
  }
}

function targetBlock(type: string, target: Target): BlockState {
  const data: TargetData = { selector: target.selector, text: target.fallbackText }
  return {
    type,
    fields: { SELECTOR: target.selector },
    ...(target.fallbackText && { data: JSON.stringify(data) }),
  }
}

function withFields(block: BlockState, fields: Record<string, unknown>): BlockState {
  return { ...block, fields: { ...block.fields, ...fields } }
}
