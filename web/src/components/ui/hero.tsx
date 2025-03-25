'use client'

import { useState, useEffect } from 'react'
import { BlockColor } from './decorative-blocks'
import { HeroButtons } from './hero-buttons'
import { Section } from './section'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// Typing effect component for hero headline
function TypingEffect({ words }: { words: string[] }) {
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [currentText, setCurrentText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const isLastWord = currentWordIndex === words.length - 1

  useEffect(() => {
    const typeSpeed = isDeleting ? 50 : 100

    const timer = setTimeout(() => {
      const currentWord = words[currentWordIndex]

      if (!isDeleting) {
        // Typing effect
        setCurrentText(currentWord.substring(0, currentText.length + 1))

        // If fully typed, start deleting after a delay
        if (currentText === currentWord) {
          setTimeout(() => {
            setIsDeleting(true)
          }, 2000) // Wait time when word is complete
        }
      } else {
        // Deleting effect
        setCurrentText(currentWord.substring(0, currentText.length - 1))

        // If fully deleted, move to next word
        if (currentText === '') {
          setIsDeleting(false)
          setCurrentWordIndex((currentWordIndex + 1) % words.length)
        }
      }
    }, typeSpeed)

    return () => clearTimeout(timer)
  }, [currentText, currentWordIndex, isDeleting, words])

  return (
    <span
      className={`text-green-400 relative ${isLastWord ? 'underline decoration-2 underline-offset-2' : ''}`}
    >
      {currentText}
      <motion.span
        className="absolute -right-[3px] top-0 h-full w-1 bg-green-500"
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
    </span>
  )
}

export function Hero() {
  return (
    <Section hero>
      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <motion.h1
            className="hero-heading text-center mb-8 text-white text-balance"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.8,
              ease: [0.165, 0.84, 0.44, 1],
            }}
          >
            <motion.span
              className="relative inline-block"
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <span className="relative z-10">Supercharge</span>
            </motion.span>{' '}
            Your{' '}
            <motion.span
              className="relative inline-block"
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <span className="relative z-10">Codeflow</span>
            </motion.span>
          </motion.h1>
        </motion.div>

        <motion.h2
          className="hero-subtext text-center mx-auto max-w-xl mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <span className="whitespace-nowrap">
            Codebuff knows your entire stack
          </span>{' '}
          <span className="whitespace-nowrap">and works in your</span>{' '}
          <span>{<TypingEffect words={['terminal', 'IDE', 'system']} />}</span>
          {'.'}
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mb-12 md:mb-4"  // Added more bottom margin on mobile
        >
          <HeroButtons />
        </motion.div>
      </div>
    </Section>
  )
}
