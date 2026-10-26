// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomPageDriver } from './DomPageDriver'

const driver = new DomPageDriver(document)
const signal = () => new AbortController().signal

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('DomPageDriver', () => {
  it('lit la valeur d’un champ ou le texte d’un élément', () => {
    document.body.innerHTML = `<span id="counter"> 00:05 </span><input id="qty" value="3">`
    expect(driver.readValue({ selector: '#counter' })?.trim()).toBe('00:05')
    expect(driver.readValue({ selector: '#qty' })).toBe('3')
    expect(driver.readValue({ selector: '#absent' })).toBeNull()
  })

  it('attend l’apparition d’un élément ajouté plus tard', async () => {
    const waiting = driver.waitFor(() => driver.exists({ selector: '#promo-btn' }), 1000, signal())
    setTimeout(() => (document.body.innerHTML = '<button id="promo-btn">Profiter</button>'), 10)
    await expect(waiting).resolves.toBe(true)
  })

  it('détecte un changement de texte', async () => {
    document.body.innerHTML = '<span id="counter">1</span>'
    const waiting = driver.waitFor(() => driver.readValue({ selector: '#counter' }) === '0', 1000, signal())
    setTimeout(() => (document.querySelector('#counter')!.textContent = '0'), 10)
    await expect(waiting).resolves.toBe(true)
  })

  it('résout false après le délai', async () => {
    await expect(driver.waitFor(() => false, 20, signal())).resolves.toBe(false)
  })

  it('rejette quand on annule', async () => {
    const controller = new AbortController()
    const waiting = driver.waitFor(() => false, 0, controller.signal)
    controller.abort()
    await expect(waiting).rejects.toThrow()
  })

  it('ne considère pas cliquable un bouton désactivé ou caché', () => {
    document.body.innerHTML = `
      <button id="off" disabled>A</button>
      <div style="display:none"><button id="hidden">B</button></div>
      <button id="ok">C</button>`
    expect(driver.isClickable({ selector: '#off' })).toBe(false)
    expect(driver.isClickable({ selector: '#hidden' })).toBe(false)
    expect(driver.isClickable({ selector: '#ok' })).toBe(true)
  })

  it('clique, avec repli sur le texte quand le sélecteur ne correspond plus', () => {
    document.body.innerHTML = '<button class="btn-x9">  Profiter de la promo </button>'
    const onClick = vi.fn()
    document.querySelector('button')!.addEventListener('click', onClick)
    expect(driver.click({ selector: '#old-id', fallbackText: 'profiter de la promo' })).toBe(true)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('écrit dans un champ et émet input/change', () => {
    document.body.innerHTML = '<input id="code">'
    const onInput = vi.fn()
    document.querySelector('#code')!.addEventListener('input', onInput)
    expect(driver.typeText({ selector: '#code' }, 'PROMO10')).toBe(true)
    expect((document.querySelector('#code') as HTMLInputElement).value).toBe('PROMO10')
    expect(onInput).toHaveBeenCalledOnce()
  })
})
