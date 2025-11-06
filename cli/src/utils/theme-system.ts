import { existsSync, watch } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

import type { ThemeName } from '../types/theme-system'
export type { ThemeName } from '../types/theme-system'

import { detectTerminalTheme, terminalLikelySupportsOSC } from './terminal-color-detection'
import { detectIDETheme, getIDEThemeConfigPaths } from './theme-ide'
import { detectPlatformTheme } from './theme-platform'

// Re-export helpers and theming utilities for compatibility
export { isZedTerminal } from './theme-ide'

// -----------------------------
// Default Chat Themes (no overrides)
// -----------------------------
import type { ChatTheme } from '../types/theme-system'

const DEFAULT_CHAT_THEMES: Record<ThemeName, ChatTheme> = {
  dark: {
    primary: '#facc15',
    secondary: '#a3aed0',
    success: '#22c55e',
    error: '#ef4444',
    warning: '#FFA500',
    info: '#38bdf8',
    foreground: '#f1f5f9',
    background: 'transparent',
    muted: '#9ca3af',
    border: '#334155',
    surface: '#000000',
    surfaceHover: '#334155',
    aiLine: '#34d399',
    userLine: '#38bdf8',
    agentToggleHeaderBg: '#f97316',
    agentToggleExpandedBg: '#1d4ed8',
    agentFocusedBg: '#334155',
    agentContentBg: '#000000',
    inputBg: '#000000',
    inputFg: '#f5f5f5',
    inputFocusedBg: '#000000',
    inputFocusedFg: '#ffffff',
    modeFastBg: '#f97316',
    modeFastText: '#f97316',
    modeMaxBg: '#dc2626',
    modeMaxText: '#dc2626',
    modePlanBg: '#1e40af',
    modePlanText: '#1e40af',
    markdown: {
      codeBackground: '#1f2933',
      codeHeaderFg: '#5b647a',
      inlineCodeFg: '#f1f5f9',
      codeTextFg: '#f1f5f9',
      headingFg: { 1: '#facc15', 2: '#facc15', 3: '#facc15', 4: '#facc15', 5: '#facc15', 6: '#facc15' },
      listBulletFg: '#a3aed0',
      blockquoteBorderFg: '#334155',
      blockquoteTextFg: '#e2e8f0',
      dividerFg: '#283042',
      codeMonochrome: true,
    },
  },
  light: {
    primary: '#f59e0b',
    secondary: '#6b7280',
    success: '#059669',
    error: '#ef4444',
    warning: '#F59E0B',
    info: '#3b82f6',
    foreground: '#111827',
    background: 'transparent',
    muted: '#6b7280',
    border: '#d1d5db',
    surface: '#ffffff',
    surfaceHover: '#f3f4f6',
    aiLine: '#10b981',
    userLine: '#3b82f6',
    agentToggleHeaderBg: '#2563eb',
    agentToggleExpandedBg: '#fde68a',
    agentFocusedBg: '#d1d5db',
    agentContentBg: '#ffffff',
    inputBg: '#ffffff',
    inputFg: '#111827',
    inputFocusedBg: '#ffffff',
    inputFocusedFg: '#111827',
    modeFastBg: '#f59e0b',
    modeFastText: '#f59e0b',
    modeMaxBg: '#ef4444',
    modeMaxText: '#ef4444',
    modePlanBg: '#2563eb',
    modePlanText: '#2563eb',
    markdown: {
      codeBackground: '#f3f4f6',
      codeHeaderFg: '#6b7280',
      inlineCodeFg: '#dc2626',
      codeTextFg: '#111827',
      headingFg: { 1: '#dc2626', 2: '#dc2626', 3: '#dc2626', 4: '#dc2626', 5: '#dc2626', 6: '#dc2626' },
      listBulletFg: '#6b7280',
      blockquoteBorderFg: '#d1d5db',
      blockquoteTextFg: '#374151',
      dividerFg: '#e5e7eb',
      codeMonochrome: true,
    },
  },
}

export const chatThemes = DEFAULT_CHAT_THEMES

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

// No markdown palette helpers; markdown renderer uses its own defaults.

