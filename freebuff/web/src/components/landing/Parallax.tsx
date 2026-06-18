'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * True only on landscape/desktop widths (>=768px) and when the user hasn't
 * asked to reduce motion. Parallax is intentionally skipped on mobile where
 * vertical room is tight and a static scroll reads better.
 */
export function useDesktopParallax() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 768px)')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setEnabled(wide.matches && !reduce.matches)
    update()
    wide.addEventListener('change', update)
    reduce.addEventListener('change', update)
    return () => {
      wide.removeEventListener('change', update)
      reduce.removeEventListener('change', update)
    }
  }, [])
  return enabled
}

/**
 * Basic scroll parallax: drifts `from` → `to` (px) on translateY as the element
 * passes through the viewport. Static on mobile / reduced-motion.
 */
export function Parallax({
  children,
  from = -60,
  to = 60,
  className,
}: {
  children: React.ReactNode
  from?: number
  to?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const enabled = useDesktopParallax()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const y = useTransform(scrollYProgress, [0, 1], [from, to])

  return (
    <motion.div
      ref={ref}
      style={{ y: enabled ? y : 0 }}
      className={cn('will-change-transform', className)}
    >
      {children}
    </motion.div>
  )
}
