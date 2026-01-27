'use client'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { motion } from 'framer-motion'
import posthog from 'posthog-js'

import { TerminalCopyButton } from '../enhanced-copy-button'
import { Section } from '../section'
import { SECTION_THEMES } from './constants'

import { useInstallDialog } from '@/hooks/use-install-dialog'

export function CTASection() {
  const { open: openInstallDialog } = useInstallDialog()

  const handleInstallGuideClick = () => {
    posthog.capture(AnalyticsEvent.HOME_CTA_INSTALL_GUIDE_CLICKED)
    openInstallDialog()
  }

  return (
    <Section background={SECTION_THEMES.cta.background}>
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <motion.h1
            className={`hero-heading text-center mb-8 ${SECTION_THEMES.cta.textColor} text-balance`}
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
              <span className="relative z-10">Ready to</span>
            </motion.span>{' '}
            <motion.span
              className="relative inline-block whitespace-nowrap"
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <span className="relative z-10">experience magic?</span>
            </motion.span>
          </motion.h1>
        </motion.div>

        <motion.h2
          className="hero-subtext text-center mx-auto max-w-xl mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <span className="whitespace-nowrap">
            Integrates with your existing workflow.
          </span>{' '}
          <span className="whitespace-nowrap">Simple install.</span>{' '}
          <span className="whitespace-nowrap">No hassles.</span>
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 max-w-2xl mx-auto">
            <TerminalCopyButton size="large" pulseBorder={true} />
          </div>

          <div className="mt-2 text-center text-sm text-white/70">
            First time? Check out our{' '}
            <button
              onClick={handleInstallGuideClick}
              className="relative py-0.5 text-green-400 hover:text-green-300 transition-colors rounded-md hover:underline"
            >
              step-by-step guide
            </button>
          </div>
        </motion.div>
      </div>
    </Section>
  )
}
