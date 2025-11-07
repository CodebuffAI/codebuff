import { create } from 'zustand'

import { chatThemes, cloneChatTheme, detectSystemTheme, initializeThemeWatcher } from '../utils/theme-system'
import type { ChatTheme, ThemeName } from '../types/theme-system'

export type ThemeStoreState = {
  /** Current theme name (dark or light) */
  themeName: ThemeName
  /** Palette for the active theme */
  theme: ChatTheme
}

type ThemeStoreActions = {
  /** Update theme to a specific mode (dark or light) */
  setThemeName: (name: ThemeName) => void
}

type ThemeStore = ThemeStoreState & ThemeStoreActions

// Build initial theme
const initialThemeName = detectSystemTheme()
const initialTheme = cloneChatTheme(chatThemes[initialThemeName])

export const useThemeStore = create<ThemeStore>((set) => ({
  themeName: initialThemeName,
  theme: initialTheme,

  setThemeName: (name: ThemeName) => {
    const theme = cloneChatTheme(chatThemes[name])
    set({ themeName: name, theme })
  },
}))

// Initialize theme watcher to enable reactive updates from system theme changes
initializeThemeWatcher((name: ThemeName) => {
  // Always call setThemeName - it will handle building and updating the theme
  useThemeStore.getState().setThemeName(name)
})
