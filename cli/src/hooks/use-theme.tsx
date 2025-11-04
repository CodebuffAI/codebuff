/**
 * Theme Hooks
 *
 * Simple hooks for accessing theme from zustand store
 */

import { useThemeStore } from '../state/theme-store'
import type { ChatTheme } from '../types/theme-system'

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
  return useThemeStore((state) => state.theme)
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
  return useThemeStore((state) => state.themeName)
}
