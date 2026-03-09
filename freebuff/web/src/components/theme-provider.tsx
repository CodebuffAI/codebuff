'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { type ComponentProps, useEffect } from 'react'

type ThemeProviderProps = ComponentProps<typeof NextThemesProvider>

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
