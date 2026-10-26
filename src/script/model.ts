// Modèle d'un script d'action. Pur TypeScript : aucune dépendance à Chrome, au DOM ou à Blockly.

export type ScriptId = string

/** Élément de la page visé par un bloc. */
export interface Target {
  readonly selector: string
  /** Texte visible capturé avec le mode pointer ; sert de repli si le sélecteur ne trouve rien. */
  readonly fallbackText?: string
}

/** Point de la page, en pourcentage du viewport (« cliquer ici »). */
export interface PagePoint {
  readonly xPercent: number
  readonly yPercent: number
}

export type Trigger =
  | { readonly kind: 'pageLoaded' }
  | { readonly kind: 'elementAppears'; readonly target: Target }
  | { readonly kind: 'interval'; readonly everyMs: number }

export type CompareOp = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains'
export type ArithmeticOp = 'add' | 'sub' | 'mul' | 'div' | 'pow'

/** Résultat d'une expression. */
export type Value = string | number | boolean

/** Expression : valeur, calcul ou condition (une condition est une expression booléenne). */
export type Expr =
  | { readonly kind: 'literal'; readonly value: Value }
  | { readonly kind: 'readElement'; readonly target: Target }
  | { readonly kind: 'variable'; readonly name: string }
  | { readonly kind: 'arithmetic'; readonly op: ArithmeticOp; readonly left: Expr; readonly right: Expr }
  | { readonly kind: 'join'; readonly parts: readonly Expr[] }
  | { readonly kind: 'compare'; readonly op: Exclude<CompareOp, 'contains'>; readonly left: Expr; readonly right: Expr }
  | { readonly kind: 'logic'; readonly op: 'and' | 'or'; readonly left: Expr; readonly right: Expr }
  | { readonly kind: 'not'; readonly operand: Expr }
  // Raccourcis « métier » : « valeur de X = V », « X existe », « X est visible »
  | { readonly kind: 'elementValue'; readonly target: Target; readonly op: CompareOp; readonly value: string }
  | { readonly kind: 'elementExists'; readonly target: Target }
  | { readonly kind: 'elementVisible'; readonly target: Target }

/** Expression utilisée comme condition (évaluée en vrai / faux). */
export type Condition = Expr

/** Un timeout de 0 signifie « sans limite ». */
export type Step =
  | { readonly kind: 'waitUntil'; readonly condition: Condition; readonly timeoutMs: number }
  | { readonly kind: 'if'; readonly condition: Condition; readonly then: readonly Step[]; readonly else: readonly Step[] }
  | { readonly kind: 'repeat'; readonly times: Expr; readonly steps: readonly Step[] }
  | { readonly kind: 'while'; readonly condition: Condition; readonly until: boolean; readonly steps: readonly Step[] }
  | { readonly kind: 'setVariable'; readonly name: string; readonly value: Expr }
  | { readonly kind: 'changeVariable'; readonly name: string; readonly by: Expr }
  | { readonly kind: 'stop' }
  /** Actualise la page ; le script repart du début si son déclencheur est « page chargée ». */
  | { readonly kind: 'reload' }
  | { readonly kind: 'log'; readonly message: Expr }
  | { readonly kind: 'clickElement'; readonly target: Target; readonly timeoutMs: number }
  | { readonly kind: 'clickAt'; readonly point: PagePoint }
  | { readonly kind: 'wait'; readonly durationMs: number }
  | { readonly kind: 'typeText'; readonly target: Target; readonly text: string; readonly timeoutMs: number }

export interface Script {
  readonly id: ScriptId
  readonly name: string
  /** Motif d'URL au format des match patterns Chrome, ex. `*://*.example.com/*`. */
  readonly sitePattern: string
  readonly enabled: boolean
  readonly trigger: Trigger
  readonly steps: readonly Step[]
}
