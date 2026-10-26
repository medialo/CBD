import { describe, expect, it } from 'vitest'
import { isValidSitePattern, matchesUrl, normalizeSitePattern, sitePatternForUrl } from './sitePattern'

describe('matchesUrl', () => {
  it.each([
    ['*://*.example.com/*', 'https://example.com/', true],
    ['*://*.example.com/*', 'http://shop.example.com/promo?x=1', true],
    ['*://*.example.com/*', 'https://notexample.com/', false],
    ['https://example.com/promo/*', 'https://example.com/promo/42', true],
    ['https://example.com/promo/*', 'http://example.com/promo/42', false],
    ['*://localhost/*', 'http://localhost:5180/countdown.html', true],
    ['file:///*', 'file:///C:/test.html', true],
    ['<all_urls>', 'https://anything.org/', true],
  ])('%s ~ %s → %s', (pattern, url, expected) => {
    expect(matchesUrl(pattern, url)).toBe(expected)
  })
})

describe('isValidSitePattern', () => {
  it('refuse les motifs mal formés', () => {
    expect(isValidSitePattern('example.com')).toBe(false)
    expect(isValidSitePattern('https://')).toBe(false)
    expect(isValidSitePattern('ftp://example.com/*')).toBe(false)
  })
})

describe('normalizeSitePattern', () => {
  it('complète une saisie simple', () => {
    expect(normalizeSitePattern('example.com')).toBe('*://example.com/*')
    expect(normalizeSitePattern('*.example.com/promo/*')).toBe('*://*.example.com/promo/*')
    expect(normalizeSitePattern('https://example.com/*')).toBe('https://example.com/*')
  })

  it('déduit le motif d’une URL', () => {
    expect(sitePatternForUrl('https://shop.example.com/a/b?c')).toBe('*://shop.example.com/*')
  })
})
