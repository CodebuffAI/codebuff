import type { MarkdownPalette } from './markdown-renderer'

export type ThemeName = 'dark' | 'light'

type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

interface MarkdownThemeOverrides {
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
  chromeText: string
  accentBg: string
  accentText: string
  panelBg: string
  aiLine: string
  userLine: string
  timestampAi: string
  timestampUser: string
  messageAiText: string
  messageUserText: string
  messageBg: string
  statusAccent: string
  statusSecondary: string
  inputBg: string
  inputFg: string
  inputFocusedBg: string
  inputFocusedFg: string
  inputPlaceholder: string
  cursor: string
  agentPrefix: string
  agentName: string
  agentText: string
  agentCheckmark: string
  agentResponseCount: string
  agentFocusedBg: string
  agentContentText: string
  agentToggleHeaderBg: string
  agentToggleHeaderText: string
  agentToggleText: string
  agentContentBg: string
  markdown?: MarkdownThemeOverrides
}

type ChatThemeOverrides = Partial<Omit<ChatTheme, 'markdown'>> & {
  markdown?: MarkdownThemeOverrides
}

type ThemeOverrideConfig = Partial<Record<ThemeName, ChatThemeOverrides>> & {
  all?: ChatThemeOverrides
}

const CHAT_THEME_ENV_KEYS = [
  'OPEN_TUI_CHAT_THEME_OVERRIDES',
  'OPENTUI_CHAT_THEME_OVERRIDES',
]

const mergeMarkdownOverrides = (
  base: MarkdownThemeOverrides | undefined,
  override: MarkdownThemeOverrides | undefined,
): MarkdownThemeOverrides | undefined => {
  if (!base && !override) return undefined
  if (!override)
    return base
      ? {
          ...base,
          headingFg: base.headingFg ? { ...base.headingFg } : undefined,
        }
      : undefined

  const mergedHeading = {
    ...(base?.headingFg ?? {}),
    ...(override.headingFg ?? {}),
  }

  return {
    ...(base ?? {}),
    ...override,
    headingFg:
      Object.keys(mergedHeading).length > 0
        ? (mergedHeading as Partial<Record<MarkdownHeadingLevel, string>>)
        : undefined,
  }
}

const mergeTheme = (
  base: ChatTheme,
  override?: ChatThemeOverrides,
): ChatTheme => {
  if (!override) {
    return {
      ...base,
      markdown: base.markdown
        ? {
            ...base.markdown,
            headingFg: base.markdown.headingFg
              ? { ...base.markdown.headingFg }
              : undefined,
          }
        : undefined,
    }
  }

  return {
    ...base,
    ...override,
    markdown: mergeMarkdownOverrides(base.markdown, override.markdown),
  }
}

const parseThemeOverrides = (
  raw: string,
): Partial<Record<ThemeName, ChatThemeOverrides>> => {
  try {
    const parsed = JSON.parse(raw) as ThemeOverrideConfig
    if (!parsed || typeof parsed !== 'object') return {}

    const result: Partial<Record<ThemeName, ChatThemeOverrides>> = {}
    const common =
      typeof parsed.all === 'object' && parsed.all ? parsed.all : undefined

    for (const themeName of ['dark', 'light'] as ThemeName[]) {
      const specific =
        typeof parsed?.[themeName] === 'object' && parsed?.[themeName]
          ? parsed?.[themeName]
          : undefined

      const mergedOverrides =
        common || specific
          ? {
              ...(common ?? {}),
              ...(specific ?? {}),
              markdown: mergeMarkdownOverrides(
                common?.markdown,
                specific?.markdown,
              ),
            }
          : undefined

      if (mergedOverrides) {
        result[themeName] = mergedOverrides
      }
    }

    return result
  } catch {
    return {}
  }
}

const loadThemeOverrides = (): Partial<
  Record<ThemeName, ChatThemeOverrides>
