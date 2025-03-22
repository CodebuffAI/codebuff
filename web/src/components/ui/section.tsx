'use client'

import { cn } from '@/lib/utils'
import { ReactNode } from 'react'
import { BlockColor } from './decorative-blocks'

interface SectionProps {
  children: ReactNode
  className?: string
  containerClassName?: string
  background?: BlockColor | string
  contained?: boolean // whether to use container width
  hero?: boolean // special case for hero section
}

export function Section({
  children,
  className,
  containerClassName,
  background,
  contained = true,
  hero = false,
}: SectionProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden',
        hero ? 'py-12' : 'py-40',
        className
      )}
      style={background ? { background } : undefined}
    >
      {contained ? (
        <div
          className={cn('codebuff-container relative z-10', containerClassName)}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  )
}
