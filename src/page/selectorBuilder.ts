// Génère un sélecteur CSS unique et aussi stable que possible pour un élément choisi au pointeur.

const STABLE_ATTRIBUTES = ['data-testid', 'data-test', 'data-qa', 'data-cy', 'data-id', 'name', 'aria-label', 'title']

/** Les identifiants générés (`ember123`, `a1b2c3d4…`, `:r5:`) changent d'une visite à l'autre. */
function looksGenerated(value: string): boolean {
  return /\d{3,}/.test(value) || /[0-9a-f]{8,}/i.test(value) || /^[:_-]|[:]/.test(value)
}

export function buildSelector(element: Element): string {
  const doc = element.ownerDocument
  const unique = (selector: string) => {
    try {
      const matches = doc.querySelectorAll(selector)
      return matches.length === 1 && matches[0] === element
    } catch {
      return false
    }
  }

  const own = stableSelector(element)
  if (own && unique(own)) return own

  // Chemin depuis l'ancêtre stable le plus proche : résiste aux changements ailleurs dans la page.
  const segments: string[] = []
  for (let current: Element | null = element; current && current !== doc.documentElement; current = current.parentElement) {
    const anchor = current !== element ? stableSelector(current) : null
    if (anchor && doc.querySelectorAll(anchor).length === 1) {
      const candidate = [anchor, ...segments].join(' > ')
      if (unique(candidate)) return candidate
    }
    segments.unshift(positionSegment(current))
  }
  // Sans ancêtre stable : le plus court suffixe unique du chemin.
  for (let start = segments.length - 1; start >= 0; start--) {
    const candidate = segments.slice(start).join(' > ')
    if (unique(candidate)) return candidate
  }
  return ['html', ...segments].join(' > ')
}

/** Texte visible de l'élément, utilisé comme repli si le sélecteur ne correspond plus. */
export function visibleText(element: Element): string | undefined {
  const text = ((element as HTMLElement).innerText ?? element.textContent ?? '').replace(/\s+/g, ' ').trim()
  return text && text.length <= 60 ? text : undefined
}

function stableSelector(element: Element): string | null {
  const tag = element.tagName.toLowerCase()
  if (element.id && !looksGenerated(element.id)) return `#${cssEscape(element.id)}`
  for (const attribute of STABLE_ATTRIBUTES) {
    const value = element.getAttribute(attribute)
    if (value && !looksGenerated(value)) return `${tag}[${attribute}="${value.replace(/["\\]/g, '\\$&')}"]`
  }
  return null
}

function positionSegment(element: Element): string {
  const tag = element.tagName.toLowerCase()
  const siblings = element.parentElement ? [...element.parentElement.children].filter((el) => el.tagName === element.tagName) : []
  return siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(element) + 1})` : tag
}

/** Équivalent minimal de `CSS.escape` (absent de jsdom). */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value)
  return value.replace(/^(\d)/, '\\3$1 ').replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}
