'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { type ThemeProviderProps } from 'next-themes'
import { useEffect } from 'react'

export const ThemeProvider = ({ children, ...props }: ThemeProviderProps) => {
  // Force dark mode and disable theme switching
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  return (
    <NextThemesProvider {...props} forcedTheme="dark" disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}
