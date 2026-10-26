import type { CompareOp } from './model'

/**
 * Compare la valeur lue dans la page à la valeur attendue.
 * Si les deux côtés sont numériques (y compris un chrono `01:30` ou `1 234,5`),
 * la comparaison est numérique ; sinon elle porte sur le texte.
 */
export function compareValues(actual: string, op: CompareOp, expected: string): boolean {
  const a = toNumber(actual)
  const e = toNumber(expected)
  const numeric = a !== null && e !== null
  switch (op) {
    case 'eq':
      return numeric ? a === e : normalize(actual) === normalize(expected)
    case 'neq':
      return !compareValues(actual, 'eq', expected)
    case 'lt':
      return numeric && a < e
    case 'gt':
      return numeric && a > e
    case 'lte':
      return numeric && a <= e
    case 'gte':
      return numeric && a >= e
    case 'contains':
      return normalize(actual).toLowerCase().includes(normalize(expected).toLowerCase())
  }
}

/** `"00:00"` → 0, `"01:30"` → 90 (secondes), `"1 234,5"` → 1234.5, `"abc"` → null. */
export function toNumber(text: string): number | null {
  const value = normalize(text).replace(/[\s ]/g, '')
  if (/^\d+(:\d{1,2})+$/.test(value)) {
    return value.split(':').reduce((total, part) => total * 60 + Number(part), 0)
  }
  if (/^-?\d+([.,]\d+)?$/.test(value)) return Number(value.replace(',', '.'))
  return null
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
