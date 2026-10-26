import type { PickMode } from '../page/picker'
import type { PickRequest, PickResult } from '../messages'

/**
 * Bascule sur l'onglet du site le plus récemment utilisé, y lance le mode pointer,
 * puis revient à l'éditeur. Résout `null` si l'utilisateur annule (Échap).
 */
export async function pickInTab(sitePattern: string, mode: PickMode): Promise<PickResult | null> {
  const extensionOrigin = chrome.runtime.getURL('')
  const tabs = (await chrome.tabs.query({ url: sitePattern })).filter((tab) => !tab.url?.startsWith(extensionOrigin))
  const target = tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0]
  if (target?.id === undefined) {
    throw new Error(`Ouvrez d’abord un onglet sur le site (${sitePattern}), puis recliquez sur 🎯.`)
  }

  const editor = await chrome.tabs.getCurrent()
  await focus(target)
  try {
    const request: PickRequest = { type: 'pick', mode }
    return (await chrome.tabs.sendMessage(target.id, request)) as PickResult | null
  } catch {
    throw new Error('La page ne répond pas : rechargez l’onglet du site (il était ouvert avant l’installation de l’extension).')
  } finally {
    if (editor) await focus(editor)
  }
}

async function focus(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return
  await chrome.tabs.update(tab.id, { active: true })
  await chrome.windows.update(tab.windowId, { focused: true })
}
