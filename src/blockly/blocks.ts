import * as Blockly from 'blockly/core'
// Blocs standard (logique, boucles, maths, texte, variables) ; leur traduction est dans workspaceState.ts.
import 'blockly/blocks'
import * as Fr from 'blockly/msg/fr'
import type { PickMode } from '../page/picker'

// Définitions des blocs, toolbox et thème. Les noms de champs (SELECTOR, TIMEOUT…) sont
// ceux lus par `workspaceState.ts`.

export type PickHandler = (block: Blockly.Block, mode: PickMode) => void

let pickHandler: PickHandler | null = null

/** L'éditeur fournit ce qui se passe quand on clique sur la cible 🎯 d'un bloc. */
export function onPickRequested(handler: PickHandler): void {
  pickHandler = handler
}

const PICKER_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round">
      <circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="white"/>
      <path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>`,
  )

function registerPicker(name: string, field: string, mode: PickMode): void {
  Blockly.Extensions.register(name, function (this: Blockly.Block) {
    const input = this.getField(field)?.getParentInput()
    input?.appendField(
      new Blockly.FieldImage(PICKER_ICON, 20, 20, 'Choisir dans la page', () => {
        if (!this.isInFlyout) pickHandler?.(this, mode)
      }),
    )
  })
}

const selector = (text = '') => ({ type: 'field_input', name: 'SELECTOR', text, spellcheck: false })
const seconds = (name: string, value: number) => ({ type: 'field_number', name, value, min: 0, precision: 0.1 })
const percent = (name: string) => ({ type: 'field_number', name, value: 50, min: 0, max: 100, precision: 0.1 })

const BLOCKS = [
  // Déclencheurs
  { type: 'trigger_page_loaded', message0: 'Quand la page est chargée', nextStatement: null, style: 'trigger_blocks' },
  {
    type: 'trigger_element_appears',
    message0: 'Quand %1 apparaît',
    args0: [selector()],
    nextStatement: null,
    style: 'trigger_blocks',
    extensions: ['element_picker'],
    tooltip: 'Exécute le script à chaque fois que l’élément apparaît dans la page.',
  },
  {
    type: 'trigger_interval',
    message0: 'Toutes les %1 secondes',
    args0: [{ ...seconds('SECONDS', 5), min: 0.1 }],
    nextStatement: null,
    style: 'trigger_blocks',
  },

  // Contrôle
  {
    type: 'step_wait_until',
    message0: 'Attendre que %1 %2 max %3 s',
    args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }, { type: 'input_dummy' }, seconds('TIMEOUT', 0)],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'control_blocks',
    tooltip: 'Surveille la page jusqu’à ce que la condition soit vraie. Max 0 = sans limite.',
  },
  {
    type: 'step_if',
    message0: 'Si %1 alors %2 %3 sinon %4 %5',
    args0: [
      { type: 'input_value', name: 'COND', check: 'Boolean' },
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'THEN' },
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'ELSE' },
    ],
    previousStatement: null,
    nextStatement: null,
    style: 'control_blocks',
    tooltip: 'Teste la condition une seule fois, au moment où le bloc est atteint.',
  },
  {
    type: 'step_wait',
    message0: 'Attendre %1 s',
    args0: [seconds('SECONDS', 1)],
    previousStatement: null,
    nextStatement: null,
    style: 'control_blocks',
  },
  {
    type: 'step_stop',
    message0: 'Arrêter le script',
    previousStatement: null,
    style: 'control_blocks',
    tooltip: 'Termine l’exécution en cours (le déclencheur peut la relancer).',
  },
  {
    type: 'step_log',
    message0: 'Écrire dans le journal %1',
    args0: [{ type: 'input_value', name: 'MESSAGE' }],
    previousStatement: null,
    nextStatement: null,
    style: 'control_blocks',
    tooltip: 'Affiche une valeur dans le journal du popup, pour comprendre ce que fait le script.',
  },

  // Actions
  {
    type: 'step_click_element',
    message0: 'Cliquer sur %1 %2 attendre max %3 s',
    args0: [selector(), { type: 'input_dummy' }, seconds('TIMEOUT', 0)],
    previousStatement: null,
    nextStatement: null,
    style: 'action_blocks',
    extensions: ['element_picker'],
    tooltip: 'Attend que l’élément existe et soit cliquable, puis clique. Max 0 = sans limite.',
  },
  {
    type: 'step_click_at',
    message0: 'Cliquer ici : x %1 %% y %2 %%',
    args0: [percent('X'), percent('Y')],
    previousStatement: null,
    nextStatement: null,
    style: 'action_blocks',
    extensions: ['point_picker'],
    tooltip: 'Clique à une position de la fenêtre, utile si le bouton n’existe pas encore au moment de créer le script.',
  },
  {
    type: 'step_reload',
    message0: 'Actualiser la page',
    previousStatement: null,
    style: 'action_blocks',
    tooltip:
      'Recharge la page. Avec le déclencheur « Quand la page est chargée », le script repart du début : ' +
      'placez ce bloc dans un « Si » ou après un « Attendre » pour ne pas actualiser en continu.',
  },
  {
    type: 'step_type_text',
    message0: 'Écrire %1 dans %2 %3 attendre max %4 s',
    args0: [{ type: 'field_input', name: 'TEXT', text: '' }, selector(), { type: 'input_dummy' }, seconds('TIMEOUT', 0)],
    previousStatement: null,
    nextStatement: null,
    style: 'action_blocks',
    extensions: ['element_picker'],
  },

  // Valeurs et conditions liées à la page
  {
    type: 'value_element',
    message0: 'valeur de %1',
    args0: [selector()],
    output: null,
    style: 'condition_blocks',
    extensions: ['element_picker'],
    tooltip: 'Texte de l’élément, ou valeur du champ. Utilisable dans un calcul (« 00:30 » vaut 30).',
  },
  {
    type: 'cond_element_value',
    message0: 'valeur de %1 %2 %3',
    args0: [
      selector(),
      {
        type: 'field_dropdown',
        name: 'OP',
        options: [
          ['=', 'eq'],
          ['≠', 'neq'],
          ['<', 'lt'],
          ['>', 'gt'],
          ['contient', 'contains'],
        ],
      },
      { type: 'field_input', name: 'VALUE', text: '0' },
    ],
    output: 'Boolean',
    style: 'condition_blocks',
    extensions: ['element_picker'],
    tooltip: 'Compare en nombre si possible (« 00:00 » vaut 0), sinon en texte.',
  },
  {
    type: 'cond_element_exists',
    message0: '%1 existe',
    args0: [selector()],
    output: 'Boolean',
    style: 'condition_blocks',
    extensions: ['element_picker'],
  },
  {
    type: 'cond_element_visible',
    message0: '%1 est visible',
    args0: [selector()],
    output: 'Boolean',
    style: 'condition_blocks',
    extensions: ['element_picker'],
  },
]

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Déclencheurs',
      categorystyle: 'trigger_category',
      contents: ['trigger_page_loaded', 'trigger_element_appears', 'trigger_interval'].map((type) => ({ kind: 'block', type })),
    },
    {
      kind: 'category',
      name: 'Contrôle',
      categorystyle: 'control_category',
      contents: [
        { kind: 'block', type: 'step_wait_until', inputs: { COND: { block: { type: 'cond_element_value' } } } },
        { kind: 'block', type: 'step_if', inputs: { COND: { block: { type: 'cond_element_exists' } } } },
        { kind: 'block', type: 'step_wait' },
        { kind: 'block', type: 'step_log', inputs: { MESSAGE: { block: { type: 'text', fields: { TEXT: 'ici' } } } } },
        { kind: 'block', type: 'step_stop' },
      ],
    },
    {
      kind: 'category',
      name: 'Actions',
      categorystyle: 'action_category',
      contents: ['step_click_element', 'step_click_at', 'step_type_text', 'step_reload'].map((type) => ({ kind: 'block', type })),
    },
    {
      kind: 'category',
      name: 'Page',
      categorystyle: 'condition_category',
      contents: ['value_element', 'cond_element_value', 'cond_element_exists', 'cond_element_visible'].map((type) => ({
        kind: 'block',
        type,
      })),
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Logique',
      categorystyle: 'logic_category',
      contents: [
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_negate' },
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_boolean' },
      ],
    },
    {
      kind: 'category',
      name: 'Boucles',
      categorystyle: 'loop_category',
      contents: [
        { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: number(10) } },
        { kind: 'block', type: 'controls_whileUntil' },
      ],
    },
    {
      kind: 'category',
      name: 'Maths',
      categorystyle: 'math_category',
      contents: [
        { kind: 'block', type: 'math_number', fields: { NUM: 0 } },
        { kind: 'block', type: 'math_arithmetic', inputs: { A: number(1), B: number(1) } },
      ],
    },
    {
      kind: 'category',
      name: 'Texte',
      categorystyle: 'text_category',
      contents: [
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'text_join' },
      ],
    },
    // Catégorie dynamique de Blockly : bouton « Créer une variable… » puis définir / obtenir / incrémenter.
    { kind: 'category', name: 'Variables', categorystyle: 'variable_category', custom: 'VARIABLE' },
  ],
}

function number(value: number) {
  return { shadow: { type: 'math_number', fields: { NUM: value } } }
}

let registered = false

export function registerBlocks(): Blockly.Theme {
  if (!registered) {
    Blockly.setLocale(Fr as unknown as Record<string, string>)
    registerPicker('element_picker', 'SELECTOR', 'element')
    registerPicker('point_picker', 'Y', 'point')
    Blockly.common.defineBlocksWithJsonArray(BLOCKS)
    registered = true
  }
  return THEME
}

const THEME = Blockly.Theme.defineTheme('cbd', {
  name: 'cbd',
  base: Blockly.Themes.Classic,
  startHats: true,
  blockStyles: {
    trigger_blocks: { colourPrimary: '#d9a400', colourSecondary: '#f0c94d', colourTertiary: '#a37b00' },
    control_blocks: { colourPrimary: '#e6801a', colourSecondary: '#f2a65a', colourTertiary: '#b35f0f' },
    action_blocks: { colourPrimary: '#4c6fd6', colourSecondary: '#7d96e3', colourTertiary: '#3651a3' },
    condition_blocks: { colourPrimary: '#2aa5bf', colourSecondary: '#6cc4d6', colourTertiary: '#1d7a8e' },
  },
  categoryStyles: {
    trigger_category: { colour: '#d9a400' },
    control_category: { colour: '#e6801a' },
    action_category: { colour: '#4c6fd6' },
    condition_category: { colour: '#2aa5bf' },
  },
})
