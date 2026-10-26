import { describe, expect, it, vi } from 'vitest'
import type { Script, Step } from './model'
import { startScript, type RunEvent } from './runner'
import { FakePageDriver } from './testing/FakePageDriver'

const script = (steps: Step[], overrides: Partial<Script> = {}): Script => ({
  id: 's1',
  name: 'Promo',
  sitePattern: '*://shop.test/*',
  enabled: true,
  trigger: { kind: 'pageLoaded' },
  steps,
  ...overrides,
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function run(s: Script, page: FakePageDriver) {
  const events: RunEvent[] = []
  const { stop } = startScript(s, page, (e) => events.push(e))
  const last = () => events.at(-1)
  return { events, stop, last }
}

describe('startScript', () => {
  it('attend que le chrono atteigne 0 puis clique sur un bouton apparu tardivement', async () => {
    const page = new FakePageDriver()
    page.set('#counter', { value: '00:03' })
    const { last } = run(
      script([
        { kind: 'waitUntil', condition: { kind: 'elementValue', target: { selector: '#counter' }, op: 'eq', value: '0' }, timeoutMs: 0 },
        { kind: 'clickElement', target: { selector: '#promo-btn' }, timeoutMs: 0 },
      ]),
      page,
    )

    await tick()
    page.set('#counter', { value: '00:01' })
    await tick()
    expect(page.clicks).toEqual([])

    page.set('#counter', { value: '00:00' })
    await tick()
    expect(page.clicks).toEqual([])

    page.set('#promo-btn', { disabled: true })
    await tick()
    expect(page.clicks).toEqual([])

    page.set('#promo-btn', { disabled: false })
    await tick()
    expect(page.clicks).toEqual(['#promo-btn'])
    expect(last()).toMatchObject({ level: 'success', message: 'Terminé' })
  })

  it('signale un délai dépassé', async () => {
    const page = new FakePageDriver()
    const { last } = run(script([{ kind: 'clickElement', target: { selector: '#absent' }, timeoutMs: 20 }]), page)
    await vi.waitFor(() => expect(last()?.level).toBe('error'))
    expect(last()?.message).toContain('#absent')
  })

  it('exécute la branche « sinon » quand la condition est fausse', async () => {
    const page = new FakePageDriver()
    page.set('#stock', { value: 'Épuisé' })
    run(
      script([
        {
          kind: 'if',
          condition: { kind: 'elementValue', target: { selector: '#stock' }, op: 'contains', value: 'disponible' },
          then: [{ kind: 'clickElement', target: { selector: '#buy' }, timeoutMs: 0 }],
          else: [{ kind: 'clickAt', point: { xPercent: 50, yPercent: 10 } }],
        },
      ]),
      page,
    )
    await tick()
    expect(page.clicks).toEqual(['@50,10'])
  })

  it('relance le script à chaque apparition de l’élément déclencheur', async () => {
    const page = new FakePageDriver()
    run(
      script([{ kind: 'clickElement', target: { selector: '#popup .close' }, timeoutMs: 0 }], {
        trigger: { kind: 'elementAppears', target: { selector: '#popup' } },
      }),
      page,
    )
    for (let i = 0; i < 2; i++) {
      page.set('#popup', {})
      page.set('#popup .close', {})
      await tick()
      page.set('#popup', null)
      page.set('#popup .close', null)
      await tick()
    }
    expect(page.clicks).toEqual(['#popup .close', '#popup .close'])
  })

  it('combine et / ou / non avec court-circuit', async () => {
    const page = new FakePageDriver()
    page.set('#stock', { value: 'Épuisé' })
    const readsBeforeShortCircuit = vi.spyOn(page, 'isVisible')
    run(
      script([
        {
          kind: 'if',
          condition: {
            kind: 'logic',
            op: 'or',
            left: { kind: 'not', operand: { kind: 'elementExists', target: { selector: '#buy' } } },
            right: { kind: 'elementVisible', target: { selector: '#buy' } },
          },
          then: [{ kind: 'clickAt', point: { xPercent: 1, yPercent: 1 } }],
          else: [],
        },
        {
          kind: 'if',
          condition: {
            kind: 'logic',
            op: 'and',
            left: { kind: 'compare', op: 'eq', left: { kind: 'readElement', target: { selector: '#stock' } }, right: { kind: 'literal', value: 'Épuisé' } },
            right: { kind: 'literal', value: false },
          },
          then: [{ kind: 'clickAt', point: { xPercent: 2, yPercent: 2 } }],
          else: [],
        },
      ]),
      page,
    )
    await tick()
    expect(page.clicks).toEqual(['@1,1'])
    expect(readsBeforeShortCircuit).not.toHaveBeenCalled()
  })

  it('répète N fois avec une variable compteur et un calcul', async () => {
    const page = new FakePageDriver()
    const { events } = run(
      script([
        { kind: 'setVariable', name: 'n', value: { kind: 'literal', value: 0 } },
        {
          kind: 'repeat',
          times: { kind: 'arithmetic', op: 'mul', left: { kind: 'literal', value: 2 }, right: { kind: 'literal', value: 2 } },
          steps: [{ kind: 'changeVariable', name: 'n', by: { kind: 'literal', value: 1 } }],
        },
        { kind: 'log', message: { kind: 'join', parts: [{ kind: 'literal', value: 'n = ' }, { kind: 'variable', name: 'n' }] } },
      ]),
      page,
    )
    await vi.waitFor(() => expect(events.at(-1)?.message).toBe('Terminé'))
    expect(events.map((e) => e.message)).toContain('n = 4')
  })

  it('boucle tant que / jusqu’à ce que, puis s’arrête sur « Arrêter le script »', async () => {
    const page = new FakePageDriver()
    page.set('#counter', { value: '00:03' })
    const { events } = run(
      script([
        {
          kind: 'while',
          until: true,
          condition: { kind: 'compare', op: 'lte', left: { kind: 'readElement', target: { selector: '#counter' } }, right: { kind: 'literal', value: 0 } },
          steps: [{ kind: 'wait', durationMs: 5 }],
        },
        { kind: 'stop' },
        { kind: 'clickElement', target: { selector: '#never' }, timeoutMs: 0 },
      ]),
      page,
    )
    await tick()
    page.set('#counter', { value: '00:00' })
    await vi.waitFor(() => expect(events.at(-1)?.message).toContain('Arrêté'))
    expect(page.clicks).toEqual([])
  })

  it('garde les variables d’un déclenchement à l’autre', async () => {
    const page = new FakePageDriver()
    const { events, stop } = run(
      script(
        [
          { kind: 'changeVariable', name: 'passages', by: { kind: 'literal', value: 1 } },
          { kind: 'log', message: { kind: 'variable', name: 'passages' } },
        ],
        { trigger: { kind: 'interval', everyMs: 5 } },
      ),
      page,
    )
    await vi.waitFor(() => expect(events.map((e) => e.message)).toContain('3'))
    stop()
  })

  it('actualise la page et n’exécute rien après', async () => {
    const page = new FakePageDriver()
    const { events } = run(
      script([
        {
          kind: 'if',
          condition: { kind: 'not', operand: { kind: 'elementExists', target: { selector: '#promo-btn' } } },
          then: [{ kind: 'reload' }],
          else: [],
        },
        { kind: 'clickAt', point: { xPercent: 1, yPercent: 1 } },
      ]),
      page,
    )
    await tick()
    expect(page.reloads).toBe(1)
    expect(page.clicks).toEqual([])
    expect(events.map((e) => e.message)).toContain('Actualiser la page')
    expect(events.map((e) => e.message)).not.toContain('Terminé')
  })

  it('s’arrête sans journaliser d’erreur', async () => {
    const page = new FakePageDriver()
    const { events, stop } = run(script([{ kind: 'clickElement', target: { selector: '#never' }, timeoutMs: 0 }]), page)
    await tick()
    stop()
    await tick()
    expect(events.filter((e) => e.level === 'error')).toEqual([])
  })
})
