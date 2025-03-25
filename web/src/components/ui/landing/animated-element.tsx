import { motion, HTMLMotionProps } from 'framer-motion'
import { ANIMATION } from './constants'
import { ReactNode } from 'react'

interface AnimatedElementProps extends HTMLMotionProps<'div'> {
  children: ReactNode
  delay?: number
  type?: 'fade' | 'slide' | 'scale'
}

const variants = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
  },
  slide: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
  },
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
  },
}

const getAnimationConfig = (type: 'fade' | 'slide' | 'scale') => {
  switch (type) {
    case 'fade':
      return {
        duration: ANIMATION.fadeIn.duration,
        delay: ANIMATION.fadeIn.delay,
      }
    case 'slide':
      return {
        duration: ANIMATION.slideUp.duration,
        delay: ANIMATION.slideUp.delay,
      }
    case 'scale':
      return {
        duration: ANIMATION.scale.duration,
        ease: ANIMATION.scale.ease,
      }
  }
}

export function AnimatedElement({
  children,
  delay = 0,
  type = 'fade',
  ...props
}: AnimatedElementProps) {
  const config = getAnimationConfig(type)
  const baseDelay = type === 'scale' ? 0 : (config as { delay: number }).delay
  
  return (
    <motion.div
      initial={variants[type].initial}
      whileInView={variants[type].animate}
      viewport={{ once: true }}
      transition={{
        duration: config.duration,
        delay: delay + baseDelay,
        ease: type === 'scale' ? ANIMATION.scale.ease : undefined,
      }}
      {...props}
    >
      {children}
    </motion.div>
  )
}