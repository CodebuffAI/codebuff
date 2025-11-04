import { existsSync, readFileSync, readdirSync, statSync, watch } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

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

type ChatThemeOverrides = Partial<Omit<ChatTheme, 'markdown'>> & {
  markdown?: MarkdownThemeOverrides
}

type ThemeOverrideConfig = Partial<Record<ThemeName, ChatThemeOverrides>> & {
  all?: ChatThemeOverrides
}

const CHAT_THEME_ENV_KEYS = [
  'OPEN_TUI_CHAT_THEME_OVERRIDES',
  'OPENTUI_CHAT_THEME_OVERRIDES',
] as const

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
    muted: '#9ca3af',
    border: '#334155',
    surface: '#000000',
    surfaceHover: '#334155',

    // Context-specific
    aiLine: '#34d399',
    userLine: '#38bdf8',

    // Agent backgrounds
    agentToggleHeaderBg: '#f97316',
    agentToggleExpandedBg: '#1d4ed8',
    agentFocusedBg: '#334155',
    agentContentBg: '#000000',

    // Input
    inputBg: '#000000',
    inputFg: '#f5f5f5',
    inputFocusedBg: '#000000',
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
    aiLine: '#059669',
    userLine: '#3b82f6',

    // Agent context
    agentToggleHeaderBg: '#ea580c',
    agentToggleExpandedBg: '#1d4ed8',
    agentFocusedBg: '#f3f4f6',
    agentContentBg: '#ffffff',

    // Input
    inputBg: '#f9fafb',
    inputFg: '#111827',
    inputFocusedBg: '#ffffff',
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

let lastDetectedTheme: ThemeName | null = null
let themeStoreUpdater: ((name: ThemeName) => void) | null = null

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

  const newTheme = detectSystemTheme()

  // Always call the updater and let it decide if an update is needed
  lastDetectedTheme = newTheme
  if (themeStoreUpdater) {
    themeStoreUpdater(newTheme)
  }
}

// Initialize on module load
lastDetectedTheme = detectSystemTheme()

/**
 * Setup file watchers for theme changes
 * Watches parent directories which reliably catches all file modifications
 */
const setupFileWatchers = () => {
  const watchTargets: string[] = []
  const watchedDirs = new Set<string>()

  // macOS system preferences
  if (process.platform === 'darwin') {
    watchTargets.push(
      join(homedir(), 'Library/Preferences/.GlobalPreferences.plist'),
      join(homedir(), 'Library/Preferences/com.apple.Terminal.plist'),
    )
  }

  // IDE config files that we should watch
  const ideConfigPaths = getIDEThemeConfigPaths()
  watchTargets.push(...ideConfigPaths)

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
              recomputeSystemTheme(
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

setupFileWatchers()

/**
 * SIGUSR2 signal handler for manual theme refresh
 * Users can send `kill -USR2 <pid>` to force theme recomputation
 */
process.on('SIGUSR2', () => {
  recomputeSystemTheme('signal:SIGUSR2')
})
