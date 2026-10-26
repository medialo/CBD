import type { PagePoint, Target } from '../script/model'
import type { PageDriver } from '../script/runner'

const CLICKABLE = 'button, a, [role="button"], input[type="submit"], input[type="button"], label, summary'

/** Certains changements ne produisent aucune mutation (ex. `input.value`) : on sonde aussi. */
const POLL_MS = 250

export class DomPageDriver implements PageDriver {
  constructor(private readonly doc: Document = document) {}

  exists(target: Target): boolean {
    return this.find(target) !== null
  }

  isVisible(target: Target): boolean {
    const element = this.find(target)
    return element !== null && isVisible(element)
  }

  isClickable(target: Target): boolean {
    const element = this.find(target)
    return element !== null && isVisible(element) && !isDisabled(element)
  }

  readValue(target: Target): string | null {
    const element = this.find(target)
    if (element === null) return null
    if (isFormField(element)) return element.value
    return (element as HTMLElement).innerText ?? element.textContent ?? ''
  }

  click(target: Target): boolean {
    const element = this.find(target)
    if (element === null) return false
    element.scrollIntoView?.({ block: 'center', inline: 'center' })
    const rect = element.getBoundingClientRect()
    clickElement(element, rect.left + rect.width / 2, rect.top + rect.height / 2)
    return true
  }

  clickAt(point: PagePoint): boolean {
    const view = this.doc.defaultView
    if (!view) return false
    const x = (point.xPercent / 100) * view.innerWidth
    const y = (point.yPercent / 100) * view.innerHeight
    const element = this.doc.elementFromPoint(x, y)
    if (element === null) return false
    clickElement(element, x, y)
    return true
  }

  typeText(target: Target, text: string): boolean {
    const element = this.find(target)
    if (element === null || !isFormField(element)) return false
    element.focus()
    // Passe par le setter natif pour que les frameworks (React…) voient la modification.
    const proto = Object.getPrototypeOf(element) as object
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(element, text)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  reload(): void {
    this.doc.defaultView?.location.reload()
  }

  waitFor(check: () => boolean, timeoutMs: number, signal: AbortSignal): Promise<boolean> {
    signal.throwIfAborted()
    if (check()) return Promise.resolve(true)
    return new Promise((resolve, reject) => {
      const settle = (finish: () => void) => {
        observer.disconnect()
        clearInterval(poll)
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        finish()
      }
      const recheck = () => {
        if (check()) settle(() => resolve(true))
      }
      const onAbort = () => settle(() => reject(signal.reason))

      const observer = new MutationObserver(recheck)
      observer.observe(this.doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true })
      const poll = setInterval(recheck, POLL_MS)
      const timer = timeoutMs > 0 ? setTimeout(() => settle(() => resolve(false)), timeoutMs) : undefined
      signal.addEventListener('abort', onAbort)
    })
  }

  sleep(ms: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  /** Sélecteur CSS d'abord ; à défaut, un élément cliquable portant le texte capturé. */
  find(target: Target): Element | null {
    let element: Element | null = null
    try {
      element = this.doc.querySelector(target.selector)
    } catch {
      // sélecteur invalide : on tente le repli par texte
    }
    if (element !== null || !target.fallbackText) return element
    const wanted = normalizeText(target.fallbackText)
    return [...this.doc.querySelectorAll(CLICKABLE)].find((el) => normalizeText(el.textContent ?? '') === wanted) ?? null
  }
}

function clickElement(element: Element, clientX: number, clientY: number): void {
  const init = { bubbles: true, cancelable: true, composed: true, clientX, clientY, button: 0 }
  const view = element.ownerDocument.defaultView
  if (view && 'PointerEvent' in view) {
    element.dispatchEvent(new view.PointerEvent('pointerdown', init))
  }
  element.dispatchEvent(new MouseEvent('mousedown', init))
  if (view && 'PointerEvent' in view) {
    element.dispatchEvent(new view.PointerEvent('pointerup', init))
  }
  element.dispatchEvent(new MouseEvent('mouseup', init))
  if (element instanceof HTMLElement) element.click()
  else element.dispatchEvent(new MouseEvent('click', init))
}

function isVisible(element: Element): boolean {
  if ('checkVisibility' in element && typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ visibilityProperty: true })
  }
  // Repli (ex. jsdom) : on remonte les ancêtres en cherchant display/visibility.
  const view = element.ownerDocument.defaultView
  for (let el: Element | null = element; el; el = el.parentElement) {
    const style = view?.getComputedStyle(el)
    if (style?.display === 'none' || style?.visibility === 'hidden') return false
    if (el instanceof HTMLElement && el.hidden) return false
  }
  return true
}

function isDisabled(element: Element): boolean {
  return element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true'
}

function isFormField(element: Element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}
