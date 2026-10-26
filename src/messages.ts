import type { PickMode, PickResult } from './page/picker'
import type { RunEvent } from './script/runner'

// Messages échangés entre l'éditeur, le content script et le service worker.

/** Éditeur → content script de l'onglet visé. Réponse : `PickResult | null`. */
export interface PickRequest {
  type: 'pick'
  mode: PickMode
}

/** Popup → content script : active / désactive le mode débug de l'onglet. */
export interface DebugRequest {
  type: 'debug'
  enabled: boolean
}

/** Content script → service worker. `get-debug` répond `boolean` (mode débug de l'onglet). */
export type ContentMessage =
  | { type: 'page-loaded' }
  | { type: 'get-debug' }
  | { type: 'active-scripts'; count: number }
  | { type: 'run-event'; event: RunEvent }

export type { PickResult }

/** Journal d'exécution d'un onglet, dans chrome.storage.session (lu par le popup). */
export const runLogKey = (tabId: number) => `runlog:${tabId}`

export const RUN_LOG_LIMIT = 50

/** Mode débug d'un onglet, dans chrome.storage.session : survit aux actualisations, pas à la fermeture. */
export const debugKey = (tabId: number) => `debug:${tabId}`
