'use client'

import { ReactNode, CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { BlockColor } from './decorative-blocks'

export interface SectionProps {
  children: ReactNode
  className?: string
  containerClassName?: string
  background?: BlockColor | string
  contained?: boolean
  hero?: boolean // special case for hero section
  animate?: boolean
  style?: CSSProperties
}

const defaultAnimationProps = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5, delay: 0.2 },
}

export function Section({
  children,
  className,
  containerClassName,
  background,
  contained = true,
  hero = false,
  animate = true,
  style: customStyle,
  ...props
}: SectionProps) {
  const style = {
    backgroundColor: background,
    ...customStyle,
  }

  return (
    <section
      className={cn(
        'relative overflow-hidden',
        hero ? 'pt-4 md:pt-8 md:pb-16' : 'py-40',
        className
      )}
      style={style}
      {...props}
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
