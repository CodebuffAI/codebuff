'use client'

import { motion } from 'framer-motion'

import { HeroButtons } from './hero-buttons'

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
        <span className="whitespace-nowrap">Higher quality output and</span>{' '}
        <span className="whitespace-nowrap font-bold">100+</span>{' '}
        <span className="whitespace-nowrap">seconds faster</span>{' '}
        <span className="whitespace-nowrap">than Claude Code</span>
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
