import { useEffect, useRef, useState } from 'react'

import { logger } from '../utils/logger'
import {
  spawnMacOSThemeListener,
  type ThemeListenerProcess,
} from '../utils/theme-listener-macos'
import { type ThemeName, detectSystemTheme } from '../utils/theme-system'

const DEFAULT_POLL_INTERVAL_MS = 60000 // 60 seconds

/**
 * Automatically detects system theme changes.
 * On macOS, uses a lightweight background watcher that checks every 0.5s.
 * Falls back to slower polling on other platforms or if watcher fails.
 *
 * @returns The current system theme name
 */
export const useSystemThemeDetector = (): ThemeName => {
  const [themeName, setThemeName] = useState<ThemeName>(() =>
    detectSystemTheme(),
  )
  const lastThemeRef = useRef<ThemeName>(themeName)
  const listenerRef = useRef<ThemeListenerProcess | null>(null)

  useEffect(() => {
    logger.info({ themeName }, `[theme] initial theme ${themeName}`)

    const handleThemeChange = () => {
      const currentTheme = detectSystemTheme()

      if (currentTheme !== lastThemeRef.current) {
        logger.info(
          {},
          `[theme] theme changed ${lastThemeRef.current} -> ${currentTheme}`,
        )
      } else {
        logger.info({}, '[theme] theme change event with no delta')
      }

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
    const intervalId = setInterval(handleThemeChange, DEFAULT_POLL_INTERVAL_MS)

    return () => {
      clearInterval(intervalId)
    }
  }, [])

  return themeName
}
