import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

import type { ThemeName } from '../types/theme-system'
import { detectPlatformTheme } from './theme-platform'
import { parseJsonWithComments } from './json'
import {
  VS_CODE_FAMILY_ENV_KEYS,
  VS_CODE_PRODUCT_DIRS,
  JETBRAINS_ENV_KEYS,
} from './ide-constants'

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

// Constants are imported from ide-constants

const normalizeThemeName = (themeName: string): string =>
  themeName.trim().toLowerCase()

const inferThemeFromName = (themeName: string): ThemeName | null => {
  const normalized = normalizeThemeName(themeName)

  for (const hint of IDE_THEME_INFERENCE.dark) {
    if (normalized.includes(hint)) return 'dark'
  }
  for (const hint of IDE_THEME_INFERENCE.light) {
    if (normalized.includes(hint)) return 'light'
  }
  return null
}

// Parsing helpers are imported from json.ts

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

let _cachedVSCodeSettingsPaths: string[] | null = null
const resolveVSCodeSettingsPaths = (): string[] => {
  if (_cachedVSCodeSettingsPaths) return _cachedVSCodeSettingsPaths
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

  _cachedVSCodeSettingsPaths = settings
  return settings
}

let _cachedJetBrainsLafPaths: string[] | null = null
const resolveJetBrainsLafPaths = (): string[] => {
  if (_cachedJetBrainsLafPaths) return _cachedJetBrainsLafPaths
  const candidates: string[] = []

  for (const key of ['IDE_CONFIG_DIR', 'JB_IDE_CONFIG_DIR']) {
    const raw = process.env[key]
    if (raw) candidates.push(join(raw, 'options', 'laf.xml'))
  }

  const home = homedir()

  const baseDirs: string[] = []
  if (process.platform === 'darwin') {
    baseDirs.push(join(home, 'Library', 'Application Support', 'JetBrains'))
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData) baseDirs.push(join(appData, 'JetBrains'))
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
  _cachedJetBrainsLafPaths = candidates
  return candidates
}

let _cachedZedSettingsPaths: string[] | null = null
const resolveZedSettingsPaths = (): string[] => {
  if (_cachedZedSettingsPaths) return _cachedZedSettingsPaths
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

  for (const dir of configDirs) paths.push(join(dir, 'settings.json'))
  _cachedZedSettingsPaths = paths
  return paths
}

const extractVSCodeTheme = (content: string): ThemeName | null => {
  // Parse settings.json safely (VS Code allows comments)
  try {
    const settings =
      parseJsonWithComments<Record<string, unknown>>(content) ?? {}

    // If VS Code is set to auto-detect based on OS, defer to platform theme
    const autoDetect = settings['window.autoDetectColorScheme']
    if (typeof autoDetect === 'boolean' && autoDetect) {
      return detectPlatformTheme()
    }

    // If a concrete color theme is set, infer via name hints
    const colorTheme = settings['workbench.colorTheme']
    if (typeof colorTheme === 'string') {
      const inferred = inferThemeFromName(colorTheme)
      if (inferred) return inferred
    }

    // If preferred themes are configured, use them as hints
    const preferredDark = settings['workbench.preferredDarkColorTheme']
    const preferredLight = settings['workbench.preferredLightColorTheme']
    if (typeof preferredDark === 'string' || typeof preferredLight === 'string') {
      // If the current theme matches one of the preferences, return accordingly
      if (typeof colorTheme === 'string') {
        const colorIsDark = typeof preferredDark === 'string' && normalizeThemeName(colorTheme) === normalizeThemeName(preferredDark)
        const colorIsLight = typeof preferredLight === 'string' && normalizeThemeName(colorTheme) === normalizeThemeName(preferredLight)
        if (colorIsDark) return 'dark'
        if (colorIsLight) return 'light'
      }
      // Otherwise, fall back to name inference from whichever preference exists
      if (typeof preferredDark === 'string') {
        const inferred = inferThemeFromName(preferredDark)
        if (inferred) return inferred
      }
      if (typeof preferredLight === 'string') {
        const inferred = inferThemeFromName(preferredLight)
        if (inferred) return inferred
      }
    }
  } catch {
    // Settings may be partially written; fall through to regex + env fallback below
  }

  // Fallback: quick regex on raw content for colorTheme
  const colorThemeMatch = content.match(/"workbench\.colorTheme"\s*:\s*"([^"]+)"/i)
  if (colorThemeMatch) {
    const inferred = inferThemeFromName(colorThemeMatch[1])
    if (inferred) return inferred
  }

  return null
}

const extractJetBrainsTheme = (content: string): ThemeName | null => {
  const normalized = content.toLowerCase()
  if (normalized.includes('darcula') || normalized.includes('dark')) return 'dark'
  if (normalized.includes('light')) return 'light'
  return null
}

