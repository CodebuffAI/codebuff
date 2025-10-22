import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

import type { MarkdownPalette } from './markdown-renderer'

const IDE_THEME_INFERENCE = {
  dark: [
    'dark',
    'midnight',
    'night',
    'noir',
    'black',
    'charcoal',
    'dim',
    'dracula',
    'darcula',
    'moon',
    'nebula',
    'obsidian',
    'shadow',
    'storm',
    'monokai',
    'ayu mirage',
    'material darker',
    'tokyo',
    'abyss',
    'zed dark',
  ],
  light: [
    'light',
    'day',
    'dawn',
    'bright',
    'paper',
    'sun',
    'snow',
    'cloud',
    'white',
    'solarized light',
    'pastel',
    'cream',
    'zed light',
  ],
} as const

const VS_CODE_FAMILY_ENV_KEYS = [
  'VSCODE_PID',
  'VSCODE_CWD',
  'VSCODE_IPC_HOOK_CLI',
  'VSCODE_LOG_NATIVE',
  'VSCODE_NLS_CONFIG',
  'CURSOR_SESSION_ID',
  'CURSOR',
]

const VS_CODE_PRODUCT_DIRS = [
  'Code',
  'Code - Insiders',
  'Code - OSS',
  'VSCodium',
  'VSCodium - Insiders',
  'Cursor',
]

const JETBRAINS_ENV_KEYS = [
  'JB_PRODUCT_CODE',
  'JB_SYSTEM_PATH',
  'JB_INSTALLATION_HOME',
  'IDEA_INITIAL_DIRECTORY',
  'IDE_CONFIG_DIR',
  'JB_IDE_CONFIG_DIR',
]

const normalizeThemeName = (themeName: string): string =>
  themeName.trim().toLowerCase()

const inferThemeFromName = (themeName: string): ThemeName | null => {
  const normalized = normalizeThemeName(themeName)

  for (const hint of IDE_THEME_INFERENCE.dark) {
    if (normalized.includes(hint)) {
      return 'dark'
    }
  }

  for (const hint of IDE_THEME_INFERENCE.light) {
    if (normalized.includes(hint)) {
      return 'light'
    }
  }

  return null
}

const stripJsonStyleComments = (raw: string): string =>
  raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const safeReadFile = (filePath: string): string | null => {
  try {
    return readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

const collectExistingPaths = (candidates: string[]): string[] => {
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      if (existsSync(candidate)) {
        seen.add(candidate)
      }
    } catch {
      // Ignore filesystem errors when probing paths
    }
  }
  return [...seen]
}

const resolveVSCodeSettingsPaths = (): string[] => {
  const settings: string[] = []
  const home = homedir()

  if (process.platform === 'darwin') {
    const base = join(home, 'Library', 'Application Support')
    for (const product of VS_CODE_PRODUCT_DIRS) {
      settings.push(join(base, product, 'User', 'settings.json'))
    }
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData) {
      for (const product of VS_CODE_PRODUCT_DIRS) {
        settings.push(join(appData, product, 'User', 'settings.json'))
      }
    }
  } else {
    const configDir = process.env.XDG_CONFIG_HOME ?? join(home, '.config')
    for (const product of VS_CODE_PRODUCT_DIRS) {
      settings.push(join(configDir, product, 'User', 'settings.json'))
    }
  }

  return settings
}

const resolveJetBrainsLafPaths = (): string[] => {
  const candidates: string[] = []

  for (const key of ['IDE_CONFIG_DIR', 'JB_IDE_CONFIG_DIR']) {
    const raw = process.env[key]
    if (raw) {
      candidates.push(join(raw, 'options', 'laf.xml'))
    }
  }

  const home = homedir()

  const baseDirs: string[] = []
  if (process.platform === 'darwin') {
    baseDirs.push(join(home, 'Library', 'Application Support', 'JetBrains'))
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData) {
      baseDirs.push(join(appData, 'JetBrains'))
    }
  } else {
    baseDirs.push(join(home, '.config', 'JetBrains'))
    baseDirs.push(join(home, '.local', 'share', 'JetBrains'))
  }

  for (const base of baseDirs) {
    try {
      if (!existsSync(base)) continue
      const entries = readdirSync(base)
      for (const entry of entries) {
        const dirPath = join(base, entry)
        try {
          if (!statSync(dirPath).isDirectory()) continue
        } catch {
          continue
        }

        candidates.push(join(dirPath, 'options', 'laf.xml'))
      }
    } catch {
      // Ignore unreadable directories
    }
  }

  return candidates
}

