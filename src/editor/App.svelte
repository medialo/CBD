<script lang="ts">
  import { onMount } from 'svelte'
  import { onPickRequested } from '../blockly/blocks'
  import { fromWorkspace, toWorkspace } from '../blockly/workspaceState'
  import type { Script, ScriptId } from '../script/model'
  import { isValidSitePattern, normalizeSitePattern } from '../script/sitePattern'
  import { exportFileName, exportScripts, parseScripts } from '../script/transfer'
  import { validateScript } from '../script/validate'
  import { deleteScript, importScripts, listScripts, onScriptsChanged, saveScript } from '../storage'
  import BlocklyWorkspace from './BlocklyWorkspace.svelte'
  import { pickInTab } from './pickInTab'

  let scripts = $state<Script[]>([])
  let currentId = $state<ScriptId>('')
  let name = $state('')
  let sitePattern = $state('')
  let enabled = $state(true)
  let errors = $state<string[]>([])
  let notice = $state('')
  let dirty = $state(false)
  let picking = $state(false)

  let editor: ReturnType<typeof BlocklyWorkspace>
  let baseline = ''

  const isNew = $derived(!scripts.some((s) => s.id === currentId))

  const snapshot = () => JSON.stringify([name, sitePattern, enabled, editor?.save()])

  function markClean(): void {
    baseline = snapshot()
    dirty = false
  }

  function refreshDirty(): void {
    dirty = snapshot() !== baseline
    if (dirty) notice = ''
  }

  $effect(() => {
    void [name, sitePattern, enabled]
    refreshDirty()
  })

  function open(script: Script): void {
    currentId = script.id
    name = script.name
    sitePattern = script.sitePattern
    enabled = script.enabled
    errors = []
    notice = ''
    editor.load(toWorkspace(script.trigger, script.steps))
    markClean()
    history.replaceState(null, '', `?id=${script.id}`)
  }

  function create(site = ''): void {
    open({
      id: crypto.randomUUID(),
      name: 'Nouveau script',
      sitePattern: site,
      enabled: true,
      trigger: { kind: 'pageLoaded' },
      steps: [],
    })
  }

  const canLeave = () => !dirty || confirm('Abandonner les modifications non enregistrées ?')

  async function save(): Promise<void> {
    const translation = fromWorkspace(editor.save())
    if (!translation.ok) {
      errors = translation.errors
      return
    }
    const script: Script = {
      id: currentId,
      name: name.trim(),
      sitePattern: normalizeSitePattern(sitePattern),
      enabled,
      trigger: translation.trigger,
      steps: translation.steps,
    }
    errors = validateScript(script)
    if (errors.length) return
    await saveScript(script)
    name = script.name
    sitePattern = script.sitePattern
    markClean()
    notice = 'Enregistré ✓ — les onglets du site appliquent la nouvelle version.'
  }

  async function remove(): Promise<void> {
    if (!isNew && !confirm(`Supprimer « ${name} » ?`)) return
    await deleteScript(currentId)
    const next = scripts.find((s) => s.id !== currentId)
    dirty = false
    if (next) open(next)
    else create()
  }

  function download(selection: readonly Script[]): void {
    const url = URL.createObjectURL(new Blob([exportScripts(selection)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = exportFileName(selection)
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  /** Exporte la version enregistrée du script ouvert. */
  function exportCurrent(): void {
    const saved = scripts.find((s) => s.id === currentId)
    if (!saved) return
    download([saved])
    if (dirty) notice = 'Exporté — version enregistrée, sans les modifications en cours.'
  }

  let fileInput: HTMLInputElement

  async function importFile(file: File | undefined): Promise<void> {
    fileInput.value = '' // pour pouvoir réimporter le même fichier
    if (!file) return
    const result = parseScripts(await file.text())
    if (!result.ok) {
      errors = [result.error]
      return
    }
    const replaced = result.scripts.filter((s) => scripts.some((existing) => existing.id === s.id))
    if (replaced.length && !confirm(`Remplacer ${replaced.length} script(s) existant(s) : ${replaced.map((s) => `« ${s.name} »`).join(', ')} ?`)) return
    await importScripts(result.scripts)
    scripts = await listScripts()

    errors = []
    const toFix = result.scripts.filter((s) => validateScript(s).length)
    notice =
      `${result.scripts.length} script(s) importé(s).` +
      (toFix.length ? ` À compléter avant de fonctionner : ${toFix.map((s) => `« ${s.name} »`).join(', ')}.` : '')
    // Affiche le script importé, sauf si l'utilisateur a des modifications en cours.
    const current = result.scripts.find((s) => s.id === currentId)
    if (!dirty) {
      const message = notice
      open(current ?? result.scripts[0])
      notice = message
    }
  }

  onMount(() => {
    onPickRequested(async (block, mode) => {
      const pattern = normalizeSitePattern(sitePattern)
      if (!isValidSitePattern(pattern)) {
        errors = ['Renseignez d’abord le site du script (ex. example.com) pour savoir dans quel onglet choisir.']
        return
      }
      errors = []
      picking = true
      try {
        const result = await pickInTab(pattern, mode)
        if (result?.kind === 'element') {
          // `data` d'abord : setFieldValue déclenche l'événement de changement.
          block.data = JSON.stringify({ selector: result.selector, text: result.text })
          block.setFieldValue(result.selector, 'SELECTOR')
        } else if (result?.kind === 'point') {
          block.setFieldValue(result.xPercent, 'X')
          block.setFieldValue(result.yPercent, 'Y')
        }
      } catch (error) {
        errors = [(error as Error).message]
      } finally {
        picking = false
      }
    })

    onScriptsChanged((updated) => (scripts = updated))
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    listScripts().then((stored) => {
      scripts = stored
      const params = new URLSearchParams(location.search)
      const requested = stored.find((s) => s.id === params.get('id'))
      if (requested) open(requested)
      else if (params.has('new') || stored.length === 0) create(params.get('site') ?? '')
      else open(stored[0])
    })

    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  })
</script>

<div class="layout">
  <aside>
    <h1>CBD <small>Chrome Block Dealer</small></h1>
    <button class="new" onclick={() => canLeave() && create()}>+ Nouveau script</button>
    <ul>
      {#each scripts as script (script.id)}
        <li>
          <button class:active={script.id === currentId} onclick={() => script.id !== currentId && canLeave() && open(script)}>
            <span class="dot" class:on={script.enabled} title={script.enabled ? 'Actif' : 'Inactif'}></span>
            <span class="label">
              <span class="name">{script.name}</span>
              <span class="site">{script.sitePattern}</span>
            </span>
          </button>
        </li>
      {:else}
        <li class="empty">Aucun script enregistré.</li>
      {/each}
    </ul>
    <div class="transfer">
      <button onclick={() => fileInput.click()}>Importer…</button>
      <button onclick={() => download(scripts)} disabled={scripts.length === 0}>Exporter tout</button>
      <input
        type="file"
        accept=".json,application/json"
        hidden
        bind:this={fileInput}
        onchange={(event) => importFile(event.currentTarget.files?.[0])}
      />
    </div>
  </aside>

  <main>
    <form
      class="toolbar"
      onsubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <label>
        Nom
        <input bind:value={name} required />
      </label>
      <label class="grow">
        Site
        <input bind:value={sitePattern} placeholder="example.com ou *://*.example.com/promo/*" spellcheck="false" />
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={enabled} />
        Actif
      </label>
      <span class="state">{isNew ? 'Non enregistré' : dirty ? 'Modifié' : ''}</span>
      <button type="submit" class="primary">Enregistrer</button>
      <button type="button" onclick={exportCurrent} disabled={isNew} title="Télécharger ce script en fichier JSON">Exporter</button>
      <button type="button" class="danger" onclick={remove}>Supprimer</button>
    </form>

    {#if errors.length}
      <ul class="message errors">
        {#each errors as error}<li>{error}</li>{/each}
      </ul>
    {:else if picking}
      <p class="message info">Mode pointer actif dans l’onglet du site : cliquez sur l’élément (Échap pour annuler).</p>
    {:else if notice}
      <p class="message success">{notice}</p>
    {/if}

    <div class="canvas">
      <BlocklyWorkspace bind:this={editor} onchange={refreshDirty} />
    </div>

    <p class="hint">
      Glissez les blocs depuis la palette et accrochez-les sous le déclencheur. Cliquez sur 🎯 dans un bloc pour
      choisir l’élément (ou la position) directement dans l’onglet du site.
    </p>
  </main>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    height: 100vh;
  }

  aside {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-right: 1px solid var(--border);
    background: var(--surface);
    overflow-y: auto;
  }

  h1 {
    margin: 0;
    font-size: 18px;
  }

  h1 small {
    display: block;
    color: var(--muted);
    font-size: 12px;
    font-weight: 400;
  }

  aside ul {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  aside li button {
    display: flex;
    gap: 10px;
    align-items: center;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 6px;
    background: none;
    text-align: left;
  }

  aside li button:hover {
    background: var(--hover);
  }

  aside li button.active {
    background: var(--accent-soft);
  }

  .label {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .name {
    font-weight: 600;
  }

  .site {
    overflow: hidden;
    color: var(--muted);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border);
  }

  .dot.on {
    background: var(--success);
  }

  .empty {
    color: var(--muted);
    font-size: 13px;
  }

  .transfer {
    display: flex;
    gap: 6px;
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .transfer button {
    flex: 1;
  }

  main {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: end;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }

  .toolbar label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--muted);
    font-size: 12px;
  }

  .toolbar label.grow {
    flex: 1;
    min-width: 220px;
  }

  .toolbar label.check {
    flex-direction: row;
    align-items: center;
    padding-bottom: 8px;
    color: inherit;
    font-size: 14px;
  }

  .state {
    padding-bottom: 8px;
    color: var(--muted);
    font-size: 12px;
  }

  .message {
    margin: 0;
    padding: 8px 16px;
    font-size: 13px;
  }

  .errors {
    padding-left: 32px;
    background: var(--error-soft);
    color: var(--error);
  }

  .info {
    background: var(--accent-soft);
  }

  .success {
    background: var(--success-soft);
    color: var(--success);
  }

  .canvas {
    position: relative;
    flex: 1;
  }

  .hint {
    margin: 0;
    padding: 8px 16px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 12px;
  }
</style>