const isVSCodeFamilyTerminal = (): boolean => {
  if (process.env.TERM_PROGRAM?.toLowerCase() === 'vscode') return true
  for (const key of VS_CODE_FAMILY_ENV_KEYS) if (process.env[key]) return true
  return false
}

const isJetBrainsTerminal = (): boolean => {
  if (process.env.TERMINAL_EMULATOR?.toLowerCase().includes('jetbrains')) return true
  for (const key of JETBRAINS_ENV_KEYS) if (process.env[key]) return true
  return false
}

export const isZedTerminal = (): boolean => {
  const termProgram = process.env.TERM_PROGRAM?.toLowerCase() || ''
  if (process.env.ZED_TERM || process.env.ZED_TERMINAL || process.env.ZED_SESSION) return true
  return termProgram.includes('zed')
}

const detectVSCodeTheme = (): ThemeName | null => {
  if (!isVSCodeFamilyTerminal()) return null

  // Prefer explicit env from VS Code/Cursor if available
  const themeKindEnv = process.env.VSCODE_THEME_KIND ?? process.env.VSCODE_COLOR_THEME_KIND
  if (themeKindEnv) {
    const normalized = themeKindEnv.trim().toLowerCase()
    if (normalized === 'dark' || normalized === 'hc') return 'dark'
    if (normalized === 'light') return 'light'
  }
  const settingsPaths = collectExistingPaths(resolveVSCodeSettingsPaths())
  for (const settingsPath of settingsPaths) {
    const content = safeReadFile(settingsPath)
    if (!content) continue
    const theme = extractVSCodeTheme(content)
    if (theme) return theme
  }
  return null
}

const extractZedTheme = (content: string): ThemeName | null => {
  try {
    const parsed =
      parseJsonWithComments<Record<string, unknown>>(content) ?? {}
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
          if (typeof modeTheme === 'string') candidates.push(modeTheme)
        } else if (mode === 'system') {
          // Prefer platform theme for system mode
          const systemTheme = detectPlatformTheme()
          candidates.push(systemTheme)
          const systemThemeName = themeConfig[systemTheme]
          if (typeof systemThemeName === 'string') candidates.push(systemThemeName)
        }
      }

      const darkTheme = themeConfig.dark
      if (typeof darkTheme === 'string') candidates.push(darkTheme)

      const lightTheme = themeConfig.light
      if (typeof lightTheme === 'string') candidates.push(lightTheme)
    }

    const appearance = parsed.appearance
    if (appearance && typeof appearance === 'object') {
      const appearanceTheme = (appearance as Record<string, unknown>).theme
      if (typeof appearanceTheme === 'string') candidates.push(appearanceTheme)

      const preference = (appearance as Record<string, unknown>).theme_preference
      if (typeof preference === 'string') candidates.push(preference)
    }

    const ui = parsed.ui
    if (ui && typeof ui === 'object') {
      const uiTheme = (ui as Record<string, unknown>).theme
      if (typeof uiTheme === 'string') candidates.push(uiTheme)
    }

    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue
      const inferred = inferThemeFromName(candidate)
      if (inferred) return inferred
    }
  } catch {
    // Ignore malformed or partially written files
  }
  return null
}

const detectZedTheme = (): ThemeName | null => {
  if (!isZedTerminal()) return null
  const settingsPaths = collectExistingPaths(resolveZedSettingsPaths())
  for (const settingsPath of settingsPaths) {
    const content = safeReadFile(settingsPath)
    if (!content) continue
    const theme = extractZedTheme(content)
    if (theme) return theme
  }
  return null
}

export const detectIDETheme = (): ThemeName | null => {
  const detectJetBrainsTheme = (): ThemeName | null => {
    if (!isJetBrainsTerminal()) return null
    const lafPaths = collectExistingPaths(resolveJetBrainsLafPaths())
    for (const lafPath of lafPaths) {
      const content = safeReadFile(lafPath)
      if (!content) continue
      const theme = extractJetBrainsTheme(content)
      if (theme) return theme
    }
    return null
  }

  const detectors = [detectVSCodeTheme, detectJetBrainsTheme, detectZedTheme]
  for (const detector of detectors) {
    const theme = detector()
    if (theme) return theme
  }
  return null
}

export const getIDEThemeConfigPaths = (): string[] => {
  const paths = new Set<string>()
  for (const p of resolveVSCodeSettingsPaths()) paths.add(p)
  for (const p of resolveJetBrainsLafPaths()) paths.add(p)
  for (const p of resolveZedSettingsPaths()) paths.add(p)
  return [...paths]
}
