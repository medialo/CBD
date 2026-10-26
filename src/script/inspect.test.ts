import { describe, expect, it } from 'vitest'
import { inspectScript } from './inspect'
import type { Expr, Script } from './model'

const counterIsZero: Expr = {
  kind: 'compare',
  op: 'eq',
  left: { kind: 'readElement', target: { selector: '#counter' } },
  right: { kind: 'literal', value: 0 },
}

const script: Script = {
  id: 's',
  name: 'Promo',
  sitePattern: '*://shop.test/*',
  enabled: true,
  trigger: { kind: 'elementAppears', target: { selector: '#popup' } },
  steps: [
    {
      kind: 'while',
      until: false,
      condition: {
        kind: 'logic',
        op: 'and',
        left: { kind: 'not', operand: { kind: 'elementExists', target: { selector: '#promo-btn' } } },
        right: { kind: 'compare', op: 'lt', left: { kind: 'variable', name: 'n' }, right: { kind: 'literal', value: 50 } },
      },
      steps: [{ kind: 'clickAt', point: { xPercent: 10, yPercent: 20 } }],
    },
    { kind: 'waitUntil', condition: counterIsZero, timeoutMs: 0 },
    {
      kind: 'if',
      condition: counterIsZero,
      then: [{ kind: 'clickElement', target: { selector: '#promo-btn' }, timeoutMs: 0 }],
      else: [{ kind: 'repeat', times: { kind: 'literal', value: 2 }, steps: [{ kind: 'typeText', target: { selector: '#code' }, text: 'X', timeoutMs: 0 }] }],
    },
  ],
}

describe('inspectScript', () => {
  it('liste ce que le script touche dans la page, conditions décomposées et sans doublon', () => {
    const items = inspectScript(script)
    expect(items.map((item) => item.kind)).toEqual(['trigger', 'condition', 'condition', 'clickAt', 'condition', 'click', 'type'])

    const conditions = items.filter((item) => item.kind === 'condition')
    expect(conditions.map((c) => c.condition.kind)).toEqual(['elementExists', 'compare', 'compare'])
    expect(conditions.map((c) => c.targets.map((t) => t.selector))).toEqual([['#promo-btn'], [], ['#counter']])
  })
})
