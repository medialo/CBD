import type { ContentMessage, DebugRequest, PickRequest, PickResult } from './messages'
import { DebugOverlay } from './page/debugOverlay'
import { DomPageDriver } from './page/DomPageDriver'
import { pick } from './page/picker'
import type { Script, ScriptId } from './script/model'
import { startScript, type ScriptHandle } from './script/runner'
import { matchesUrl } from './script/sitePattern'
import { listScripts, onScriptsChanged } from './storage'

// Lance les scripts actifs qui correspondent à l'URL de la page, répond au mode pointer
// et affiche le mode débug.

const driver = new DomPageDriver(document)
const debug = new DebugOverlay(driver)
/** Script en cours → sa définition, sérialisée pour ne relancer que ceux modifiés, et sa poignée. */
const running = new Map<ScriptId, { script: Script; definition: string; handle: ScriptHandle }>()

function send(message: ContentMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // service worker indisponible (extension rechargée) : le journal est perdu, pas l'exécution
  })
}

function sync(scripts: Script[]): void {
  const wanted = new Map(
    scripts.filter((s) => s.enabled && matchesUrl(s.sitePattern, location.href)).map((s) => [s.id, s]),
  )
  for (const [id, entry] of running) {
    if (wanted.get(id) && JSON.stringify(wanted.get(id)) === entry.definition) continue
    entry.handle.stop()
    running.delete(id)
  }
  for (const [id, script] of wanted) {
    if (running.has(id)) continue
    const handle = startScript(script, driver, (event) => send({ type: 'run-event', event }))
    running.set(id, { script, definition: JSON.stringify(script), handle })
  }
  debug.setScripts([...running.values()])
  send({ type: 'active-scripts', count: running.size })
}

function setDebug(enabled: boolean): void {
  if (enabled) debug.start()
  else debug.stop()
}

type IncomingMessage = PickRequest | DebugRequest

chrome.runtime.onMessage.addListener((message: IncomingMessage, _sender, sendResponse: (result: PickResult | null) => void) => {
  switch (message.type) {
    case 'pick':
      pick(message.mode).then(sendResponse)
      return true // réponse asynchrone
    case 'debug':
      setDebug(message.enabled)
      return
  }
})

send({ type: 'page-loaded' })
listScripts().then(sync)
onScriptsChanged(sync)
chrome.runtime
  .sendMessage({ type: 'get-debug' } satisfies ContentMessage)
  .then((enabled: boolean) => setDebug(enabled === true))
  .catch(() => undefined)
