import { useEffect, useRef, useState } from 'react'
import { type ThemeName, detectSystemTheme } from '../utils/theme-system'
import {
  spawnMacOSThemeListener,
  type ThemeListenerProcess,
} from '../utils/theme-listener-macos'

const DEFAULT_POLL_INTERVAL_MS = 60000 // 60 seconds

/**
 * Automatically detects system theme changes.
 * On macOS, uses a lightweight background watcher that checks every 0.5s.
 * Falls back to slower polling on other platforms or if watcher fails.
 *
 * @returns The current system theme name
 *
 * Environment Variables:
 * - OPEN_TUI_THEME_POLL_INTERVAL: Polling interval in milliseconds (default: 60000)
 *   Set to 0 to disable automatic polling (only affects non-macOS or if watcher fails)
 */
export const useSystemThemeDetector = (): ThemeName => {
  const [themeName, setThemeName] = useState<ThemeName>(() => detectSystemTheme())
  const lastThemeRef = useRef<ThemeName>(themeName)
  const listenerRef = useRef<ThemeListenerProcess | null>(null)

  useEffect(() => {
    const handleThemeChange = () => {
      const currentTheme = detectSystemTheme()

      // Only update state if theme actually changed
      if (currentTheme !== lastThemeRef.current) {
        lastThemeRef.current = currentTheme
        setThemeName(currentTheme)
      }
    }

    // Try to use macOS listener first (instant, event-driven)
    if (process.platform === 'darwin') {
      const listener = spawnMacOSThemeListener(handleThemeChange)
      if (listener) {
        listenerRef.current = listener
        // Successfully spawned listener, no need for polling
        return () => {
          listenerRef.current?.kill()
          listenerRef.current = null
        }
      }
    }

    // Fall back to polling for non-macOS or if listener failed
    const envInterval = process.env.OPEN_TUI_THEME_POLL_INTERVAL
    const pollIntervalMs = envInterval
      ? parseInt(envInterval, 10)
      : DEFAULT_POLL_INTERVAL_MS

    // If interval is 0 or invalid, disable polling
    if (!pollIntervalMs || pollIntervalMs <= 0 || isNaN(pollIntervalMs)) {
      return
    }

    const intervalId = setInterval(handleThemeChange, pollIntervalMs)

    return () => {
      clearInterval(intervalId)
    }
  }, [])

  return themeName
}
