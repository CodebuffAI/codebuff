import { type ThemeName, detectSystemTheme } from '../utils/theme-system'

/**
 * Detects the system theme once on mount.
 * No dynamic updates or transitions.
 *
 * @returns The current system theme name
 */
export const useSystemThemeDetector = (): ThemeName => {
  return detectSystemTheme()
}
