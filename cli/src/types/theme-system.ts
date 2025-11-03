export type ThemeName = 'dark' | 'light'

export type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

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

export interface ChatTheme {
  background: string
  chromeBg: string
  chromeText: ThemeColor
  accentBg: string
  accentText: string
  panelBg: string
  aiLine: string
  userLine: string
  timestampAi: string
  timestampUser: string
  messageAiText: ThemeColor
  messageUserText: ThemeColor
  messageBg: string
  statusAccent: string
  statusSecondary: string
  inputBg: string
  inputFg: ThemeColor
  inputFocusedBg: string
  inputFocusedFg: ThemeColor
  inputPlaceholder: ThemeColor
  cursor: string
  agentPrefix: string
  agentName: string
  agentText: ThemeColor
  agentCheckmark: string
  agentResponseCount: string
  agentFocusedBg: string
  agentContentText: ThemeColor
  agentToggleHeaderBg: string
  agentToggleHeaderText: ThemeColor
  agentToggleText: ThemeColor
  agentToggleExpandedBg: string
  agentContentBg: string
  modeToggleFastBg: string
  modeToggleFastText: string
  modeToggleMaxBg: string
  modeToggleMaxText: string
  logoColor: string
  markdown?: MarkdownThemeOverrides
  messageTextAttributes?: number
}