const resolveZedSettingsPaths = (): string[] => {
  const home = homedir()
  const paths: string[] = []

  const configDirs = new Set<string>()

  const xdgConfig = process.env.XDG_CONFIG_HOME ?? join(home, '.config')
  configDirs.add(join(xdgConfig, 'zed'))
  configDirs.add(join(xdgConfig, 'dev.zed.Zed'))

  if (process.platform === 'darwin') {
    configDirs.add(join(home, 'Library', 'Application Support', 'Zed'))
    configDirs.add(join(home, 'Library', 'Application Support', 'dev.zed.Zed'))
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData) {
      configDirs.add(join(appData, 'Zed'))
      configDirs.add(join(appData, 'dev.zed.Zed'))
    }
  } else {
    configDirs.add(join(home, '.config', 'zed'))
    configDirs.add(join(home, '.config', 'dev.zed.Zed'))
    configDirs.add(join(home, '.local', 'share', 'zed'))
    configDirs.add(join(home, '.local', 'share', 'dev.zed.Zed'))
  }

  const legacyConfig = join(home, '.zed')
  configDirs.add(legacyConfig)

  for (const dir of configDirs) {
    paths.push(join(dir, 'settings.json'))
  }

  return paths
}

const extractVSCodeTheme = (content: string): ThemeName | null => {
  const colorThemeMatch = content.match(
    /"workbench\.colorTheme"\s*:\s*"([^"]+)"/i,
  )
  if (colorThemeMatch) {
    const inferred = inferThemeFromName(colorThemeMatch[1])
    if (inferred) return inferred
  }

  const themeKindEnv =
    process.env.VSCODE_THEME_KIND ?? process.env.VSCODE_COLOR_THEME_KIND
  if (themeKindEnv) {
    const normalized = themeKindEnv.trim().toLowerCase()
    if (normalized === 'dark' || normalized === 'hc') return 'dark'
    if (normalized === 'light') return 'light'
  }

  return null
}

const extractJetBrainsTheme = (content: string): ThemeName | null => {
  const normalized = content.toLowerCase()
  if (normalized.includes('darcula') || normalized.includes('dark')) {
    return 'dark'
  }

  if (normalized.includes('light')) {
    return 'light'
  }

  return null
}

const isVSCodeFamilyTerminal = (): boolean => {
  if (process.env.TERM_PROGRAM?.toLowerCase() === 'vscode') {
    return true
  }

  for (const key of VS_CODE_FAMILY_ENV_KEYS) {
    if (process.env[key]) {
      return true
    }
  }

  return false
}

const isJetBrainsTerminal = (): boolean => {
  if (process.env.TERMINAL_EMULATOR?.toLowerCase().includes('jetbrains')) {
    return true
  }

  for (const key of JETBRAINS_ENV_KEYS) {
    if (process.env[key]) {
      return true
    }
  }

  return false
}

const detectVSCodeTheme = (): ThemeName | null => {
  if (!isVSCodeFamilyTerminal()) {
    return null
  }

  const settingsPaths = collectExistingPaths(resolveVSCodeSettingsPaths())

  for (const settingsPath of settingsPaths) {
    const content = safeReadFile(settingsPath)
    if (!content) continue
    const theme = extractVSCodeTheme(content)
    if (theme) {
      return theme
    }
  }

  const themeKindEnv =
    process.env.VSCODE_THEME_KIND ?? process.env.VSCODE_COLOR_THEME_KIND
  if (themeKindEnv) {
    const normalized = themeKindEnv.trim().toLowerCase()
    if (normalized === 'dark' || normalized === 'hc') return 'dark'
    if (normalized === 'light') return 'light'
  }

  return null
}

const detectJetBrainsTheme = (): ThemeName | null => {
  if (!isJetBrainsTerminal()) {
    return null
  }

  const lafPaths = collectExistingPaths(resolveJetBrainsLafPaths())

  for (const lafPath of lafPaths) {
    const content = safeReadFile(lafPath)
    if (!content) continue
    const theme = extractJetBrainsTheme(content)
    if (theme) {
      return theme
    }
  }

  return null
}

