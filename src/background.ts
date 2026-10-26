import { debugKey, RUN_LOG_LIMIT, runLogKey, type ContentMessage } from './messages'
import type { RunEvent } from './script/runner'

// Le service worker tient le journal d'exécution de chaque onglet, le badge de l'icône,
// et indique au content script si le mode débug est actif pour son onglet.
// Les écritures d'un même onglet sont chaînées pour ne pas perdre d'événements.

const pending = new Map<number, Promise<void>>()

function updateLog(tabId: number, change: (log: RunEvent[]) => RunEvent[]): void {
  const key = runLogKey(tabId)
  const next = (pending.get(tabId) ?? Promise.resolve()).then(async () => {
    const stored = await chrome.storage.session.get(key)
    await chrome.storage.session.set({ [key]: change((stored[key] as RunEvent[] | undefined) ?? []).slice(-RUN_LOG_LIMIT) })
  })
  pending.set(tabId, next.catch(() => undefined))
}

chrome.runtime.onMessage.addListener((message: ContentMessage, sender, sendResponse: (enabled: boolean) => void) => {
  const tabId = sender.tab?.id
  if (tabId === undefined) return
  switch (message.type) {
    case 'get-debug': {
      const key = debugKey(tabId)
      chrome.storage.session.get(key).then((stored) => sendResponse(stored[key] === true))
      return true // réponse asynchrone
    }
    case 'page-loaded':
      // Intercalaire plutôt que remise à zéro : on garde la trace des exécutions d'avant une actualisation.
      updateLog(tabId, (log) => [...log, pageLoadedMarker()])
      break
    case 'active-scripts':
      void chrome.action.setBadgeText({ tabId, text: message.count ? String(message.count) : '' })
      void chrome.action.setBadgeBackgroundColor({ tabId, color: '#4c6fd6' })
      break
    case 'run-event':
      updateLog(tabId, (log) => [...log, message.event])
      break
  }
})

function pageLoadedMarker(): RunEvent {
  return { scriptId: '', scriptName: '', at: Date.now(), level: 'info', message: 'Page chargée' }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  pending.delete(tabId)
  void chrome.storage.session.remove([runLogKey(tabId), debugKey(tabId)])
})
