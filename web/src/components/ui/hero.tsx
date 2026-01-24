'use client'

import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'

import { HeroButtons } from './hero-buttons'

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
    <div className="relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        <motion.h1
          className="hero-heading text-center mb-8 text-white text-balance"
          variants={{
            animate: {
              transition: {
                staggerChildren: 0.2,
              },
            },
          }}
          initial="initial"
          animate="animate"
        >
          <motion.span
            variants={{
              initial: { opacity: 0, y: 20 },
              animate: {
                opacity: 1,
                y: 0,
                transition: {
                  duration: 0.8,
                  ease: [0.165, 0.84, 0.44, 1],
                },
              },
            }}
          >
            Better agents.
          </motion.span>{' '}
          <motion.span
            variants={{
              initial: { opacity: 0, y: 20 },
              animate: {
                opacity: 1,
                y: 0,
                transition: {
                  duration: 0.8,
                  ease: [0.165, 0.84, 0.44, 1],
                },
              },
            }}
          >
            Better code.
          </motion.span>{' '}
        </motion.h1>
      </motion.div>

      <motion.h2
        className="hero-subtext text-center mx-auto max-w-xl mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <span className="whitespace-nowrap">100+ seconds faster than</span>{' '}
        <span className="whitespace-nowrap font-bold">Claude Code</span>{' '}
        <span className="whitespace-nowrap">with higher-quality output</span>
      </motion.h2>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mb-12 md:mb-4" // Added more bottom margin on mobile
      >
        <HeroButtons />
      </motion.div>
    </div>
  )
}
