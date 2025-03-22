'use client'

import { ReactNode, CSSProperties } from 'react'
import { motion, HTMLMotionProps, MotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'
import { BlockColor } from './decorative-blocks'
import { ANIMATION } from './landing/constants'

export interface SectionProps extends HTMLMotionProps<'section'> {
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
  transition: { duration: ANIMATION.fadeIn.duration, delay: ANIMATION.fadeIn.delay },
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
  ...otherProps
}: SectionProps) {
  const combinedStyle = {
    ...(background ? { backgroundColor: background as string } : {}),
    ...customStyle,
  }

  // Filter out motion-specific props when not animating
  const { onDrag, onDragStart, onDragEnd, onAnimationStart, onAnimationComplete, ...htmlProps } = otherProps

  if (!animate) {
    return (
      <section
        className={cn(
          'relative overflow-hidden',
          hero ? 'py-12' : 'py-40',
          className
        )}
        style={combinedStyle}
        {...htmlProps}
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

  return (
    <motion.section
      className={cn(
        'relative overflow-hidden',
        hero ? 'py-12' : 'py-40',
        className
      )}
      style={combinedStyle}
      {...defaultAnimationProps}
      {...otherProps}
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
    </motion.section>
  )
}
