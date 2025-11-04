/**
 * Theme Hooks and Context
 *
 * Provides hook-based API for accessing themes
 */

import React, {
  createContext,
  useContext,
  useState,
  useMemo,
} from 'react'

import { chatThemes, cloneChatTheme, detectSystemTheme } from '../utils/theme-system'
import type { ChatTheme } from '../types/theme-system'
import { themeConfig, buildTheme } from '../utils/theme-config'

/**
 * Theme context value
 */
interface ThemeContextValue {
  /** Current theme with customizations applied */
  theme: ChatTheme
  /** Resolved theme name (dark or light) */
  resolvedThemeName: 'dark' | 'light'
}

/**
 * Theme context
 */
const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Theme Provider Props
 */
interface ThemeProviderProps {
  children: React.ReactNode
}

/**
 * Theme Provider Component
 * Wraps app and provides theme context
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // Detect system theme
  const [resolvedThemeName] = useState<'dark' | 'light'>(() => detectSystemTheme())

  // Build theme with customizations
  const theme = useMemo(() => {
    const baseTheme = cloneChatTheme(chatThemes[resolvedThemeName])
    return buildTheme(
      baseTheme,
      resolvedThemeName,
      themeConfig.customColors,
      themeConfig.plugins,
    )
  }, [resolvedThemeName])

  const contextValue = useMemo(
    () => ({
      theme,
      resolvedThemeName,
    }),
    [theme, resolvedThemeName],
  )

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Hook to access theme for the current component
 *
 * @returns Theme object
 *
 * @example
 * const theme = useTheme()
 * <box style={{ backgroundColor: theme.background, color: theme.foreground }}>
 */
export const useTheme = (): ChatTheme => {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context.theme
}

/**
 * Hook to access the resolved theme name (dark or light)
 * @returns 'dark' or 'light' based on auto-detection
 *
 * @example
 * const themeName = useResolvedThemeName()
 * // Use if you need conditional logic based on light/dark mode
 */
export const useResolvedThemeName = (): 'dark' | 'light' => {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useResolvedThemeName must be used within a ThemeProvider')
  }

  return context.resolvedThemeName
}
