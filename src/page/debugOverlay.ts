import { OPS } from '../script/describe'
import { inspectScript, type DebugItem } from '../script/inspect'
import type { Expr, Script, Target, Value } from '../script/model'
import { asBoolean, asText, type ScriptHandle } from '../script/runner'
import type { DomPageDriver } from './DomPageDriver'

// Mode débug : dessine par-dessus la page ce que les scripts ciblent, où ils vont cliquer,
// et l'état (vrai / faux) de leurs conditions. Le calque ne capte aucun événement : le survol
// des conditions est détecté en suivant la souris au niveau du document.

export interface DebuggedScript {
  readonly script: Script
  readonly handle: ScriptHandle
}

/** Zone survolable d'une condition : son contour et le détail affiché dans l'infobulle. */
interface Hoverable {
  readonly rect: DOMRect
  readonly color: string
  readonly title: string
  readonly detail: string
}

const REFRESH_MS = 200

/**
 * Styles de l'hôte, en ligne et `!important` pour résister aux CSS du site. L'hôte est un popover
 * affiché dans la « top layer » : au-dessus de tout élément de la page, quel que soit son z-index.
 */
const HOST_STYLE: Record<string, string> = {
  all: 'initial',
  position: 'fixed',
  inset: '0',
  width: '100vw',
  height: '100vh',
  margin: '0',
  padding: '0',
  border: '0',
  background: 'transparent',
  overflow: 'visible',
  'pointer-events': 'none',
  'z-index': '2147483647',
}

const STYLE = `
  .layer { position: fixed; inset: 0; pointer-events: none; font: 12px/1.3 system-ui, sans-serif; }
  .box { position: fixed; box-sizing: border-box; border: 2px solid var(--c); border-radius: 3px;
    background: color-mix(in srgb, var(--c) 10%, transparent); }
  .box.action { border-style: dashed; }
  .box.outline { border-width: 3px; background: none; box-shadow: 0 0 0 1px rgb(255 255 255 / .7); }
  .tip { position: fixed; max-width: 360px; padding: 6px 8px; border-radius: 6px; border-left: 4px solid var(--c);
    background: rgb(17 24 39 / .94); color: #f9fafb; box-shadow: 0 2px 8px rgb(0 0 0 / .3); }
  .tip p { margin: 0; } .tip p + p { margin-top: 2px; } .tip strong { color: var(--c); }
  .tag { position: fixed; max-width: 360px; padding: 2px 6px; border-radius: 4px; background: var(--c);
    color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 1px 4px rgb(0 0 0 / .25); }
  .cross { position: fixed; width: 22px; height: 22px; margin: -11px 0 0 -11px; border: 2px solid var(--c);
    border-radius: 50%; box-sizing: border-box; background: rgb(255 255 255 / .6); }
  .cross::before, .cross::after { content: ''; position: absolute; background: var(--c); }
  .cross::before { left: 50%; top: -6px; bottom: -6px; width: 2px; margin-left: -1px; }
  .cross::after { top: 50%; left: -6px; right: -6px; height: 2px; margin-top: -1px; }
  .panel { position: fixed; left: 8px; bottom: 8px; max-width: min(420px, calc(100vw - 16px)); max-height: 40vh;
    overflow: hidden; padding: 6px 8px; border-radius: 8px; background: rgb(17 24 39 / .88); color: #f9fafb; }
  .panel h1 { margin: 0 0 4px; font-size: 12px; font-weight: 700; }
  .panel p { margin: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .true { color: #4ade80; } .false { color: #f87171; } .muted { color: #9ca3af; }
`

const COLORS = {
  true: '#16a34a',
  false: '#dc2626',
  action: '#2563eb',
  pending: '#ea580c',
  trigger: '#9333ea',
}

export class DebugOverlay {
  private host: HTMLElement | null = null
  private layer: HTMLDivElement | null = null
  private timer: ReturnType<typeof setInterval> | undefined
  private tip: HTMLElement | null = null
  private scripts: readonly DebuggedScript[] = []
  private hoverables: Hoverable[] = []
  private pointer: { x: number; y: number } | null = null
  private readonly onViewportChange = () => this.render()
  private readonly onPointerMove = (event: PointerEvent) => {
    this.pointer = { x: event.clientX, y: event.clientY }
    this.renderTip()
  }
  private readonly onPointerLeave = () => {
    this.pointer = null
    this.renderTip()
  }

