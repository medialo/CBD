// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildSelector, visibleText } from './selectorBuilder'

function selectorFor(html: string, pick: string): string {
  document.body.innerHTML = html
  const element = document.querySelector(pick)!
  const selector = buildSelector(element)
  expect(document.querySelectorAll(selector)).toHaveLength(1)
  expect(document.querySelector(selector)).toBe(element)
  return selector
}

describe('buildSelector', () => {
  it('préfère un id stable', () => {
    expect(selectorFor('<button id="promo-btn">Go</button>', 'button')).toBe('#promo-btn')
  })

  it('ignore un id généré et utilise un attribut stable', () => {
    expect(selectorFor('<button id="ember1234" data-testid="buy">Go</button>', 'button')).toBe('button[data-testid="buy"]')
  })

  it('construit un chemin depuis l’ancêtre stable le plus proche', () => {
    const selector = selectorFor(
      `<div id="offers"><div><button>A</button><button>B</button></div></div><div><button>C</button></div>`,
      '#offers button:nth-of-type(2)',
    )
    expect(selector).toBe('#offers > div > button:nth-of-type(2)')
  })

  it('reste unique sans aucun attribut', () => {
    selectorFor('<ul><li>a</li><li><span>b</span></li></ul><ul><li><span>c</span></li></ul>', 'ul:nth-of-type(2) span')
  })
})

describe('visibleText', () => {
  it('garde un texte court et ignore les longs', () => {
    document.body.innerHTML = `<button> Profiter \n maintenant </button><p>${'x'.repeat(80)}</p>`
    expect(visibleText(document.querySelector('button')!)).toBe('Profiter maintenant')
    expect(visibleText(document.querySelector('p')!)).toBeUndefined()
  })
})
