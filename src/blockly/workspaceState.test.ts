import { describe, expect, it } from 'vitest'
import type { Step, Trigger } from '../script/model'
import { fromWorkspace, toWorkspace, type WorkspaceState } from './workspaceState'

describe('toWorkspace / fromWorkspace', () => {
  it('fait l’aller-retour sans perte', () => {
    const trigger: Trigger = { kind: 'elementAppears', target: { selector: '#popup' } }
    const steps: Step[] = [
      {
        kind: 'waitUntil',
        condition: { kind: 'elementValue', target: { selector: '#counter' }, op: 'eq', value: '0' },
        timeoutMs: 0,
      },
      {
        kind: 'if',
        condition: { kind: 'elementVisible', target: { selector: '#promo-btn', fallbackText: 'Profiter' } },
        then: [{ kind: 'clickElement', target: { selector: '#promo-btn', fallbackText: 'Profiter' }, timeoutMs: 5000 }],
        else: [
          { kind: 'clickAt', point: { xPercent: 50, yPercent: 92.5 } },
          { kind: 'wait', durationMs: 1500 },
        ],
      },
      { kind: 'typeText', target: { selector: 'input[name="code"]' }, text: 'PROMO', timeoutMs: 2000 },
    ]

    expect(fromWorkspace(toWorkspace(trigger, steps))).toEqual({ ok: true, trigger, steps })
  })

  it('fait l’aller-retour des blocs de programmation (logique, boucles, variables, texte)', () => {
    const trigger: Trigger = { kind: 'interval', everyMs: 2000 }
    const steps: Step[] = [
      { kind: 'setVariable', name: 'essais', value: { kind: 'literal', value: 0 } },
      {
        kind: 'while',
        until: false,
        condition: {
          kind: 'logic',
          op: 'and',
          left: { kind: 'not', operand: { kind: 'elementExists', target: { selector: '#promo-btn' } } },
          right: { kind: 'compare', op: 'lt', left: { kind: 'variable', name: 'essais' }, right: { kind: 'literal', value: 20 } },
        },
        steps: [
          { kind: 'wait', durationMs: 500 },
          { kind: 'changeVariable', name: 'essais', by: { kind: 'literal', value: 1 } },
        ],
      },
      {
        kind: 'if',
        condition: { kind: 'compare', op: 'gte', left: { kind: 'variable', name: 'essais' }, right: { kind: 'literal', value: 20 } },
        then: [{ kind: 'reload' }],
        else: [],
      },
      {
        kind: 'repeat',
        times: { kind: 'arithmetic', op: 'sub', left: { kind: 'readElement', target: { selector: '#qty' } }, right: { kind: 'literal', value: 1 } },
        steps: [{ kind: 'clickElement', target: { selector: '#plus' }, timeoutMs: 0 }],
      },
      {
        kind: 'log',
        message: { kind: 'join', parts: [{ kind: 'literal', value: 'essais : ' }, { kind: 'variable', name: 'essais' }, { kind: 'literal', value: true }] },
      },
      { kind: 'stop' },
    ]

    const state = toWorkspace(trigger, steps)
    expect(state.variables).toEqual([{ id: 'var:essais', name: 'essais' }])
    expect(fromWorkspace(state)).toEqual({ ok: true, trigger, steps })
  })

  it('lit les valeurs par défaut (shadow) et les variables créées dans Blockly', () => {
    const result = fromWorkspace({
      variables: [{ id: 'k3x!', name: 'compteur' }],
      blocks: {
        blocks: [
          {
            type: 'trigger_page_loaded',
            next: {
              block: {
                type: 'controls_repeat_ext',
                inputs: {
                  TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
                  DO: { block: { type: 'math_change', fields: { VAR: { id: 'k3x!' } }, inputs: { DELTA: { shadow: { type: 'math_number', fields: { NUM: 1 } } } } } },
                },
              },
            },
          },
        ],
      },
    })
    expect(result).toEqual({
      ok: true,
      trigger: { kind: 'pageLoaded' },
      steps: [
        {
          kind: 'repeat',
          times: { kind: 'literal', value: 10 },
          steps: [{ kind: 'changeVariable', name: 'compteur', by: { kind: 'literal', value: 1 } }],
        },
      ],
    })
  })

  it('oublie le texte capturé si le sélecteur a été modifié à la main', () => {
    const state: WorkspaceState = {
      blocks: {
        blocks: [
          {
            type: 'trigger_page_loaded',
            next: {
              block: {
                type: 'step_click_element',
                fields: { SELECTOR: '#new', TIMEOUT: 1 },
                data: JSON.stringify({ selector: '#old', text: 'Profiter' }),
              },
            },
          },
        ],
      },
    }
    const result = fromWorkspace(state)
    expect(result.ok && result.steps[0]).toEqual({ kind: 'clickElement', target: { selector: '#new' }, timeoutMs: 1000 })
  })

  it('ignore les blocs désactivés', () => {
    const result = fromWorkspace({
      blocks: {
        blocks: [
          {
            type: 'trigger_page_loaded',
            next: { block: { type: 'step_wait', enabled: false, fields: { SECONDS: 1 }, next: { block: { type: 'step_wait', fields: { SECONDS: 2 } } } } },
          },
        ],
      },
    })
    expect(result.ok && result.steps).toEqual([{ kind: 'wait', durationMs: 2000 }])
  })

  it.each<[string, WorkspaceState, string]>([
    ['sans déclencheur', { blocks: { blocks: [{ type: 'step_wait' }] } }, 'déclencheur'],
    ['deux déclencheurs', { blocks: { blocks: [{ type: 'trigger_page_loaded' }, { type: 'trigger_page_loaded' }] } }, 'seul'],
    ['bloc orphelin', { blocks: { blocks: [{ type: 'trigger_page_loaded' }, { type: 'step_wait' }] } }, 'reliés'],
    [
      'condition manquante',
      { blocks: { blocks: [{ type: 'trigger_page_loaded', next: { block: { type: 'step_wait_until' } } }] } },
      'incomplet',
    ],
    [
      'et / ou incomplet',
      {
        blocks: {
          blocks: [
            {
              type: 'trigger_page_loaded',
              next: {
                block: {
                  type: 'step_if',
                  inputs: { COND: { block: { type: 'logic_operation', fields: { OP: 'AND' }, inputs: { A: { block: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } } } } } },
                },
              },
            },
          ],
        },
      },
      'et / ou',
    ],
  ])('signale une erreur : %s', (_, state, fragment) => {
    const result = fromWorkspace(state)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors.join(' ')).toContain(fragment)
  })
})