  constructor(private readonly driver: DomPageDriver) {}

  get active(): boolean {
    return this.host !== null
  }

  setScripts(scripts: readonly DebuggedScript[]): void {
    this.scripts = scripts
    this.render()
  }

  start(): void {
    if (this.host) return
    this.host = document.createElement('cbd-debug')
    for (const [property, value] of Object.entries(HOST_STYLE)) this.host.style.setProperty(property, value, 'important')
    this.host.setAttribute('popover', 'manual')
    const root = this.host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = STYLE
    this.layer = document.createElement('div')
    this.layer.className = 'layer'
    this.tip = el('div', '', 'tip')
    root.append(style, this.layer)
    document.documentElement.append(this.host)
    this.timer = setInterval(() => this.render(), REFRESH_MS)
    window.addEventListener('scroll', this.onViewportChange, { capture: true, passive: true })
    window.addEventListener('resize', this.onViewportChange, { passive: true })
    document.addEventListener('pointermove', this.onPointerMove, { capture: true, passive: true })
    document.documentElement.addEventListener('pointerleave', this.onPointerLeave, { passive: true })
    this.render()
  }

  stop(): void {
    clearInterval(this.timer)
    window.removeEventListener('scroll', this.onViewportChange, { capture: true })
    window.removeEventListener('resize', this.onViewportChange)
    document.removeEventListener('pointermove', this.onPointerMove, { capture: true })
    document.documentElement.removeEventListener('pointerleave', this.onPointerLeave)
    this.host?.remove()
    this.host = null
    this.layer = null
    this.tip = null
    this.hoverables = []
  }

  /**
   * Garde le calque dans la top layer. Un popover ou une boîte de dialogue ouvert ensuite par le site
   * passerait au-dessus : on referme puis rouvre le nôtre pour repasser en tête.
   */
  private raise(): void {
    const host = this.host
    if (!host?.isConnected || typeof host.showPopover !== 'function') return
    try {
      const open = host.matches(':popover-open')
      const others = [...document.querySelectorAll(':popover-open, dialog:modal, :fullscreen')].some((node) => node !== host)
      if (open && !others) return
      if (open) host.hidePopover()
      host.showPopover()
    } catch {
      // top layer indisponible (document en transition…) : le z-index maximal sert de repli
    }
  }

  private render(): void {
    if (!this.layer) return
    this.raise()
    this.hoverables = []
    const nodes: HTMLElement[] = []
    const lines: HTMLElement[] = [el('h1', 'CBD — débug')]
    const prefix = this.scripts.length > 1

    for (const { script, handle } of this.scripts) {
      for (const item of inspectScript(script)) {
        const label = prefix ? `${script.name} · ${item.label}` : item.label
        this.renderItem(item, label, handle, nodes, lines)
      }
    }
    if (lines.length === 1) lines.push(el('p', 'Aucun script actif sur cette page.', 'muted'))

    const panel = el('div', '', 'panel')
    panel.append(...lines)
    this.layer.replaceChildren(...nodes, panel)
    this.renderTip()
  }

  /** Infobulle des conditions sous la souris, placée à côté du pointeur sans sortir de l'écran. */
  private renderTip(): void {
    const tip = this.tip
    if (!tip || !this.layer) return
    const pointer = this.pointer
    const hovered = pointer
      ? this.hoverables.filter(({ rect }) =>
          pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom)
      : []
    if (!pointer || hovered.length === 0) {
      tip.remove()
      return
    }
    tip.replaceChildren(
      ...hovered.flatMap(({ color, title, detail }) => {
        const heading = place(el('p', ''), { '--c': color })
        heading.append(el('strong', title))
        return [heading, el('p', detail)]
      }),
    )
    tip.style.setProperty('--c', hovered[0].color)
    tip.style.visibility = 'hidden'
    this.layer.append(tip)
    const { width, height } = tip.getBoundingClientRect()
    const left = pointer.x + 16 + width > window.innerWidth ? pointer.x - 16 - width : pointer.x + 16
    const top = pointer.y + 16 + height > window.innerHeight ? pointer.y - 16 - height : pointer.y + 16
    place(tip, { left: `${Math.max(left, 4)}px`, top: `${Math.max(top, 4)}px`, visibility: 'visible' })
  }

