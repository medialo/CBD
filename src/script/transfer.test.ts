import { describe, expect, it } from 'vitest'
import type { Script } from './model'
import { exportFileName, exportScripts, parseScripts } from './transfer'

const promo: Script = {
  id: 'a1',
  name: 'Vente flash',
  sitePattern: '*://shop.example.com/*',
  enabled: true,
  trigger: { kind: 'pageLoaded' },
  steps: [
    {
      kind: 'waitUntil',
      condition: {
        kind: 'logic',
        op: 'and',
        left: { kind: 'compare', op: 'eq', left: { kind: 'readElement', target: { selector: '#counter' } }, right: { kind: 'literal', value: 0 } },
        right: { kind: 'not', operand: { kind: 'elementExists', target: { selector: '.sold-out', fallbackText: 'Épuisé' } } },
      },
      timeoutMs: 0,
    },
    {
      kind: 'if',
      condition: { kind: 'elementValue', target: { selector: '#stock' }, op: 'contains', value: 'en stock' },
      then: [{ kind: 'clickElement', target: { selector: '#promo-btn' }, timeoutMs: 5000 }],
      else: [{ kind: 'clickAt', point: { xPercent: 80, yPercent: 20 } }, { kind: 'reload' }],
    },
    {
      kind: 'repeat',
      times: { kind: 'literal', value: 3 },
      steps: [
        { kind: 'changeVariable', name: 'n', by: { kind: 'arithmetic', op: 'mul', left: { kind: 'variable', name: 'n' }, right: { kind: 'literal', value: 2 } } },
        { kind: 'log', message: { kind: 'join', parts: [{ kind: 'literal', value: 'n = ' }, { kind: 'variable', name: 'n' }] } },
      ],
    },
    { kind: 'while', condition: { kind: 'elementVisible', target: { selector: '#spinner' } }, until: true, steps: [{ kind: 'wait', durationMs: 500 }] },
    { kind: 'setVariable', name: 'n', value: { kind: 'literal', value: true } },
    { kind: 'typeText', target: { selector: '#code' }, text: 'PROMO', timeoutMs: 0 },
    { kind: 'stop' },
  ],
}

const ticker: Script = { ...promo, id: 'b2', name: 'Relevé', enabled: false, trigger: { kind: 'interval', everyMs: 1000 }, steps: [{ kind: 'stop' }] }

describe('export / import de scripts', () => {
  it('relit à l’identique ce qui a été exporté', () => {
    const text = exportScripts([promo, ticker], new Date('2026-10-26T10:00:00Z'))
    expect(JSON.parse(text)).toMatchObject({ format: 'cbd', version: 1, exportedAt: '2026-10-26T10:00:00.000Z' })
    expect(parseScripts(text)).toEqual({ ok: true, scripts: [promo, ticker] })
  })

  it('accepte les exports faits avant le renommage (« Smart Click »)', () => {
    const legacy = JSON.stringify({ format: 'smart-click', version: 1, exportedAt: '2026-10-26T10:00:00.000Z', scripts: [ticker] })
    expect(parseScripts(legacy)).toEqual({ ok: true, scripts: [ticker] })
  })

  it('accepte un script seul ou un tableau de scripts', () => {
    expect(parseScripts(JSON.stringify(promo))).toEqual({ ok: true, scripts: [promo] })
    expect(parseScripts(JSON.stringify([ticker]))).toEqual({ ok: true, scripts: [ticker] })
  })

  it('ignore les champs inconnus', () => {
    const extra = { ...ticker, author: 'x', trigger: { ...ticker.trigger, color: 'red' } }
    expect(parseScripts(JSON.stringify([extra]))).toEqual({ ok: true, scripts: [ticker] })
  })

  it.each([
    ['du texte', 'pas du json', 'pas un JSON valide'],
    ['un autre JSON', '{"hello": 1}', 'pas un export CBD'],
    ['une liste vide', '[]', 'aucun script'],
    ['une version future', JSON.stringify({ format: 'cbd', version: 99, scripts: [promo] }), 'plus récente'],
    ['une action inconnue', JSON.stringify([{ ...ticker, steps: [{ kind: 'explode' }] }]), 'scripts[0].steps[0].kind — une action connue'],
    ['un opérateur inconnu', JSON.stringify([{ ...ticker, steps: [{ kind: 'waitUntil', timeoutMs: 0, condition: { kind: 'compare', op: 'contains', left: { kind: 'literal', value: 1 }, right: { kind: 'literal', value: 1 } } }] }]), 'scripts[0].steps[0].condition.op'],
    ['un nombre manquant', JSON.stringify([{ ...ticker, trigger: { kind: 'interval' } }]), 'scripts[0].trigger.everyMs — un nombre'],
    ['des identifiants en double', JSON.stringify([ticker, ticker]), 'même identifiant'],
  ])('refuse %s', (_label, text, message) => {
    const result = parseScripts(text)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(message)
  })

  it('propose un nom de fichier', () => {
    const now = new Date('2026-10-26T10:00:00Z')
    expect(exportFileName([{ ...promo, name: 'Vente flash — été !' }], now)).toBe('cbd-vente-flash-ete.json')
    expect(exportFileName([promo, ticker], now)).toBe('cbd-scripts-2026-10-26.json')
  })
})
