import { describeStep } from './describe'
import type { Expr, Script, Step, Target, Trigger } from './model'
import { isValidSitePattern } from './sitePattern'

const MIN_INTERVAL_MS = 100

/** Retourne la liste des problèmes (vide si le script est exécutable). */
export function validateScript(script: Script): string[] {
  const errors: string[] = []
  if (script.name.trim() === '') errors.push('Le script doit avoir un nom.')
  if (!isValidSitePattern(script.sitePattern)) {
    errors.push(`Motif de site invalide : « ${script.sitePattern} » (ex. *://*.example.com/*).`)
  }
  errors.push(...validateTrigger(script.trigger))
  if (script.steps.length === 0) errors.push('Ajoutez au moins une action sous le déclencheur.')
  script.steps.forEach((step) => errors.push(...validateStep(step)))
  return errors
}

function validateTrigger(trigger: Trigger): string[] {
  switch (trigger.kind) {
    case 'pageLoaded':
      return []
    case 'elementAppears':
      return validateTarget(trigger.target, 'Déclencheur « apparaît »')
    case 'interval':
      return trigger.everyMs >= MIN_INTERVAL_MS ? [] : ['L’intervalle doit être d’au moins 0,1 s.']
  }
}

function validateStep(step: Step): string[] {
  const where = describeStep(step)
  switch (step.kind) {
    case 'waitUntil':
      return [...validateExpr(step.condition, where), ...validateDuration(step.timeoutMs, where)]
    case 'if':
      return [
        ...validateExpr(step.condition, where),
        ...step.then.flatMap(validateStep),
        ...step.else.flatMap(validateStep),
      ]
    case 'repeat':
      return [...validateExpr(step.times, where), ...step.steps.flatMap(validateStep)]
    case 'while':
      return [...validateExpr(step.condition, where), ...step.steps.flatMap(validateStep)]
    case 'setVariable':
      return [...validateVariable(step.name, where), ...validateExpr(step.value, where)]
    case 'changeVariable':
      return [...validateVariable(step.name, where), ...validateExpr(step.by, where)]
    case 'stop':
    case 'reload':
      return []
    case 'log':
      return validateExpr(step.message, where)
    case 'clickElement':
      return [...validateTarget(step.target, where), ...validateDuration(step.timeoutMs, where)]
    case 'clickAt': {
      const { xPercent, yPercent } = step.point
      const inside = (v: number) => v >= 0 && v <= 100
      return inside(xPercent) && inside(yPercent) ? [] : [`${where} : x et y doivent être entre 0 et 100 %.`]
    }
    case 'wait':
      return validateDuration(step.durationMs, where)
    case 'typeText':
      return [...validateTarget(step.target, where), ...validateDuration(step.timeoutMs, where)]
  }
}

function validateExpr(expr: Expr, where: string): string[] {
  switch (expr.kind) {
    case 'literal':
      return []
    case 'variable':
      return validateVariable(expr.name, where)
    case 'arithmetic':
    case 'compare':
    case 'logic':
      return [...validateExpr(expr.left, where), ...validateExpr(expr.right, where)]
    case 'join':
      return expr.parts.flatMap((part) => validateExpr(part, where))
    case 'not':
      return validateExpr(expr.operand, where)
    case 'readElement':
    case 'elementValue':
    case 'elementExists':
    case 'elementVisible':
      return validateTarget(expr.target, where)
  }
}

function validateVariable(name: string, where: string): string[] {
  return name.trim() === '' ? [`${where} : variable sans nom.`] : []
}

function validateTarget(target: Target, where: string): string[] {
  if (target.selector.trim() === '') return [`${where} : choisissez un élément de la page.`]
  return isValidCssSelector(target.selector) ? [] : [`${where} : sélecteur CSS invalide.`]
}

function validateDuration(ms: number, where: string): string[] {
  return Number.isFinite(ms) && ms >= 0 ? [] : [`${where} : la durée doit être positive.`]
}

/** Vérifié seulement si un DOM est disponible (éditeur, page) ; ailleurs, accepté tel quel. */
function isValidCssSelector(selector: string): boolean {
  if (typeof document === 'undefined') return true
  try {
    document.createDocumentFragment().querySelector(selector)
    return true
  } catch {
    return false
  }
}
