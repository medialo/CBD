// Motifs d'URL au format des match patterns Chrome :
// https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns

const PATTERN = /^(\*|https?|file):\/\/(\*|\*\.[^/*]+|[^/*]+)?(\/.*)$/

/** Transforme une saisie simple (`example.com`, `*.example.com`) en match pattern complet. */
export function normalizeSitePattern(input: string): string {
  const trimmed = input.trim()
  if (trimmed === '' || trimmed === '<all_urls>' || trimmed.includes('://')) return trimmed
  const [host, ...path] = trimmed.split('/')
  return `*://${host}/${path.length ? path.join('/') : '*'}`
}

/** Motif couvrant tout le site d'une URL, ex. `https://shop.example.com/x` → `*://shop.example.com/*`. */
export function sitePatternForUrl(url: string): string {
  const { protocol, host } = new URL(url)
  return protocol === 'file:' ? 'file:///*' : `*://${host}/*`
}

export function isValidSitePattern(pattern: string): boolean {
  return toRegExp(pattern) !== null
}

export function matchesUrl(pattern: string, url: string): boolean {
  return toRegExp(pattern)?.test(url) ?? false
}

function toRegExp(pattern: string): RegExp | null {
  if (pattern === '<all_urls>') return /^(https?|file):\/\//
  const match = PATTERN.exec(pattern)
  if (!match) return null
  const [, scheme, host = '', path] = match
  if (scheme !== 'file' && host === '') return null

  const schemeRe = scheme === '*' ? 'https?' : scheme
  let hostRe: string
  if (host === '*') hostRe = '[^/]+'
  else if (host.startsWith('*.')) hostRe = `(?:[^/]+\\.)?${escape(host.slice(2))}(?::\\d+)?`
  else hostRe = `${escape(host)}${host.includes(':') ? '' : '(?::\\d+)?'}`
  const pathRe = path.split('*').map(escape).join('.*')
  return new RegExp(`^${schemeRe}://${hostRe}${pathRe}$`)
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
