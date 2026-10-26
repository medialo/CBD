import type { Script, ScriptId } from './script/model'

// Les scripts sont stockés sous une seule clé de chrome.storage.local : un changement
// réveille tous les onglets via `onScriptsChanged`.

const KEY = 'scripts'

export async function listScripts(): Promise<Script[]> {
  const stored = await chrome.storage.local.get(KEY)
  return (stored[KEY] as Script[] | undefined) ?? []
}

export async function saveScript(script: Script): Promise<void> {
  const scripts = await listScripts()
  const index = scripts.findIndex((s) => s.id === script.id)
  if (index === -1) scripts.push(script)
  else scripts[index] = script
  await chrome.storage.local.set({ [KEY]: scripts })
}

/** Ajoute des scripts, en remplaçant ceux de même identifiant, en une seule écriture. */
export async function importScripts(imported: readonly Script[]): Promise<void> {
  const byId = new Map((await listScripts()).map((s) => [s.id, s]))
  for (const script of imported) byId.set(script.id, script)
  await chrome.storage.local.set({ [KEY]: [...byId.values()] })
}

export async function deleteScript(id: ScriptId): Promise<void> {
  const scripts = await listScripts()
  await chrome.storage.local.set({ [KEY]: scripts.filter((s) => s.id !== id) })
}

export async function setScriptEnabled(id: ScriptId, enabled: boolean): Promise<void> {
  const script = (await listScripts()).find((s) => s.id === id)
  if (script) await saveScript({ ...script, enabled })
}

export function onScriptsChanged(listener: (scripts: Script[]) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && KEY in changes) listener((changes[KEY].newValue as Script[] | undefined) ?? [])
  })
}
