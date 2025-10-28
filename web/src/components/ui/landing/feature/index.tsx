'use client'

import { motion } from 'framer-motion'
import posthog from 'posthog-js'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import { HighlightText } from './highlight-text'
import { DecorativeBlocks, BlockColor } from '../../decorative-blocks'
import { Section } from '../../section'

import type { KeyPoint } from '../types'
import type { ReactNode } from 'react'

import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

// Helper component for the Learn More link
function LearnMoreLink({
  href,
  text,
  isLight,
  textColor,
}: {
  href: string
  text: string
  isLight: boolean
  textColor?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        posthog.capture(AnalyticsEvent.HOME_FEATURE_LEARN_MORE_CLICKED, {
          feature: text,
          link: href,
        })
      }}
      className={cn(
        'inline-block mt-4 text-sm font-medium border-b border-dotted pb-0.5 transition-colors',
        textColor
          ? `${textColor} ${textColor.replace('text-', 'border-')}/40 hover:text-blue-500 hover:border-blue-500`
          : isLight
            ? 'text-black border-black/40 hover:text-blue-600 hover:border-blue-600'
            : 'text-white/80 border-white/40 hover:text-blue-400 hover:border-blue-400',
      )}
    >
      {text} →
    </a>
  )
}

interface FeatureSectionProps {
  title: ReactNode
  description: string
  backdropColor?: BlockColor
  imagePosition?: 'left' | 'right'
  tagline: string
  decorativeColors?: BlockColor[]
  keyPoints: KeyPoint[]
  highlightText: string
  illustration: ReactNode
  learnMoreText?: string
  learnMoreLink: string
  textColor?: string
}

// Internal animated wrapper component
function AnimatedContent({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      {children}
    </motion.div>
  )
}

export function FeatureSection({
  title,
  description,
  backdropColor = BlockColor.DarkForestGreen,
  imagePosition = 'right',
  tagline,
  decorativeColors = [BlockColor.GenerativeGreen, BlockColor.DarkForestGreen],
  highlightText,
  illustration,
  learnMoreText = 'Learn More',
  learnMoreLink,
  textColor,
}: FeatureSectionProps) {
  const isLight =
    backdropColor === BlockColor.CRTAmber ||
    backdropColor === BlockColor.TerminalYellow
  const isMobile = useIsMobile()

  const renderContent = () => (
    <div className="space-y-6">
      <div>
        <h2 className="feature-heading">{title}</h2>

        <span className="text-xs font-semibold uppercase tracking-wider mt-2 inline-block opacity-70">
          {tagline}
        </span>
      </div>

      <HighlightText text={highlightText} isLight={isLight} />

      <p className="text-lg leading-relaxed opacity-70 font-paragraph">
        {description}
      </p>

      <LearnMoreLink
        href={learnMoreLink}
        text={learnMoreText}
        isLight={isLight}
        textColor={textColor}
      />
    </div>
  )

  return (
    <Section background={backdropColor}>
      <div
        className={cn(
          'text-white max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
          { 'text-black': isLight },
          textColor,
        )}
      >
        <div
          className={cn(
            'grid gap-8 items-center',
            isMobile ? 'grid-cols-1' : 'lg:grid-cols-2 lg:gap-16',
          )}
        >
          {/* Mobile view always has content first, illustration second */}
          {isMobile ? (
            <>
              {/* Content for mobile */}
              <AnimatedContent>{renderContent()}</AnimatedContent>

              {/* Illustration for mobile */}
              <AnimatedContent>
                <div className="relative">
                  <DecorativeBlocks
                    colors={decorativeColors}
                    placement="bottom-right"
                  >
                    <div className="relative">{illustration}</div>
                  </DecorativeBlocks>
                </div>
              </AnimatedContent>
            </>
          ) : /* Desktop layout follows imagePosition */
          imagePosition === 'left' ? (
            <>
              <AnimatedContent>
                <div className="relative">
                  <DecorativeBlocks
                    colors={decorativeColors}
                    placement="bottom-left"
                  >
                    <div className="relative">{illustration}</div>
                  </DecorativeBlocks>
                </div>
              </AnimatedContent>

              <AnimatedContent>{renderContent()}</AnimatedContent>
            </>
          ) : (
            <>
              <AnimatedContent>{renderContent()}</AnimatedContent>

              <AnimatedContent>
                <div className="relative">
                  <DecorativeBlocks
                    colors={decorativeColors}
                    placement="bottom-right"
                  >
                    <div className="relative">{illustration}</div>
                  </DecorativeBlocks>
                </div>
              </AnimatedContent>
            </>
          )}
        </div>
      </div>
    </Section>
  )
}
