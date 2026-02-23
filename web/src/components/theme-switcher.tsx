'use client'

import type { ComponentProps } from 'react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { Icons } from '@/components/icons'
import { Button } from '@/components/ui/button'

type ThemeSwitcherProps = {
  className?: ComponentProps<'button'>['className']
}

export const ThemeSwitcher = ({ className }: ThemeSwitcherProps) => {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <Button className={className} variant="ghost" size="icon" aria-label="Toggle theme" disabled>
        <Icons.moon className="h-4 w-4" />
      </Button>
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      className={className}
      variant="ghost"
      size="icon"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Icons.sun className="h-4 w-4" /> : <Icons.moon className="h-4 w-4" />}
    </Button>
  )
}
