/**
 * Theme Hooks and Context
 *
 * Provides hook-based API for accessing themes with variant support
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react'

import { chatTheme, onThemeChange, cloneChatTheme } from '../utils/theme-system'
import type { ChatTheme } from '../utils/theme-system'
import type { ThemeVariant } from '../utils/theme-config'
import {
  getVariantConfig,
  themeConfig,
  buildThemeWithVariant,
} from '../utils/theme-config'

/**
 * Theme context value
 */
interface ThemeContextValue {
  /** Base theme from auto-detection */
  baseTheme: ChatTheme
  /** Resolved theme name (dark or light) */
  resolvedThemeName: 'dark' | 'light'
  /** Build a theme for a specific variant */
  buildVariantTheme: (variant: ThemeVariant) => ChatTheme
}

/**
 * Theme context
 */
const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Variant context for nested components
 * Allows parent components to set variant for their children
 */
const VariantContext = createContext<ThemeVariant>('transparent')

/**
 * Theme Provider Props
 */
interface ThemeProviderProps {
  children: React.ReactNode
}

/**
 * Theme Provider Component
 * Wraps app and provides theme context with variant support
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // Track base theme and resolved name
  const [baseTheme, setBaseTheme] = useState<ChatTheme>(() =>
    cloneChatTheme(chatTheme),
  )
  const [resolvedThemeName, setResolvedThemeName] = useState<'dark' | 'light'>(
    'light',
  )

  // Subscribe to theme changes from auto-detection
  useEffect(() => {
    const unsubscribe = onThemeChange((updatedTheme, meta) => {
      setBaseTheme(cloneChatTheme(updatedTheme))
      setResolvedThemeName(meta.resolvedThemeName)
    })
    return unsubscribe
  }, [])

  /**
   * Build a theme for a specific variant
   * Applies all theme layers: backgrounds, config overrides, custom colors, and plugins
   */
  const buildVariantTheme = useCallback(
    (variant: ThemeVariant): ChatTheme => {
      const variantConfig = getVariantConfig(variant)
      const clonedTheme = cloneChatTheme(baseTheme)

      return buildThemeWithVariant(
        clonedTheme,
        variant,
        variantConfig,
        resolvedThemeName,
        themeConfig.customColors,
        themeConfig.plugins,
      )
    },
    [baseTheme, resolvedThemeName],
  )

  const contextValue = useMemo(
    () => ({
      baseTheme,
      resolvedThemeName,
      buildVariantTheme,
    }),
    [baseTheme, resolvedThemeName, buildVariantTheme],
  )

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Hook to access theme for the current component context
 * Returns the theme variant set by the nearest parent component
 * or the default transparent variant if none is set
 *
 * @returns Theme object for the current context
 *
 * @example
 * // In a regular component (gets transparent theme)
 * const theme = useTheme()
 *
 * @example
 * // Inside a ModalVariant component (gets modal theme with solid backgrounds)
 * const theme = useTheme()
 */
export const useTheme = (): ChatTheme => {
  const context = useContext(ThemeContext)
  const variant = useContext(VariantContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  // Memoize theme for this variant to avoid rebuilding on every render
  const theme = useMemo(
    () => context.buildVariantTheme(variant),
    [context, variant],
  )

  return theme
}

/**
 * Hook to access the resolved theme name (dark or light)
 * @returns 'dark' or 'light' based on auto-detection
 *
 * @example
 * const themeName = useResolvedThemeName()
 * const logoColor = themeName === 'dark' ? '#ffffff' : '#000000'
 */
export const useResolvedThemeName = (): 'dark' | 'light' => {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useResolvedThemeName must be used within a ThemeProvider')
  }

  return context.resolvedThemeName
}

/**
 * Theme Variant Provider Props
 */
interface VariantProviderProps {
  variant: ThemeVariant
  children: React.ReactNode
}

/**
 * Theme Variant Provider Component
 * Sets the theme variant for all children components
 * Use this in base components (like BaseModal) to apply variant-specific theming
 *
 * @example
 * export const BaseModal = ({ children }) => (
 *   <VariantProvider variant="modal">
 *     <box style={{ backgroundColor: 'auto' }}>
 *       {children}
 *     </box>
 *   </VariantProvider>
 * )
 */
export const VariantProvider: React.FC<VariantProviderProps> = ({
  variant,
  children,
}) => {
  return (
    <VariantContext.Provider value={variant}>
      {children}
    </VariantContext.Provider>
  )
}
