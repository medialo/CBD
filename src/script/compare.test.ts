import { describe, expect, it } from 'vitest'
import { compareValues, toNumber } from './compare'

describe('toNumber', () => {
  it.each([
    ['0', 0],
    [' 00:00 ', 0],
    ['01:30', 90],
    ['1:00:05', 3605],
    ['1 234,5', 1234.5],
    ['-3', -3],
    ['abc', null],
    ['10 €', null],
  ])('%s → %s', (text, expected) => {
    expect(toNumber(text)).toBe(expected)
  })
})

describe('compareValues', () => {
  it('compare numériquement quand c’est possible', () => {
    expect(compareValues('00:00', 'eq', '0')).toBe(true)
    expect(compareValues('00:05', 'gt', '0')).toBe(true)
    expect(compareValues('4', 'lt', '10')).toBe(true)
  })

  it('compare le texte sinon', () => {
    expect(compareValues('  Épuisé ', 'eq', 'Épuisé')).toBe(true)
    expect(compareValues('Épuisé', 'neq', 'Disponible')).toBe(true)
    expect(compareValues('Promo DISPONIBLE', 'contains', 'disponible')).toBe(true)
    expect(compareValues('abc', 'lt', '3')).toBe(false)
  })
})
