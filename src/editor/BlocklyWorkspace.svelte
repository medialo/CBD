<script lang="ts">
  import * as Blockly from 'blockly/core'
  import { onMount } from 'svelte'
  import { registerBlocks, TOOLBOX } from '../blockly/blocks'
  import type { WorkspaceState } from '../blockly/workspaceState'

  let { onchange }: { onchange?: () => void } = $props()

  let container: HTMLDivElement
  let workspace: Blockly.WorkspaceSvg | undefined

  onMount(() => {
    const theme = registerBlocks()
    const ws = Blockly.inject(container, {
      toolbox: TOOLBOX,
      theme,
      renderer: 'zelos',
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 0.75 },
      grid: { spacing: 24, length: 2, colour: '#d8dbe3', snap: true },
      move: { scrollbars: true, drag: true, wheel: false },
    })
    ws.addChangeListener((event) => {
      if (!event.isUiEvent) onchange?.()
    })
    workspace = ws
    const resize = new ResizeObserver(() => Blockly.svgResize(ws))
    resize.observe(container)
    return () => {
      resize.disconnect()
      ws.dispose()
    }
  })

  export function load(state: WorkspaceState): void {
    if (!workspace) return
    Blockly.serialization.workspaces.load(state as object, workspace)
    workspace.scrollCenter()
  }

  export function save(): WorkspaceState {
    return workspace ? (Blockly.serialization.workspaces.save(workspace) as WorkspaceState) : {}
  }
</script>

<div class="workspace" bind:this={container}></div>

<style>
  .workspace {
    position: absolute;
    inset: 0;
  }
</style>
