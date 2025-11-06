import { existsSync, watch, type FSWatcher } from 'fs'
import { homedir, tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import { connect, type Socket } from 'net'

import type { ThemeName } from '../types/theme-system'
export type { ThemeName } from '../types/theme-system'

import { detectTerminalTheme, terminalLikelySupportsOSC } from './terminal-color-detection'
import { logger } from './logger'
import { detectIDETheme, getIDEThemeConfigPaths } from './theme-ide'
import { detectPlatformTheme } from './theme-platform'

// Timing constants
const FILE_WATCHER_DEBOUNCE_MS = 250
const SOCKET_CONNECT_INITIAL_DELAY_MS = 500
const SOCKET_CONNECT_RETRY_DELAY_MS = 200
const SOCKET_CONNECT_MAX_RETRIES = 5
const SOCKET_SHUTDOWN_TIMEOUT_MS = 1000

// Re-export helpers and theming utilities for compatibility
export { isZedTerminal } from './theme-ide'

// -----------------------------
// Default Chat Themes (no overrides)
// -----------------------------
import type { ChatTheme } from '../types/theme-system'

// __dirname in ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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

// Track active file watchers for cleanup
const activeWatchers: FSWatcher[] = []

// Debounce recomputations triggered by noisy file watcher events
let pendingRecomputeTimer: NodeJS.Timeout | null = null
const enqueueRecomputeSystemTheme = (reason: string) => {
  if (pendingRecomputeTimer) clearTimeout(pendingRecomputeTimer)
  pendingRecomputeTimer = setTimeout(() => {
    pendingRecomputeTimer = null
    recomputeSystemTheme(reason)
  }, FILE_WATCHER_DEBOUNCE_MS)
}

/**
 * Get a secure directory for socket files
 * Prefers XDG_RUNTIME_DIR (user-specific, tmpfs-backed) over /tmp
 */
function getSocketDir(): string {
  // XDG_RUNTIME_DIR is user-specific and automatically cleaned up
  if (process.env.XDG_RUNTIME_DIR && existsSync(process.env.XDG_RUNTIME_DIR)) {
    return process.env.XDG_RUNTIME_DIR
  }
  // Fallback to tmpdir (usually /tmp)
  return tmpdir()
}

/**
 * Get socket path for daemon communication
 */
function getSocketPath(): string {
  const dir = getSocketDir()
  return join(dir, `codebuff-terminal-theme-${process.pid}.sock`)
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

      // Handle watcher errors and cleanup
      watcher.on('error', (err) => {
        logger.debug({ source: 'theme', err, dir: parentDir }, 'file watcher error')
        try {
          watcher.close()
        } catch {}
        // Remove from active watchers
        const index = activeWatchers.indexOf(watcher)
        if (index !== -1) activeWatchers.splice(index, 1)
      })

      // Track watcher for cleanup
      activeWatchers.push(watcher)
    } catch (err) {
      logger.debug({ source: 'theme', err, dir: parentDir }, 'failed to setup file watcher')
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
let socketClient: Socket | null = null
const SOCKET_PATH = getSocketPath()

/**
 * Connect to daemon socket with retry logic
 */
async function connectToDaemonSocket(): Promise<Socket | null> {
  let retries = 0

  while (retries < SOCKET_CONNECT_MAX_RETRIES) {
    try {
      const client = connect(SOCKET_PATH)

      // Wait for connection or error
      await new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          client.removeListener('error', onError)
          resolve()
        }
        const onError = (err: Error) => {
          client.removeListener('connect', onConnect)
          reject(err)
        }
        client.once('connect', onConnect)
        client.once('error', onError)
      })

      logger.debug(
        { source: 'theme', socket: SOCKET_PATH, retries },
        'connected to terminal theme daemon',
      )

      return client
    } catch (err) {
      retries++
      if (retries < SOCKET_CONNECT_MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, SOCKET_CONNECT_RETRY_DELAY_MS))
      }
    }
  }

  logger.debug(
    { source: 'theme', socket: SOCKET_PATH, maxRetries: SOCKET_CONNECT_MAX_RETRIES },
    'failed to connect to daemon after retries',
  )
  return null
}

