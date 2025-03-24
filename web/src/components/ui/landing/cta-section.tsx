'use client'

import Link from 'next/link'
import { BlockColor } from '../decorative-blocks'
import { HeroButtons } from '../hero-buttons'
import { useState } from 'react'
import { Section } from '../section'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { TerminalCopyButton } from '../enhanced-copy-button'

// Benefit card component for the CTA section
function BenefitCard({
  title,
  description,
  icon,
  index,
}: {
  title: string
  description: string
  icon: string
  index: number
}) {
  return (
    <motion.div
      className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex gap-3 items-start"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      viewport={{ once: true }}
    >
      <div className="text-2xl mt-1">{icon}</div>
      <div>
        <h3 className="text-white font-medium text-lg">{title}</h3>
        <p className="text-white/70 text-sm">{description}</p>
      </div>
    </motion.div>
  )
}

export function CTASection() {
  const [isHovered, setIsHovered] = useState(false)

  const decorativeColors = isHovered
    ? [BlockColor.AcidMatrix, BlockColor.GenerativeGreen, BlockColor.CRTAmber]
    : [
        BlockColor.TerminalYellow,
        BlockColor.CRTAmber,
        BlockColor.DarkForestGreen,
      ]

  // Benefits data
  const benefits = [
    {
      icon: '⚡',
      title: 'Lightning Fast',
      description:
        'Start using Codebuff in under 30 seconds with a simple install',
    },
    {
      icon: '🔒',
      title: 'No Card Required',
      description:
        'Free tier available with no credit card or complicated signup',
    },
    {
      icon: '🛠️',
      title: 'Use Anywhere',
      description: 'Works in any terminal or development environment',
    },
  ]

  return (
    <Section background="black">
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
              <span className="relative z-10">Ready</span>
            </motion.span>{' '}
            to experience{' '}
            <motion.span
              className="relative inline-block"
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <span className="relative z-10">magic?</span>
            </motion.span>
          </motion.h1>
        </motion.div>

        <motion.h2
          className="hero-subtext text-center mx-auto max-w-xl mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          COPY_TODO
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 max-w-2xl mx-auto">
            <TerminalCopyButton />
          </div>
        </motion.div>
      </div>
    </Section>
  )
}
