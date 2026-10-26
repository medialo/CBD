<script lang="ts">
  import { onMount } from 'svelte'
  import { debugKey, runLogKey, type DebugRequest } from '../messages'
  import type { Script } from '../script/model'
  import type { RunEvent } from '../script/runner'
  import { matchesUrl, sitePatternForUrl } from '../script/sitePattern'
  import { listScripts, onScriptsChanged, setScriptEnabled } from '../storage'

  let tab = $state<chrome.tabs.Tab>()
  let scripts = $state<Script[]>([])
  let log = $state<RunEvent[]>([])
  let debug = $state(false)
  let debugUnreachable = $state(false)

  async function setDebug(enabled: boolean): Promise<void> {
    if (tab?.id === undefined) return
    debug = enabled
    await chrome.storage.session.set({ [debugKey(tab.id)]: enabled })
    const request: DebugRequest = { type: 'debug', enabled }
    debugUnreachable = !(await chrome.tabs.sendMessage(tab.id, request).then(
      () => true,
      () => false,
    ))
  }

  const url = $derived(tab?.url ?? '')
  const webPage = $derived(/^(https?|file):/.test(url))
  const siteScripts = $derived(scripts.filter((s) => matchesUrl(s.sitePattern, url)))

  interface PageLoad {
    /** Heure du chargement ; `null` pour des événements antérieurs à tout intercalaire. */
    at: number | null
    events: RunEvent[]
  }

  /** Le journal découpé par chargement de page, grâce aux intercalaires « Page chargée » (sans scriptId). */
  const loads = $derived(
    log.reduce<PageLoad[]>((groups, event) => {
      if (!event.scriptId) groups.push({ at: event.at, events: [] })
      else if (groups.length === 0) groups.push({ at: null, events: [event] })
      else groups[groups.length - 1].events.push(event)
      return groups
    }, []),
  )
  const currentLoad = $derived(loads.at(-1))
  const previousLoads = $derived(loads.slice(0, -1).filter((load) => load.events.length).reverse())

  function openEditor(params: Record<string, string>): void {
    const query = new URLSearchParams(params).toString()
    void chrome.tabs.create({ url: `${chrome.runtime.getURL('src/editor/index.html')}?${query}` })
    window.close()
  }

  const time = (at: number) => new Date(at).toLocaleTimeString('fr-FR')

  onMount(() => {
    void (async () => {
      ;[tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      scripts = await listScripts()
      if (tab?.id !== undefined) {
        const key = runLogKey(tab.id)
        const stored = await chrome.storage.session.get([key, debugKey(tab.id)])
        log = (stored[key] as RunEvent[] | undefined) ?? []
        debug = stored[debugKey(tab.id)] === true
        chrome.storage.session.onChanged.addListener((changes) => {
          if (key in changes) log = (changes[key].newValue as RunEvent[] | undefined) ?? []
        })
      }
    })()
    onScriptsChanged((updated) => (scripts = updated))
  })
</script>

{#snippet eventList(events: RunEvent[])}
  <ol class="log">
    {#each events as event, i (i)}
      <li class={event.level}>
        <time>{time(event.at)}</time>
        <span><strong>{event.scriptName}</strong> · {event.message}</span>
      </li>
    {/each}
  </ol>
{/snippet}

<main>
  <header>
    <h1>CBD <small>Chrome Block Dealer</small></h1>
    <button onclick={() => openEditor({})}>Tous les scripts</button>
  </header>

  {#if webPage}
    <section>
      <h2>Sur ce site</h2>
      {#each siteScripts as script (script.id)}
        <div class="script">
          <label>
            <input
              type="checkbox"
              checked={script.enabled}
              onchange={(event) => setScriptEnabled(script.id, event.currentTarget.checked)}
            />
            {script.name}
          </label>
          <button class="link" onclick={() => openEditor({ id: script.id })}>Modifier</button>
        </div>
      {:else}
        <p class="muted">Aucun script pour cette page.</p>
      {/each}
      <button class="primary" onclick={() => openEditor({ new: '1', site: sitePatternForUrl(url) })}>
        + Nouveau script pour ce site
      </button>
      <label class="debug">
        <input type="checkbox" checked={debug} onchange={(event) => setDebug(event.currentTarget.checked)} />
        Mode débug : afficher sur la page les éléments ciblés et l’état des conditions
      </label>
      {#if debugUnreachable}
        <p class="warning">La page ne répond pas : actualisez-la pour appliquer le mode débug.</p>
      {/if}
    </section>

    <section>
      <h2>
        Ce chargement
        {#if currentLoad?.at}<span class="since">· page chargée à {time(currentLoad.at)}</span>{/if}
      </h2>
      {#if currentLoad?.events.length}
        {@render eventList(currentLoad.events)}
      {:else}
        <p class="muted">Rien n’a été exécuté depuis le chargement de la page.</p>
      {/if}

      {#if previousLoads.length}
        <details>
          <summary>Chargements précédents ({previousLoads.length})</summary>
          {#each previousLoads as load, i (i)}
            <p class="load">{load.at ? `Page chargée à ${time(load.at)}` : 'Avant'}</p>
            {@render eventList(load.events)}
          {/each}
        </details>
      {/if}
    </section>
  {:else}
    <p class="muted">Ouvrez une page web pour y créer ou suivre des scripts.</p>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 360px;
    padding: 14px;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h1 {
    margin: 0;
    font-size: 16px;
  }

  h1 small {
    color: var(--muted);
    font-size: 12px;
    font-weight: 400;
  }

  h2 {
    margin: 0 0 8px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .script {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .script label {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .debug {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin-top: 4px;
    font-size: 13px;
  }

  .debug input {
    margin-top: 2px;
  }

  .warning {
    margin: 0;
    color: var(--error);
    font-size: 12px;
  }

  .link {
    padding: 2px 6px;
    border: 0;
    background: none;
    color: var(--accent);
  }

  .muted {
    margin: 0;
    color: var(--muted);
  }

  .log {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 240px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
    font-size: 12px;
  }

  .log li {
    display: flex;
    gap: 8px;
    padding: 4px 6px;
    border-left: 3px solid var(--border);
  }

  .log li.success {
    border-color: var(--success);
  }

  .log li.error {
    border-color: var(--error);
    background: var(--error-soft);
  }

  .since {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }

  details {
    margin-top: 6px;
    color: var(--muted);
    font-size: 12px;
  }

  summary {
    cursor: pointer;
  }

  .load {
    margin: 8px 0 4px;
    font-weight: 600;
  }

  time {
    flex: none;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
</style>
