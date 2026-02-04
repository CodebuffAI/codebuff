'use client'

import { motion } from 'framer-motion'

import type { BlockColor } from './decorative-blocks'
import type { ReactNode, CSSProperties } from 'react'

import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

export interface SectionProps {
  children: ReactNode
  className?: string
  containerClassName?: string
  background?: BlockColor | string
  contained?: boolean
  hero?: boolean
  fullViewport?: boolean
  animate?: boolean
  style?: CSSProperties
}

const _defaultAnimationProps = {
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
  fullViewport = false,
  animate = true,
  style: customStyle,
  ...props
}: SectionProps) {
  const style = {
    backgroundColor: background,
    ...customStyle,
  }
  const isMobile = useIsMobile()

  const content = contained ? (
    <div className={cn('codebuff-container relative z-10', containerClassName)}>
      {children}
    </div>
  ) : (
    children
  )

  return (
    <motion.section
      className={cn('relative', className)}
      initial={false}
      animate={{
        minHeight: fullViewport ? '95dvh' : 'auto',
      }}
      transition={{
        duration: 1,
        ease: [0.32, 0.72, 0, 1],
      }}
      style={{
        ...style,
        paddingTop: hero ? '1rem' : '10rem',
        paddingBottom: isMobile && hero ? '5rem' : '10rem',
      }}
      {...props}
    >
      {content}
    </motion.section>
  )
}