// -----------------------------
// Theme Resolution (no env mode)
// -----------------------------

export type ThemeSource = 'terminal' | 'ide' | 'platform' | 'default'

export interface ThemeResolution {
  selected: ThemeName
  source: ThemeSource
  candidates: {
    terminal: ThemeName | null
    ide: ThemeName | null
    platform: ThemeName | null
  }
}

export const computePreferredThemeDetailed = (params: {
  lastTerminal: ThemeName | null
  ide: ThemeName | null
  platform: ThemeName | null
}): ThemeResolution => {
  const { lastTerminal, ide, platform } = params

  if (lastTerminal) {
    return {
      selected: lastTerminal,
      source: 'terminal',
      candidates: { terminal: lastTerminal, ide, platform },
    }
  }
  if (ide) {
    return {
      selected: ide,
      source: 'ide',
      candidates: { terminal: lastTerminal, ide, platform },
    }
  }
  if (platform) {
    return {
      selected: platform,
      source: 'platform',
      candidates: { terminal: lastTerminal, ide, platform },
    }
  }

  return {
    selected: 'dark',
    source: 'default',
    candidates: { terminal: lastTerminal, ide, platform },
  }
}

export const computePreferredTheme = (params: {
  lastTerminal: ThemeName | null
  ide: ThemeName | null
  platform: ThemeName | null
}): ThemeName => computePreferredThemeDetailed(params).selected

export const detectSystemTheme = (): ThemeName => {
  // If running in Ghostty, default to dark unless a stronger preference exists
  if (
    (typeof Bun !== 'undefined' && Bun.env.GHOSTTY_RESOURCES_DIR !== undefined) ||
    process.env.GHOSTTY_RESOURCES_DIR !== undefined ||
    (process.env.TERM ?? '').toLowerCase() === 'xterm-ghostty'
  ) {
    return 'dark'
  }

  const ideTheme = detectIDETheme()
  const platformTheme = detectPlatformTheme()
  return computePreferredTheme({
    lastTerminal: lastDetectedTerminalTheme,
    ide: ideTheme,
    platform: platformTheme,
  })
}

// -----------------------------
// Reactive watching & polling
// -----------------------------

let lastDetectedTheme: ThemeName | null = null
let lastDetectedTerminalTheme: ThemeName | null = null
let themeStoreUpdater: ((name: ThemeName) => void) | null = null
let pollingInterval: NodeJS.Timeout | null = null
let pollingInFlight = false

// Debounce recomputations triggered by noisy file watcher events
let pendingRecomputeTimer: NodeJS.Timeout | null = null
const enqueueRecomputeSystemTheme = (reason: string) => {
  if (pendingRecomputeTimer) clearTimeout(pendingRecomputeTimer)
  pendingRecomputeTimer = setTimeout(() => {
    pendingRecomputeTimer = null
    recomputeSystemTheme(reason)
  }, 250)
}

export const initializeThemeWatcher = (setter: (name: ThemeName) => void) => {
  themeStoreUpdater = setter
}

const recomputeSystemTheme = (_source: string) => {
  const newTheme = detectSystemTheme()
  if (newTheme !== lastDetectedTheme) {
    lastDetectedTheme = newTheme
    if (themeStoreUpdater) themeStoreUpdater(newTheme)
  }
}

// Initialize on module load
lastDetectedTheme = detectSystemTheme()

// macOS system preference files that reflect appearance/theme
// We watch these to react to OS appearance changes when terminals don't answer OSC
const getMacOSPreferencePaths = (): string[] => {
  if (process.platform !== 'darwin') return []
  const home = homedir()
  const prefsDir = join(home, 'Library', 'Preferences')
  return [
    join(prefsDir, '.GlobalPreferences.plist'),
    join(prefsDir, 'com.apple.Terminal.plist'),
    join(prefsDir, 'com.googlecode.iterm2.plist'),
  ]
}

const themeWatchDisabled = (): boolean => {
  const disableWatchRaw = (
    process.env.OPEN_TUI_DISABLE_THEME_WATCH ??
    process.env.OPENTUI_DISABLE_THEME_WATCH
  )?.toLowerCase()
  return disableWatchRaw === '1' || disableWatchRaw === 'true'
}

