import { create } from 'zustand'

import { themeConfig, buildTheme } from '../utils/theme-config'
import {
  chatThemes,
  cloneChatTheme,
  detectSystemTheme,
  initializeOSCDetection,
  initializeThemeWatcher,
  setLastDetectedTheme,
  setupFileWatchers,
} from '../utils/theme-system'

import type { ChatTheme, ThemeName } from '../types/theme-system'
import type { StoreApi, UseBoundStore } from 'zustand'

export type ThemeStoreState = {
  /** Current theme name (dark or light) */
  themeName: ThemeName
  /** Built theme with customizations applied */
  theme: ChatTheme
}

type ThemeStoreActions = {
  /** Update theme to a specific mode (dark or light) */
  setThemeName: (name: ThemeName) => void
}

type ThemeStore = ThemeStoreState & ThemeStoreActions

export let useThemeStore: UseBoundStore<StoreApi<ThemeStore>> = (() => {
  throw new Error('useThemeStore not initialized')
}) as any

export function initializeThemeStore() {
  setupFileWatchers()

  // Initialize OSC detection on module load
  initializeOSCDetection()

  // Build initial theme
  const initialThemeName = detectSystemTheme()
  setLastDetectedTheme(initialThemeName)
  const initialTheme = buildTheme(
    cloneChatTheme(chatThemes[initialThemeName]),
    initialThemeName,
    themeConfig.customColors,
    themeConfig.plugins,
  )

  useThemeStore = create<ThemeStore>((set) => ({
    themeName: initialThemeName,
    theme: initialTheme,

    setThemeName: (name: ThemeName) => {
      const baseTheme = cloneChatTheme(chatThemes[name])
      const theme = buildTheme(
        baseTheme,
        name,
        themeConfig.customColors,
        themeConfig.plugins,
      )
      set({ themeName: name, theme })
    },
  }))

  // Initialize theme watcher to enable reactive updates from system theme changes
  initializeThemeWatcher((name: ThemeName) => {
    // Always call setThemeName - it will handle building and updating the theme
    useThemeStore.getState().setThemeName(name)
  })
}
