import { existsSync, readFileSync, readdirSync, statSync, watch } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

import { logger } from './logger'
import { detectTerminalTheme } from './terminal-color-detection'
import { withTerminalInputGuard } from './terminal-input-guard'

import type { MarkdownPalette } from './markdown-renderer'
import type {
  ChatTheme,
  MarkdownHeadingLevel,
  MarkdownThemeOverrides,
  ThemeName,
} from '../types/theme-system'

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
    'vs dark',
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
    'vs light',
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
] as const

const VS_CODE_PRODUCT_DIRS = [
  'Code',
  'Code - Insiders',
  'Code - OSS',
  'VSCodium',
  'VSCodium - Insiders',
  'Cursor',
] as const

const JETBRAINS_ENV_KEYS = [
  'JB_PRODUCT_CODE',
  'JB_SYSTEM_PATH',
  'JB_INSTALLATION_HOME',
  'IDEA_INITIAL_DIRECTORY',
  'IDE_CONFIG_DIR',
  'JB_IDE_CONFIG_DIR',
] as const

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
  // Try standard colorTheme setting
  const colorThemeMatch = content.match(
    /"workbench\.colorTheme"\s*:\s*"([^"]+)"/i,
  )
  if (colorThemeMatch) {
    const inferred = inferThemeFromName(colorThemeMatch[1])
    if (inferred) return inferred
  }

  // Check if auto-detect is enabled and try preferred themes
  const autoDetectMatch = content.match(
    /"window\.autoDetectColorScheme"\s*:\s*(true|false)/i,
  )
  const autoDetectEnabled = autoDetectMatch?.[1]?.toLowerCase() === 'true'

  if (autoDetectEnabled) {
    // Try to extract both preferred themes and infer from their names
    const preferredDarkMatch = content.match(
      /"workbench\.preferredDarkColorTheme"\s*:\s*"([^"]+)"/i,
    )
    if (preferredDarkMatch) {
      const inferred = inferThemeFromName(preferredDarkMatch[1])
      if (inferred) return inferred
    }

    const preferredLightMatch = content.match(
      /"workbench\.preferredLightColorTheme"\s*:\s*"([^"]+)"/i,
    )
    if (preferredLightMatch) {
      const inferred = inferThemeFromName(preferredLightMatch[1])
      if (inferred) return inferred
    }
  }

  return null
}