const startTerminalColorPolling = () => {
  // Allow disabling polling via env
  if (themeWatchDisabled()) return

  // In compiled binary builds, skip external daemon spawn (no filesystem)
  if (process.env.CODEBUFF_IS_BINARY === 'true') {
    logger.debug(
      { source: 'theme', reason: 'compiled-binary' },
      'skip terminal polling in binary build',
    )
    return
  }

  const supportsOSC = terminalLikelySupportsOSC()
  if (!supportsOSC) {
    logger.debug({ source: 'theme', reason: 'no-osc-support' }, 'skip terminal polling')
    return
  }

  try {
    // Resolve compiled daemon in dist, fallback to TS in src during dev
    const jsPathRoot = join(__dirname, 'terminal-theme-daemon.js')
    const jsPathUtils = join(__dirname, 'utils', 'terminal-theme-daemon.js')
    const tsPath = join(__dirname, 'terminal-theme-daemon.ts')
    const daemonPath =
      (existsSync(jsPathRoot) && jsPathRoot) ||
      (existsSync(jsPathUtils) && jsPathUtils) ||
      (existsSync(tsPath) && tsPath) ||
      ''

    logger.debug(
      { source: 'theme', daemonPath, exists: existsSync(daemonPath) },
      'resolved terminal theme daemon path',
    )

    if (!daemonPath) {
      logger.debug(
        { source: 'theme' },
        'no daemon path available; skipping terminal polling',
      )
      return
    }

    // Spawn completely detached with no stdio connection
    pollerProcess = spawn(process.execPath, [daemonPath], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        SOCKET_PATH,
        PARENT_PID: process.pid.toString(),
      },
    })

    // Unref so parent can exit independently
    pollerProcess.unref()
    logger.debug(
      { source: 'theme', pid: pollerProcess.pid, socket: SOCKET_PATH },
      'spawned terminal theme daemon',
    )

    // Wait briefly for daemon to create socket, then connect with retry
    setTimeout(async () => {
      try {
        const client = await connectToDaemonSocket()
        if (!client) {
          logger.debug({ source: 'theme' }, 'failed to connect to daemon after retries')
          return
        }

        socketClient = client

        socketClient.on('data', (data: Buffer) => {
          const message = data.toString().trim()

          // Handle theme updates (format: "dark\n" or "light\n")
          if (message === 'dark' || message === 'light') {
            const theme = message as ThemeName
            if (theme !== lastDetectedTerminalTheme) {
              lastDetectedTerminalTheme = theme
              lastDetectedTheme = theme
              if (themeStoreUpdater) themeStoreUpdater(theme)
              logger.debug(
                { source: 'theme', theme },
                'terminal theme updated from daemon',
              )
            }
          }
        })

        socketClient.on('error', (err: any) => {
          logger.debug({ source: 'theme', err }, 'daemon socket error')
        })

        socketClient.on('close', () => {
          logger.debug({ source: 'theme' }, 'daemon socket closed')
          socketClient = null
        })

      } catch (err) {
        logger.debug({ source: 'theme', err }, 'failed to connect to daemon')
      }
    }, SOCKET_CONNECT_INITIAL_DELAY_MS)

  } catch (err) {
    logger.debug({ source: 'theme', err }, 'failed to start terminal theme daemon')
  }
}

startTerminalColorPolling()

process.on('SIGUSR2', () => {
  recomputeSystemTheme('signal:SIGUSR2')
})

/**
 * Send shutdown command to daemon and wait for acknowledgment
 */
async function sendShutdownToDaemon(): Promise<boolean> {
  if (!socketClient) return false

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      resolve(false)
    }, SOCKET_SHUTDOWN_TIMEOUT_MS)

    const onData = (data: Buffer) => {
      const message = data.toString().trim()
      if (message === 'OK') {
        clearTimeout(timeout)
        socketClient?.removeListener('data', onData)
        resolve(true)
      }
    }

    socketClient.on('data', onData)
    socketClient.write('SHUTDOWN\n')
  })
}

async function cleanupPoller(reason: string) {
  try {
    if (pollingInterval) clearInterval(pollingInterval)

    // Try graceful shutdown via socket first
    if (socketClient) {
      logger.debug({ source: 'theme', reason }, 'sending shutdown command to daemon')
      const shutdownSuccess = await sendShutdownToDaemon()

      if (shutdownSuccess) {
        logger.debug({ source: 'theme' }, 'daemon acknowledged shutdown')
      } else {
        logger.debug({ source: 'theme' }, 'daemon shutdown timeout, forcing kill')
      }

      try {
        socketClient.destroy()
      } catch {}
      socketClient = null
    }

    // Force kill if still running (should rarely be needed with health checks)
    if (pollerProcess) {
      try {
        pollerProcess.kill()
      } catch {}
      pollerProcess = null
    }

    // Close all file watchers
    for (const watcher of activeWatchers) {
      try {
        watcher.close()
      } catch {}
    }
    activeWatchers.length = 0
  } finally {
    logger.debug({ source: 'theme', reason }, 'cleaned up terminal polling resources')
  }
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'] as const) {
  process.on(sig, () => cleanupPoller(`signal:${sig}`))
}

process.on('exit', () => cleanupPoller('exit'))