> => {
  for (const key of CHAT_THEME_ENV_KEYS) {
    const raw = process.env[key]
    if (raw && raw.trim().length > 0) {
      return parseThemeOverrides(raw)
    }
  }
  return {}
}

const textDecoder = new TextDecoder()

const readSpawnOutput = (output: unknown): string => {
  if (!output) return ''
  if (typeof output === 'string') return output.trim()
  if (output instanceof Uint8Array) return textDecoder.decode(output).trim()
  return ''
}

const runSystemCommand = (command: string[]): string | null => {
  if (typeof Bun === 'undefined') return null
  if (command.length === 0) return null

  const [binary] = command
  if (!binary) return null

  const resolvedBinary =
    Bun.which(binary) ??
    (process.platform === 'win32' ? Bun.which(`${binary}.exe`) : null)
  if (!resolvedBinary) return null

  try {
    const result = Bun.spawnSync({
      cmd: [resolvedBinary, ...command.slice(1)],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    if (result.exitCode !== 0) return null
    return readSpawnOutput(result.stdout)
  } catch {
    return null
  }
}

const detectPlatformTheme = (): ThemeName => {
  if (typeof Bun !== 'undefined') {
    if (process.platform === 'darwin') {
      const value = runSystemCommand([
        'defaults',
        'read',
        '-g',
        'AppleInterfaceStyle',
      ])
      if (value?.toLowerCase() === 'dark') return 'dark'
      return 'light'
    }

    if (process.platform === 'win32') {
      const value = runSystemCommand([
        'powershell',
        '-NoProfile',
        '-Command',
        '(Get-ItemProperty -Path HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize).AppsUseLightTheme',
      ])
      if (value === '0') return 'dark'
      if (value === '1') return 'light'
    }

    if (process.platform === 'linux') {
      const value = runSystemCommand([
        'gsettings',
        'get',
        'org.gnome.desktop.interface',
        'color-scheme',
      ])
      if (value?.toLowerCase().includes('dark')) return 'dark'
      if (value?.toLowerCase().includes('light')) return 'light'
    }
  }

  return 'dark'
}

export const detectSystemTheme = (): ThemeName => {
  const envPreference = process.env.OPEN_TUI_THEME ?? process.env.OPENTUI_THEME
  const normalizedEnv = envPreference?.toLowerCase()

  if (normalizedEnv === 'dark' || normalizedEnv === 'light') {
    return normalizedEnv
  }

  const platformTheme = detectPlatformTheme()

  if (normalizedEnv === 'opposite') {
    return platformTheme === 'dark' ? 'light' : 'dark'
  }

  return platformTheme
}

const DEFAULT_CHAT_THEMES: Record<ThemeName, ChatTheme> = {
  dark: {
    background: '#000000',
    chromeBg: '#000000',
    chromeText: '#9ca3af',
    accentBg: '#facc15',
    accentText: '#1c1917',
    panelBg: '#000000',
    aiLine: '#34d399',
    userLine: '#38bdf8',
    timestampAi: '#4ade80',
    timestampUser: '#60a5fa',
    messageAiText: '#f1f5f9',
    messageUserText: '#dbeafe',
    messageBg: '#000000',
    statusAccent: '#facc15',
    statusSecondary: '#a3aed0',
    inputBg: '#000000',
    inputFg: '#f5f5f5',
    inputFocusedBg: '#000000',
    inputFocusedFg: '#ffffff',
    inputPlaceholder: '#a3a3a3',
    cursor: '#22c55e',
    agentPrefix: '#22c55e',
    agentName: '#4ade80',
    agentText: '#d1d5db',
    agentCheckmark: '#22c55e',
    agentResponseCount: '#9ca3af',
    agentFocusedBg: '#334155',
    agentContentText: '#ffffff',
    agentToggleHeaderBg: '#16a34a',
    agentToggleHeaderText: '#ffffff',
    agentToggleText: '#ffffff',
    agentContentBg: '#000000',
    markdown: {
      codeBackground: '#1f2933',
      codeHeaderFg: '#5b647a',
      inlineCodeFg: '#f1f5f9',
      codeTextFg: '#f1f5f9',
      headingFg: {
        1: '#facc15',
        2: '#facc15',
        3: '#facc15',
        4: '#facc15',
        5: '#facc15',
        6: '#facc15',
      },
      listBulletFg: '#a3aed0',
      blockquoteBorderFg: '#334155',
      blockquoteTextFg: '#e2e8f0',
      dividerFg: '#283042',
      codeMonochrome: true,
    },
  },
  light: {
    background: '#ffffff',
    chromeBg: '#f3f4f6',
    chromeText: '#374151',
    accentBg: '#f59e0b',
    accentText: '#111827',
    panelBg: '#ffffff',
    aiLine: '#059669',
    userLine: '#3b82f6',
    timestampAi: '#047857',
    timestampUser: '#2563eb',
    messageAiText: '#111827',
    messageUserText: '#1f2937',
    messageBg: '#ffffff',
    statusAccent: '#f59e0b',
    statusSecondary: '#6b7280',
    inputBg: '#f9fafb',
    inputFg: '#111827',
    inputFocusedBg: '#ffffff',
    inputFocusedFg: '#000000',
    inputPlaceholder: '#9ca3af',
    cursor: '#3b82f6',
    agentPrefix: '#059669',
    agentName: '#047857',
    agentText: '#1f2937',
    agentCheckmark: '#059669',
    agentResponseCount: '#6b7280',
    agentFocusedBg: '#f3f4f6',
    agentContentText: '#111827',
    agentToggleHeaderBg: '#059669',
    agentToggleHeaderText: '#ffffff',
    agentToggleText: '#ffffff',
    agentContentBg: '#ffffff',
    markdown: {
      codeBackground: '#f3f4f6',
      codeHeaderFg: '#6b7280',
      inlineCodeFg: '#dc2626',
      codeTextFg: '#111827',
      headingFg: {
        1: '#dc2626',
        2: '#dc2626',
        3: '#dc2626',
        4: '#dc2626',
        5: '#dc2626',
        6: '#dc2626',
      },
      listBulletFg: '#6b7280',
      blockquoteBorderFg: '#d1d5db',
      blockquoteTextFg: '#374151',
      dividerFg: '#e5e7eb',
      codeMonochrome: true,
    },
  },
}

export const chatThemes = (() => {
  const overrides = loadThemeOverrides()
  return {
    dark: mergeTheme(DEFAULT_CHAT_THEMES.dark, overrides.dark),
    light: mergeTheme(DEFAULT_CHAT_THEMES.light, overrides.light),
  }
})()

export const createMarkdownPalette = (theme: ChatTheme): MarkdownPalette => {
  const headingDefaults: Record<MarkdownHeadingLevel, string> = {
    1: theme.statusAccent,
    2: theme.statusAccent,
    3: theme.statusAccent,
    4: theme.statusAccent,
    5: theme.statusAccent,
    6: theme.statusAccent,
  }

  const overrides = theme.markdown?.headingFg ?? {}

  return {
    inlineCodeFg: theme.markdown?.inlineCodeFg ?? theme.messageAiText,
    codeBackground: theme.markdown?.codeBackground ?? theme.messageBg,
    codeHeaderFg: theme.markdown?.codeHeaderFg ?? theme.statusSecondary,
    headingFg: {
      ...headingDefaults,
      ...overrides,
    },
    listBulletFg: theme.markdown?.listBulletFg ?? theme.statusSecondary,
    blockquoteBorderFg:
      theme.markdown?.blockquoteBorderFg ?? theme.statusSecondary,
    blockquoteTextFg: theme.markdown?.blockquoteTextFg ?? theme.messageAiText,
    dividerFg: theme.markdown?.dividerFg ?? theme.statusSecondary,
    codeTextFg: theme.markdown?.codeTextFg ?? theme.messageAiText,
    codeMonochrome: theme.markdown?.codeMonochrome ?? true,
  }
}
