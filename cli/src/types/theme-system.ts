export type ThemeName = 'dark' | 'light'

export type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

// ThemeColor is always a resolved color string (never 'default' or undefined)
export type ThemeColor = string

export interface MarkdownThemeOverrides {
  codeBackground?: string
  codeHeaderFg?: string
  inlineCodeFg?: string
  codeTextFg?: string
  headingFg?: Partial<Record<MarkdownHeadingLevel, string>>
  listBulletFg?: string
  blockquoteBorderFg?: string
  blockquoteTextFg?: string
  dividerFg?: string
  codeMonochrome?: boolean
}

/**
 * Semantic Color Theme Interface
 * Inspired by Tailwind - uses semantic color roles instead of specific names
 * This makes theming easier and more intuitive
 */
export interface ChatTheme {
  // ============================================================================
  // CORE SEMANTIC COLORS
  // ============================================================================

  /** Primary brand color - main actions, highlights, important elements */
  primary: string

  /** Secondary brand color - supporting elements, less emphasis */
  secondary: string

  /** Success color - checkmarks, completed states, positive feedback */
  success: string

  /** Error/danger color - errors, destructive actions, failures */
  error: string

  /** Warning color - cautions, alerts, validation issues */
  warning: string

  /** Info color - informational elements, links, hints */
  info: string

  // ============================================================================
  // NEUTRAL SCALE
  // ============================================================================

  /** Default text color */
  foreground: ThemeColor

  /** Base background color */
  background: string

  /** Subdued/secondary text color */
  muted: ThemeColor

  /** Border and divider color */
  border: string

  /** Surface color for panels, cards, chrome */
  surface: string

  /** Hover state for interactive surfaces */
  surfaceHover: string

  // ============================================================================
  // CONTEXT-SPECIFIC COLORS (Minimal - most use semantic colors)
  // ============================================================================

  // AI/User differentiation
  /** AI message indicator line color */
  aiLine: string

  /** User message indicator line color */
  userLine: string

  // Agent backgrounds (specific states that don't map to semantics)
  /** Agent toggle header background */
  agentToggleHeaderBg: string

  /** Agent toggle expanded background */
  agentToggleExpandedBg: string

  /** Agent focused background */
  agentFocusedBg: string

  /** Agent content background */
  agentContentBg: string

  // Input specific
  /** Input background */
  inputBg: string

  /** Input text color */
  inputFg: ThemeColor

  /** Focused input background */
  inputFocusedBg: string

  /** Focused input text color */
  inputFocusedFg: ThemeColor

  // Mode toggles (distinct UI elements)
  /** Fast mode toggle background */
  modeFastBg: string

  /** Fast mode toggle text */
  modeFastText: string

  /** Max mode toggle background */
  modeMaxBg: string

  /** Max mode toggle text */
  modeMaxText: string

  /** Plan mode toggle background */
  modePlanBg: string

  /** Plan mode toggle text */
  modePlanText: string

  // ============================================================================
  // MARKDOWN
  // ============================================================================

  /** Markdown-specific styling */
  markdown?: MarkdownThemeOverrides

  /** Text attributes (bold, dim, etc.) */
  messageTextAttributes?: number
}