const extractZedTheme = (content: string): ThemeName | null => {
  try {
    const sanitized = stripJsonStyleComments(content)
    const parsed = JSON.parse(sanitized) as Record<string, unknown>
    const candidates: unknown[] = []

    const themeSetting = parsed.theme
    if (typeof themeSetting === 'string') {
      candidates.push(themeSetting)
    } else if (themeSetting && typeof themeSetting === 'object') {
      const themeConfig = themeSetting as Record<string, unknown>
      const modeRaw = themeConfig.mode
      if (typeof modeRaw === 'string') {
        const mode = modeRaw.toLowerCase()
        if (mode === 'dark' || mode === 'light') {
          candidates.push(mode)
          const modeTheme = themeConfig[mode]
          if (typeof modeTheme === 'string') {
            candidates.push(modeTheme)
          }
        } else if (mode === 'system') {
          const platformTheme = detectPlatformTheme()
          candidates.push(platformTheme)
          const platformThemeName = themeConfig[platformTheme]
          if (typeof platformThemeName === 'string') {
            candidates.push(platformThemeName)
          }
        }
      }

      const darkTheme = themeConfig.dark
      if (typeof darkTheme === 'string') {
        candidates.push(darkTheme)
      }

      const lightTheme = themeConfig.light
      if (typeof lightTheme === 'string') {
        candidates.push(lightTheme)
      }
    }

    const appearance = parsed.appearance
    if (appearance && typeof appearance === 'object') {
      const appearanceTheme = (appearance as Record<string, unknown>).theme
      if (typeof appearanceTheme === 'string') {
        candidates.push(appearanceTheme)
      }

      const preference = (appearance as Record<string, unknown>)
        .theme_preference
      if (typeof preference === 'string') {
        candidates.push(preference)
      }
    }

    const ui = parsed.ui
    if (ui && typeof ui === 'object') {
      const uiTheme = (ui as Record<string, unknown>).theme
      if (typeof uiTheme === 'string') {
        candidates.push(uiTheme)
      }
    }

    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue

      const inferred = inferThemeFromName(candidate)
      if (inferred) {
        return inferred
      }
    }
  } catch {
    // Ignore malformed or partially written files
  }

  return null
}

const detectZedTheme = (): ThemeName | null => {
  const settingsPaths = collectExistingPaths(resolveZedSettingsPaths())
  for (const settingsPath of settingsPaths) {
    const content = safeReadFile(settingsPath)
    if (!content) continue

    const theme = extractZedTheme(content)
    if (theme) {
      return theme
    }
  }

  return null
}

const detectIDETheme = (): ThemeName | null => {
  const detectors = [detectVSCodeTheme, detectJetBrainsTheme, detectZedTheme]
  for (const detector of detectors) {
    const theme = detector()
    if (theme) {
      return theme
    }
  }
  return null
}

export const getIDEThemeConfigPaths = (): string[] => {
  const paths = new Set<string>()
  for (const path of resolveVSCodeSettingsPaths()) {
    paths.add(path)
  }
  for (const path of resolveJetBrainsLafPaths()) {
    paths.add(path)
  }
  for (const path of resolveZedSettingsPaths()) {
    paths.add(path)
  }
  return [...paths]
}

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

function detectPlatformTheme(): ThemeName {
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

  // Detect Ghostty terminal and default to dark.
  if (
    (typeof Bun !== 'undefined' &&
      Bun.env.GHOSTTY_RESOURCES_DIR !== undefined) ||
    process.env.GHOSTTY_RESOURCES_DIR !== undefined ||
    (process.env.TERM ?? '').toLowerCase() === 'xterm-ghostty'
  ) {
    return 'dark'
  }

  const ideTheme = detectIDETheme()
  const platformTheme = detectPlatformTheme()
  const preferredTheme = ideTheme ?? platformTheme

  if (normalizedEnv === 'opposite') {
    return preferredTheme === 'dark' ? 'light' : 'dark'
  }

  return preferredTheme
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
    agentToggleHeaderBg: '#f97316',
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
    agentToggleHeaderBg: '#ea580c',
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
