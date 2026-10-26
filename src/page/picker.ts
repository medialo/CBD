import { buildSelector, visibleText } from './selectorBuilder'

export type PickMode = 'element' | 'point'

export type PickResult =
  | { kind: 'element'; selector: string; text?: string }
  | { kind: 'point'; xPercent: number; yPercent: number }

const BLOCKED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'] as const

/**
 * Affiche le mode pointer dans la page et résout avec l'élément (ou le point) cliqué,
 * ou `null` si l'utilisateur appuie sur Échap. Les clics sont interceptés : la page ne les reçoit pas.
 */
export function pick(mode: PickMode): Promise<PickResult | null> {
  const host = document.createElement('cbd-picker')
  host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;'
  const root = host.attachShadow({ mode: 'closed' })
  root.innerHTML = `
    <style>
      .banner { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); padding: 8px 14px;
        border-radius: 8px; background: #1e1b4b; color: #fff; font: 14px/1.4 system-ui, sans-serif;
        box-shadow: 0 4px 16px rgb(0 0 0 / .3); }
      .box { position: fixed; border: 2px solid #6366f1; background: rgb(99 102 241 / .15);
        border-radius: 3px; transition: all 60ms ease-out; display: none; }
    </style>
    <div class="banner">${
      mode === 'element' ? 'Cliquez sur l’élément à cibler' : 'Cliquez à l’endroit où cliquer'
    } — Échap pour annuler</div>
    <div class="box"></div>`
  const box = root.querySelector<HTMLDivElement>('.box')!
  document.documentElement.append(host)
  const previousCursor = document.documentElement.style.cursor
  document.documentElement.style.cursor = 'crosshair'

  return new Promise((resolve) => {
    const finish = (result: PickResult | null) => {
      for (const type of BLOCKED_EVENTS) window.removeEventListener(type, onBlocked, true)
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('keydown', onKey, true)
      document.documentElement.style.cursor = previousCursor
      host.remove()
      resolve(result)
    }

    const onMove = (event: MouseEvent) => {
      if (mode !== 'element') return
      const target = event.target as Element
      const rect = target.getBoundingClientRect()
      Object.assign(box.style, {
        display: 'block',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      })
    }

    const onBlocked = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.type !== 'click') return
      const { clientX, clientY, target } = event as MouseEvent
      if (mode === 'point') {
        const round = (value: number) => Math.round(value * 10) / 10
        finish({
          kind: 'point',
          xPercent: round((clientX / window.innerWidth) * 100),
          yPercent: round((clientY / window.innerHeight) * 100),
        })
      } else {
        const element = target as Element
        finish({ kind: 'element', selector: buildSelector(element), text: visibleText(element) })
      }
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      finish(null)
    }

    for (const type of BLOCKED_EVENTS) window.addEventListener(type, onBlocked, true)
    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('keydown', onKey, true)
  })
}
