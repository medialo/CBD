import type { ArithmeticOp, CompareOp, Expr, Step, Target, Trigger } from './model'

// Libellés lisibles, utilisés dans le journal d'exécution.

export const OPS: Record<CompareOp, string> = { eq: '=', neq: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥', contains: 'contient' }
const ARITHMETIC: Record<ArithmeticOp, string> = { add: '+', sub: '−', mul: '×', div: '÷', pow: '^' }

export function describeTarget(target: Target): string {
  return target.fallbackText ? `${target.selector} (« ${target.fallbackText} »)` : target.selector
}

export function describeTrigger(trigger: Trigger): string {
  switch (trigger.kind) {
    case 'pageLoaded':
      return 'Quand la page est chargée'
    case 'elementAppears':
      return `Quand ${describeTarget(trigger.target)} apparaît`
    case 'interval':
      return `Toutes les ${trigger.everyMs / 1000} s`
  }
}

export function describeExpr(expr: Expr): string {
  switch (expr.kind) {
    case 'literal':
      if (typeof expr.value === 'string') return `« ${expr.value} »`
      if (typeof expr.value === 'boolean') return expr.value ? 'vrai' : 'faux'
      return String(expr.value)
    case 'readElement':
      return `valeur de ${describeTarget(expr.target)}`
    case 'variable':
      return expr.name
    case 'arithmetic':
      return `(${describeExpr(expr.left)} ${ARITHMETIC[expr.op]} ${describeExpr(expr.right)})`
    case 'join':
      return `joindre(${expr.parts.map(describeExpr).join(', ')})`
    case 'compare':
      return `${describeExpr(expr.left)} ${OPS[expr.op]} ${describeExpr(expr.right)}`
    case 'logic':
      return `(${describeExpr(expr.left)} ${expr.op === 'and' ? 'et' : 'ou'} ${describeExpr(expr.right)})`
    case 'not':
      return `non ${describeExpr(expr.operand)}`
    case 'elementValue':
      return `valeur de ${describeTarget(expr.target)} ${OPS[expr.op]} « ${expr.value} »`
    case 'elementExists':
      return `${describeTarget(expr.target)} existe`
    case 'elementVisible':
      return `${describeTarget(expr.target)} est visible`
  }
}

export function describeStep(step: Step): string {
  switch (step.kind) {
    case 'waitUntil':
      return `Attendre que ${describeExpr(step.condition)}`
    case 'if':
      return `Si ${describeExpr(step.condition)}`
    case 'repeat':
      return `Répéter ${describeExpr(step.times)} fois`
    case 'while':
      return `Répéter ${step.until ? 'jusqu’à ce que' : 'tant que'} ${describeExpr(step.condition)}`
    case 'setVariable':
      return `${step.name} ← ${describeExpr(step.value)}`
    case 'changeVariable':
      return `${step.name} += ${describeExpr(step.by)}`
    case 'stop':
      return 'Arrêter le script'
    case 'reload':
      return 'Actualiser la page'
    case 'log':
      return `Journal : ${describeExpr(step.message)}`
    case 'clickElement':
      return `Cliquer sur ${describeTarget(step.target)}`
    case 'clickAt':
      return `Cliquer ici (${step.point.xPercent} %, ${step.point.yPercent} %)`
    case 'wait':
      return `Attendre ${step.durationMs / 1000} s`
    case 'typeText':
      return `Écrire « ${step.text} » dans ${describeTarget(step.target)}`
  }
}
