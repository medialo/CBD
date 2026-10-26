import type { PagePoint, Target } from '../model'
import type { PageDriver } from '../runner'

interface FakeElement {
  value: string
  visible: boolean
  disabled: boolean
}

/** Page simulée : les éléments sont indexés par sélecteur et chaque `set` réveille les attentes. */
export class FakePageDriver implements PageDriver {
  readonly clicks: string[] = []
  readonly typed: Array<[string, string]> = []
  reloads = 0
  private readonly elements = new Map<string, FakeElement>()
  private readonly waiters = new Set<() => void>()

  set(selector: string, element: Partial<FakeElement> | null): void {
    if (element === null) this.elements.delete(selector)
    else this.elements.set(selector, { value: '', visible: true, disabled: false, ...this.elements.get(selector), ...element })
    this.waiters.forEach((wake) => wake())
  }

  exists(target: Target): boolean {
    return this.elements.has(target.selector)
  }

  isVisible(target: Target): boolean {
    return this.elements.get(target.selector)?.visible ?? false
  }

  isClickable(target: Target): boolean {
    const element = this.elements.get(target.selector)
    return !!element && element.visible && !element.disabled
  }

  readValue(target: Target): string | null {
    return this.elements.get(target.selector)?.value ?? null
  }

  click(target: Target): boolean {
    this.clicks.push(target.selector)
    return true
  }

  clickAt(point: PagePoint): boolean {
    this.clicks.push(`@${point.xPercent},${point.yPercent}`)
    return true
  }

  typeText(target: Target, text: string): boolean {
    this.typed.push([target.selector, text])
    return true
  }

  reload(): void {
    this.reloads++
  }

  waitFor(check: () => boolean, timeoutMs: number, signal: AbortSignal): Promise<boolean> {
    if (check()) return Promise.resolve(true)
    return new Promise((resolve, reject) => {
      const done = (result: boolean) => {
        this.waiters.delete(wake)
        clearTimeout(timer)
        resolve(result)
      }
      const wake = () => check() && done(true)
      const timer = timeoutMs > 0 ? setTimeout(() => done(false), timeoutMs) : undefined
      this.waiters.add(wake)
      signal.addEventListener('abort', () => {
        this.waiters.delete(wake)
        clearTimeout(timer)
        reject(signal.reason)
      })
    })
  }

  sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(signal.reason)
      })
    })
  }
}