const extractJetBrainsTheme = (content: string): ThemeName | null => {
  // Check if autodetect is enabled (Sync with OS setting)
  const autodetectMatch = content.match(
    /<component[^>]+name="LafManager"[^>]+autodetect="(true|false)"/i,
  )
  if (autodetectMatch?.[1]?.toLowerCase() === 'true') {
    // When syncing with OS, return null to trigger platform detection
    return null
  }

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

const isZedTerminal = (): boolean => {
  const termProgram = process.env.TERM_PROGRAM?.toLowerCase()
  return termProgram === 'zed' || false
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

    // If extractVSCodeTheme returned null but auto-detect is enabled,
    // use platform theme as fallback
    const autoDetectMatch = content.match(
      /"window\.autoDetectColorScheme"\s*:\s*(true|false)/i,
    )
    if (autoDetectMatch?.[1]?.toLowerCase() === 'true') {
      return detectPlatformTheme()
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

    // If extractJetBrainsTheme returned null, check if autodetect is enabled
    // and fall back to platform detection
    const autodetectMatch = content.match(
      /<component[^>]+name="LafManager"[^>]+autodetect="(true|false)"/i,
    )
    if (autodetectMatch?.[1]?.toLowerCase() === 'true') {
      return detectPlatformTheme()
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
        // If mode is 'system', return null to trigger platform detection
        if (mode === 'system') {
          return null
        }
        if (mode === 'dark' || mode === 'light') {
          candidates.push(mode)
          const modeTheme = themeConfig[mode]
          if (typeof modeTheme === 'string') {
            candidates.push(modeTheme)
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
  if (!isZedTerminal()) {
    return null
  }

  const settingsPaths = collectExistingPaths(resolveZedSettingsPaths())
  for (const settingsPath of settingsPaths) {
    const content = safeReadFile(settingsPath)
    if (!content) continue

    const theme = extractZedTheme(content)
    if (theme) {
      return theme
    }

    // If extractZedTheme returned null, check if theme mode is 'system'
    // and fall back to platform detection
    try {
      const sanitized = stripJsonStyleComments(content)
      const parsed = JSON.parse(sanitized) as Record<string, unknown>
      const themeSetting = parsed.theme
      if (themeSetting && typeof themeSetting === 'object') {
        const themeConfig = themeSetting as Record<string, unknown>
        const modeRaw = themeConfig.mode
        if (typeof modeRaw === 'string' && modeRaw.toLowerCase() === 'system') {
          return detectPlatformTheme()
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }

  return null
}

export const detectIDETheme = (): ThemeName | null => {
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

type ChatThemeOverrides = Partial<Omit<ChatTheme, 'markdown'>> & {
  markdown?: MarkdownThemeOverrides
}

type ThemeOverrideConfig = Partial<Record<ThemeName, ChatThemeOverrides>> & {
  all?: ChatThemeOverrides
}

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

/**
 * Detect Windows PowerShell background color theme
 * Uses PowerShell's (Get-Host).UI.RawUI.BackgroundColor command
 */
function detectWindowsPowerShellTheme(): ThemeName | null {
  if (process.platform !== 'win32') return null

  const bgColor = runSystemCommand([
    'powershell',
    '-NoProfile',
    '-Command',
    '(Get-Host).UI.RawUI.BackgroundColor',
  ])

  if (!bgColor) return null

  const colorLower = bgColor.toLowerCase()

  // Dark background colors in PowerShell
  const darkColors = [
    'black',
    'darkblue',
    'darkgreen',
    'darkcyan',
    'darkred',
    'darkmagenta',
    'darkyellow',
    'darkgray',
  ]
  // Light background colors in PowerShell
  const lightColors = [
    'gray',
    'blue',
    'green',
    'cyan',
    'red',
    'magenta',
    'yellow',
    'white',
  ]

  if (darkColors.includes(colorLower)) return 'dark'
  if (lightColors.includes(colorLower)) return 'light'

  return null
}

export const detectTerminalOverrides = (): ThemeName | null => {
  const termProgram = (process.env.TERM_PROGRAM ?? '').toLowerCase()
  const term = (process.env.TERM ?? '').toLowerCase()

  return null
}

export function detectPlatformTheme(): ThemeName {
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
      // Try PowerShell background color detection first
      const powershellTheme = detectWindowsPowerShellTheme()
      if (powershellTheme) return powershellTheme

      // Fallback to Windows system theme
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

const DEFAULT_CHAT_THEMES: Record<ThemeName, ChatTheme> = {
  dark: {
    name: 'dark',
    // Core semantic colors
    primary: '#facc15',
    secondary: '#a3aed0',
    success: '#22c55e',
    error: '#ef4444',
    warning: '#FFA500',
    info: '#38bdf8',

    // Neutral scale
    foreground: '#f1f5f9',
    background: 'transparent',
    muted: '#acb3bf',
    border: '#536175',
    surface: '#202327',
    surfaceHover: '#334155',

    // Context-specific
    aiLine: '#6b7280',
    userLine: '#38bdf8',

    // Agent backgrounds
    agentToggleHeaderBg: '#f97316',
    agentToggleExpandedBg: '#1d4ed8',
    agentFocusedBg: '#334155',
    agentContentBg: '#000000',
    inputFg: '#f5f5f5',
    inputFocusedFg: '#ffffff',

    // Mode toggles
    modeFastBg: '#f97316',
    modeFastText: '#f97316',
    modeMaxBg: '#dc2626',
    modeMaxText: '#dc2626',
    modePlanBg: '#1e40af',
    modePlanText: '#1e40af',

    // Markdown
    markdown: {
      // Dark mode: slightly darker gray for less brightness
      codeBackground: '#374151',
      codeHeaderFg: '#5b647a',
      inlineCodeFg: '#fa8329',
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
      codeMonochrome: false,
    },
  },
  light: {
    name: 'light',
    // Core semantic colors
    primary: '#f59e0b',
    secondary: '#6b7280',
    success: '#059669',
    error: '#ef4444',
    warning: '#F59E0B',
    info: '#3b82f6',

    // Neutral scale
    foreground: '#111827',
    background: 'transparent',
    muted: '#6b7280',
    border: '#d1d5db',
    surface: '#f3f4f6',
    surfaceHover: '#e5e7eb',

    // AI/User context
    aiLine: '#6b7280',
    userLine: '#3b82f6',

    // Agent context
    agentToggleHeaderBg: '#ea580c',
    agentToggleExpandedBg: '#1d4ed8',
    agentFocusedBg: '#f3f4f6',
    agentContentBg: '#ffffff',
    inputFg: '#111827',
    inputFocusedFg: '#000000',

    // Mode toggles
    modeFastBg: '#f97316',
    modeFastText: '#f97316',
    modeMaxBg: '#dc2626',
    modeMaxText: '#dc2626',
    modePlanBg: '#1e40af',
    modePlanText: '#1e40af',

    // Markdown
    markdown: {
      // Light mode: lighter gray background so inline code feels airy
      codeBackground: '#f3f4f6',
      codeHeaderFg: '#6b7280',
      inlineCodeFg: '#fa8329',
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
      codeMonochrome: false,
    },
  },
}

export const chatThemes = {
  dark: DEFAULT_CHAT_THEMES.dark,
  light: DEFAULT_CHAT_THEMES.light,
}

export const createMarkdownPalette = (theme: ChatTheme): MarkdownPalette => {
  const headingDefaults: Record<MarkdownHeadingLevel, string> = {
    1: theme.primary,
    2: theme.primary,
    3: theme.primary,
    4: theme.primary,
    5: theme.primary,
    6: theme.primary,
  }

  const overrides = theme.markdown?.headingFg ?? {}

  return {
    inlineCodeFg: theme.markdown?.inlineCodeFg ?? theme.foreground,
    codeBackground: theme.markdown?.codeBackground ?? theme.background,
    codeHeaderFg: theme.markdown?.codeHeaderFg ?? theme.secondary,
    headingFg: {
      ...headingDefaults,
      ...overrides,
    },
    listBulletFg: theme.markdown?.listBulletFg ?? theme.secondary,
    blockquoteBorderFg: theme.markdown?.blockquoteBorderFg ?? theme.secondary,
    blockquoteTextFg: theme.markdown?.blockquoteTextFg ?? theme.foreground,
    dividerFg: theme.markdown?.dividerFg ?? theme.secondary,
    codeTextFg: theme.markdown?.codeTextFg ?? theme.foreground,
    codeMonochrome: theme.markdown?.codeMonochrome ?? true,
  }
}

/**
 * Exported utilities for theme system
 */

/**
 * Merge theme overrides with a base theme
 * Alias for mergeTheme to match our hook API
 */
export const mergeThemeOverrides = mergeTheme

/**
 * Clone a ChatTheme object to avoid mutations
 * Properly handles nested markdown configuration
 */
export const cloneChatTheme = (input: ChatTheme): ChatTheme => ({
  ...input,
  markdown: input.markdown
    ? {
        ...input.markdown,
        headingFg: input.markdown.headingFg
          ? { ...input.markdown.headingFg }
          : undefined,
      }
    : undefined,
})

/**
 * Resolve a theme color value with optional fallback
 * Returns undefined for 'default' values or empty strings
 */
export const resolveThemeColor = (
  color?: string,
  fallback?: string,
): string | undefined => {
  if (typeof color === 'string') {
    const normalized = color.trim().toLowerCase()
    if (normalized.length > 0 && normalized !== 'default') {
      return color
    }
  }

  if (fallback !== undefined) {
    return resolveThemeColor(fallback)
  }

  return undefined
}

/**
 * Reactive Theme Detection
 * Watches for system theme changes and updates zustand store
 */

// Debounce timing for file watcher events
const FILE_WATCHER_DEBOUNCE_MS = 250

let lastDetectedTheme: ThemeName | null = null
let themeStoreUpdater: ((name: ThemeName) => void) | null = null
// OSC detections happen asynchronously and at most once.
// We cache the resolved value so synchronous theme code can read it later
// without triggering terminal I/O.
let oscDetectedTheme: ThemeName | null = null
let pendingRecomputeTimer: NodeJS.Timeout | null = null
let themeResolver: (() => ThemeName) | null = null

export const getOscDetectedTheme = (): ThemeName | null => oscDetectedTheme
export const setThemeResolver = (resolver: () => ThemeName) => {
  themeResolver = resolver
}

/**
 * Initialize theme store updater
 * Called by theme-store on initialization to enable reactive updates
 * @param setter - Function to call when theme changes
 */
export const initializeThemeWatcher = (setter: (name: ThemeName) => void) => {
  themeStoreUpdater = setter
}

/**
 * Recompute system theme and update store if it changed
 * @param source - Source of the recomputation (for debugging)
 */
const recomputeSystemTheme = (source: string) => {
  // Only recompute if theme is auto-detected (not explicitly set)
  const envPreference = process.env.OPEN_TUI_THEME ?? process.env.OPENTUI_THEME
  if (envPreference && envPreference.toLowerCase() !== 'opposite') {
    // User explicitly set theme, don't react to system changes
    return
  }

  if (!themeResolver) {
    return
  }

  const newTheme = themeResolver()

  // Always call the updater and let it decide if an update is needed
  lastDetectedTheme = newTheme
  if (themeStoreUpdater) {
    themeStoreUpdater(newTheme)
  }
}

/**
 * Debounced version of recomputeSystemTheme for file watcher events
 * Prevents excessive recomputations when files change rapidly
 */
const debouncedRecomputeSystemTheme = (source: string) => {
  if (pendingRecomputeTimer) {
    clearTimeout(pendingRecomputeTimer)
  }
  pendingRecomputeTimer = setTimeout(() => {
    pendingRecomputeTimer = null
    recomputeSystemTheme(source)
  }, FILE_WATCHER_DEBOUNCE_MS)
}

lastDetectedTheme = null as unknown as ThemeName
export function setLastDetectedTheme(theme: ThemeName) {
  lastDetectedTheme = theme
}

/**
 * Setup file watchers for theme changes
 * Watches parent directories which reliably catches all file modifications
 */
export const setupFileWatchers = () => {
  const watchTargets: string[] = []
  const watchedDirs = new Set<string>()

  // macOS system preferences
  if (process.platform === 'darwin') {
    watchTargets.push(
      join(homedir(), 'Library/Preferences/.GlobalPreferences.plist'),
      join(homedir(), 'Library/Preferences/com.apple.Terminal.plist'),
    )
  }

  // IDE config files - only watch for the active IDE terminal
  if (isVSCodeFamilyTerminal()) {
    watchTargets.push(...resolveVSCodeSettingsPaths())
  }
  if (isJetBrainsTerminal()) {
    watchTargets.push(...resolveJetBrainsLafPaths())
  }
  if (isZedTerminal()) {
    watchTargets.push(...resolveZedSettingsPaths())
  }

  // Watch parent directories instead of individual files
  // Directory watches are more reliable for catching all modifications including plist key deletions
  for (const target of watchTargets) {
    if (existsSync(target)) {
      const parentDir = dirname(target)

      // Only watch each directory once
      if (watchedDirs.has(parentDir)) continue
      watchedDirs.add(parentDir)

      try {
        // Watch the directory - catches all file modifications
        const watcher = watch(
          parentDir,
          { persistent: false },
          (eventType, filename) => {
            // Only respond to changes affecting our target files
            if (filename && watchTargets.some((t) => t.endsWith(filename))) {
              debouncedRecomputeSystemTheme(
                `watch:${join(parentDir, filename)}:${eventType}`,
              )
            }
          },
        )

        watcher.on('error', () => {
          // Silently ignore watcher errors
        })
      } catch {
        // Silently ignore if we can't watch
      }
    }
  }
}

/**
 * SIGUSR2 signal handler for manual theme refresh
 * Users can send `kill -USR2 <pid>` to force theme recomputation
 */
export function enableManualThemeRefresh() {
  process.on('SIGUSR2', () => {
    recomputeSystemTheme('signal:SIGUSR2')
  })
}

/**
 * OSC Terminal Theme Detection
 * Query terminal colors once at startup using OSC 10/11
 */

const OSC_DETECTION_TIMEOUT_MS = 3000 // Global timeout for OSC detection

/**
 * Initialize OSC theme detection with a one-time check
 * Runs in a separate process to avoid blocking and hiding I/O from user
 */
export function initializeOSCDetection(): void {
  const ideTheme = detectIDETheme()
  if (ideTheme) {
    return
  }
  void detectOSCInBackground()
}

/**
 * Run OSC detection with terminal input guard and global timeout
 * This prevents blocking the main thread and hides terminal I/O from the user
 */
async function detectOSCInBackground(): Promise<void> {
  // Skip on Windows where OSC queries can hang PowerShell
  if (process.platform === 'win32') {
    return
  }

  // Create a timeout promise that will resolve to undefined
  let timeoutId: NodeJS.Timeout | null = null
  const timeoutPromise = new Promise<void>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve()
    }, OSC_DETECTION_TIMEOUT_MS)
  })

  // Create the actual detection promise
  const detectionPromise = (async () => {
    try {
      await withTerminalInputGuard(async () => {
        const theme = await detectTerminalTheme()
        if (theme) {
          oscDetectedTheme = theme
          recomputeSystemTheme('osc-inline')
        }
      })
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'OSC detection failed',
      )
    }
  })()

  // Race between detection and timeout
  await Promise.race([detectionPromise, timeoutPromise])

  // Clean up timeout
  if (timeoutId) {
    clearTimeout(timeoutId)
  }
}
