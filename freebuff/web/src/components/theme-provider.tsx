'use client'

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes'
import { useEffect } from 'react'

export const ThemeProvider = ({ children, ...props }: ThemeProviderProps) => {
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  return (
    <NextThemesProvider {...props} forcedTheme="dark" disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}