const setupFileWatchers = () => {
  // Allow disabling file watching via env
  if (themeWatchDisabled()) return

  const watchTargets: string[] = []
  const watchedDirs = new Set<string>()

  // IDE config files that we should watch
  const ideConfigPaths = getIDEThemeConfigPaths()
  watchTargets.push(...ideConfigPaths)

  // macOS system preference files to detect OS appearance changes
  const macPrefs = getMacOSPreferencePaths()
  watchTargets.push(...macPrefs)
  const macPrefParents = new Set<string>(macPrefs.map((p) => dirname(p)))

  for (const target of watchTargets) {
    if (!existsSync(target)) continue
    const parentDir = dirname(target)
    if (watchedDirs.has(parentDir)) continue
    watchedDirs.add(parentDir)

    try {
      const watcher = watch(
        parentDir,
        { persistent: false },
        (eventType, filename) => {
          if (macPrefParents.has(parentDir)) {
            enqueueRecomputeSystemTheme(
              `watch-macos:${join(parentDir, filename ?? '')}:${eventType}`,
            )
            return
          }
          if (filename && watchTargets.some((t) => t.endsWith(filename))) {
            enqueueRecomputeSystemTheme(
              `watch:${join(parentDir, filename)}:${eventType}`,
            )
          }
        },
      )
      watcher.on('error', () => {
        // Ignore watch errors
      })
    } catch {
      // Ignore inability to watch
    }
  }
}

setupFileWatchers()

const pollTerminalColors = async () => {
  try {
    if (pollingInFlight) return
    pollingInFlight = true
    const terminalTheme = await detectTerminalTheme()
    if (terminalTheme && terminalTheme !== lastDetectedTerminalTheme) {
      lastDetectedTerminalTheme = terminalTheme
      lastDetectedTheme = terminalTheme
      if (themeStoreUpdater) themeStoreUpdater(terminalTheme)
    }
  } catch {
    // Ignore polling errors
  } finally {
    pollingInFlight = false
  }
}

let pollerProcess: any = null
let socketClient: any = null
const SOCKET_PATH = '/tmp/codebuff-terminal-theme.sock'

const startTerminalColorPolling = () => {
  // Allow disabling polling via env
  if (themeWatchDisabled()) return

  const supportsOSC = terminalLikelySupportsOSC()
  if (!supportsOSC) return

  try {
    // Spawn a completely detached daemon that broadcasts via Unix socket
    // This avoids ANY connection to the parent's terminal I/O
    const { spawn } = require('child_process')
    const { join } = require('path')
    const { connect } = require('net')

    const daemonPath = join(__dirname, 'terminal-theme-daemon.ts')

    // Spawn completely detached with no stdio connection
    pollerProcess = spawn(process.execPath, [daemonPath], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        SOCKET_PATH,
      },
    })

    // Unref so parent can exit independently
    pollerProcess.unref()

    // Wait a moment for daemon to create socket, then connect
    setTimeout(() => {
      try {
        socketClient = connect(SOCKET_PATH)

        socketClient.on('data', (data: Buffer) => {
          const theme = data.toString().trim() as ThemeName
          if (theme && (theme === 'dark' || theme === 'light')) {
            if (theme !== lastDetectedTerminalTheme) {
              lastDetectedTerminalTheme = theme
              lastDetectedTheme = theme
              if (themeStoreUpdater) themeStoreUpdater(theme)
            }
          }
        })

        socketClient.on('error', (_err: any) => {})

        socketClient.on('close', () => {})

      } catch (err) {
        // Ignore connection errors
      }
    }, 500)

  } catch (err) {
    // Ignore failures to start daemon
  }
}

startTerminalColorPolling()

process.on('SIGUSR2', () => {
  recomputeSystemTheme('signal:SIGUSR2')
})

process.on('exit', () => {
  if (pollingInterval) clearInterval(pollingInterval)
  if (socketClient) {
    try {
      socketClient.destroy()
    } catch {}
  }
  if (pollerProcess) {
    try {
      pollerProcess.kill()
    } catch {}
  }
})