  private renderItem(item: DebugItem, label: string, handle: ScriptHandle, nodes: HTMLElement[], lines: HTMLElement[]): void {
    switch (item.kind) {
      case 'click':
      case 'type': {
        const rect = this.rectOf(item.target)
        if (!rect) {
          lines.push(el('p', `⌀ ${label} : élément introuvable`, 'muted'))
          return
        }
        const ready = this.driver.isClickable(item.target)
        const color = ready ? COLORS.action : COLORS.pending
        nodes.push(box(rect, color, 'action'), tag(rect, color, ready ? label : `${label} — pas encore cliquable`))
        if (item.kind === 'click') nodes.push(cross(rect.left + rect.width / 2, rect.top + rect.height / 2, color))
        return
      }
      case 'clickAt': {
        const x = (item.point.xPercent / 100) * window.innerWidth
        const y = (item.point.yPercent / 100) * window.innerHeight
        nodes.push(cross(x, y, COLORS.action), tag(new DOMRect(x + 14, y - 8, 0, 0), COLORS.action, label, 'beside'))
        return
      }
      case 'trigger': {
        const rect = this.rectOf(item.target)
        if (rect) nodes.push(box(rect, COLORS.trigger), tag(rect, COLORS.trigger, label))
        else lines.push(el('p', `⌀ ${label} : pas encore présent`, 'muted'))
        return
      }
      case 'condition': {
        const holds = asBoolean(handle.evaluate(item.condition))
        const detail = this.conditionDetail(item.condition, handle)
        const color = holds ? COLORS.true : COLORS.false
        const verdict = holds ? 'vrai' : 'faux'
        for (const target of item.targets) {
          const rect = this.rectOf(target)
          if (!rect) continue
          nodes.push(box(rect, color, 'outline'))
          this.hoverables.push({ rect, color, title: label, detail: `${detail} → ${verdict}` })
        }
        lines.push(el('p', `${holds ? '✓' : '✗'} ${label} — ${detail}`, String(holds)))
        return
      }
    }
  }

  /** Valeurs réellement comparées, ex. `« 00:05 » = 0`. */
  private conditionDetail(condition: Expr, handle: ScriptHandle): string {
    switch (condition.kind) {
      case 'compare':
        return `${show(handle.evaluate(condition.left))} ${OPS[condition.op]} ${show(handle.evaluate(condition.right))}`
      case 'elementValue': {
        const actual = this.driver.readValue(condition.target)
        return `${actual === null ? 'introuvable' : show(actual.trim())} ${OPS[condition.op]} ${show(condition.value)}`
      }
      case 'elementExists':
        return this.driver.exists(condition.target) ? 'présent' : 'absent'
      case 'elementVisible':
        return this.driver.isVisible(condition.target) ? 'visible' : 'caché ou absent'
      default:
        return show(handle.evaluate(condition))
    }
  }

  /** Rectangle à l'écran, ou `null` si l'élément est absent ou sans taille (caché). */
  private rectOf(target: Target): DOMRect | null {
    const rect = this.driver.find(target)?.getBoundingClientRect()
    return rect && (rect.width > 0 || rect.height > 0) ? rect : null
  }
}

function show(value: Value): string {
  return typeof value === 'string' ? `« ${value} »` : asText(value)
}

function el(tagName: string, text: string, className = ''): HTMLElement {
  const node = document.createElement(tagName)
  node.textContent = text
  if (className) node.className = className
  return node
}

/** `setProperty` gère aussi les variables CSS (`--c`), contrairement à `Object.assign(style, …)`. */
function place(node: HTMLElement, styles: Record<string, string>): HTMLElement {
  for (const [property, value] of Object.entries(styles)) node.style.setProperty(property, value)
  return node
}

function box(rect: DOMRect, color: string, variant = ''): HTMLElement {
  return place(el('div', '', `box ${variant}`), {
    '--c': color,
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  })
}

function cross(x: number, y: number, color: string): HTMLElement {
  return place(el('div', '', 'cross'), { '--c': color, left: `${x}px`, top: `${y}px` })
}

/** Étiquette au-dessus de l'élément (dedans s'il touche le haut de l'écran), ou à côté d'un point. */
function tag(rect: DOMRect, color: string, text: string, position: 'above' | 'beside' = 'above'): HTMLElement {
  const top = position === 'beside' ? rect.top : rect.top >= 20 ? rect.top - 20 : rect.top + 2
  return place(el('div', text, 'tag'), { '--c': color, left: `${Math.max(rect.left, 0)}px`, top: `${top}px` })
}
