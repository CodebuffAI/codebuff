import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface GlitchTextProps {
  children: string
  className?: string
  glitchIntensity?: 'subtle' | 'medium' | 'high'
  triggerOnMount?: boolean
}

export function GlitchText({
  children,
  className,
  glitchIntensity = 'subtle',
  triggerOnMount = false,
}: GlitchTextProps) {
  const [isGlitching, setIsGlitching] = useState(false)
  const [glitchText, setGlitchText] = useState(children)

  const glitchChars = '!@#$%^&*(){}[]<>?/\\|~`'

  useEffect(() => {
    if (triggerOnMount) {
      setIsGlitching(true)
      const timer = setTimeout(() => setIsGlitching(false), 200)
      return () => clearTimeout(timer)
    }
    return
  }, [triggerOnMount])

  useEffect(() => {
    if (!isGlitching) {
      setGlitchText(children)
      return
    }

    const intensity = {
      subtle: 0.1,
      medium: 0.3,
      high: 0.6,
    }[glitchIntensity]

    const interval = setInterval(() => {
      const glitched = children
        .split('')
        .map((char) => {
          if (Math.random() < intensity) {
            return glitchChars[Math.floor(Math.random() * glitchChars.length)]
          }
          return char
        })
        .join('')

      setGlitchText(glitched)
    }, 50)

    return () => clearInterval(interval)
  }, [isGlitching, children, glitchIntensity])

  const handleMouseEnter = () => {
    if (Math.random() < 0.15) {
      // 15% chance on hover
      setIsGlitching(true)
      setTimeout(() => setIsGlitching(false), 150)
    }
  }

  return (
    <motion.span
      className={cn(
        'font-mono inline-block transition-all duration-75',
        isGlitching && 'text-red-400',
        className,
      )}
      onMouseEnter={handleMouseEnter}
      animate={
        isGlitching
          ? {
              x: [0, -1, 1, 0],
              textShadow: [
                '0 0 0px rgba(255,0,0,0)',
                '2px 0 0px rgba(255,0,0,0.8)',
                '-2px 0 0px rgba(0,255,255,0.8)',
                '0 0 0px rgba(255,0,0,0)',
              ],
            }
          : {}
      }
      transition={{ duration: 0.1, repeat: isGlitching ? 2 : 0 }}
    >
      {glitchText}
    </motion.span>
  )
}

// Usage example:
// <GlitchText triggerOnMount>Codebuff CLI v1.5.0</GlitchText>
