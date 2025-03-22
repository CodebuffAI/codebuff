'use client'

import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { DecorativeBlocks, BlockColor } from '../../decorative-blocks'
import { Section } from '../../section'
import { useIsMobile } from '@/hooks/use-mobile'
import { HighlightText } from './highlight-text'
import type { KeyPoint } from '../types'

interface FeatureSectionProps {
  title: string
  description: string
  backdropColor?: BlockColor
  imagePosition?: 'left' | 'right'
  tagline?: string
  decorativeColors?: BlockColor[]
  keyPoints: KeyPoint[]
  highlightText: string
  illustration: ReactNode
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
  keyPoints,
  highlightText,
  illustration,
}: FeatureSectionProps) {
  const isLight =
    backdropColor === BlockColor.CRTAmber ||
    backdropColor === BlockColor.TerminalYellow
  const isMobile = useIsMobile()

  return (
    <Section background={backdropColor}>
      <div className={cn('text-white', { 'text-black': isLight })}>
        <div
          className={cn(
            'grid gap-8 items-center',
            isMobile ? 'grid-cols-1' : 'lg:grid-cols-2 lg:gap-16'
          )}
        >
          {/* Mobile view always has content first, illustration second */}
          {isMobile ? (
            <>
              {/* Content for mobile */}
              <AnimatedContent>
                <div className="space-y-6">
                  <div>
                    <h2 className="text-3xl lg:text-4xl hero-heading">
                      {title}
                    </h2>
                    {tagline && (
                      <span className="text-xs font-semibold uppercase tracking-wider mt-2 inline-block opacity-70">
                        {tagline}
                      </span>
                    )}
                  </div>

                  <p className="text-lg leading-relaxed opacity-70">
                    {description}
                  </p>

                  <HighlightText text={highlightText} isLight={isLight} />

                  {keyPoints.length > 0 && (
                    <div className="mt-6 grid gap-4">
                      {keyPoints.map((point, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                          <div className="text-xl mt-0.5">{point.icon}</div>
                          <div>
                            <h3 className="text-base font-semibold">
                              {point.title}
                            </h3>
                            <p className="text-sm mt-1 opacity-70">
                              {point.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AnimatedContent>

              {/* Illustration for mobile */}
              <AnimatedContent>
                <div className="relative">
                  <DecorativeBlocks
                    colors={decorativeColors}
                    initialPlacement="bottom-right"
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
                    initialPlacement="top-left"
                  >
                    <div className="relative">{illustration}</div>
                  </DecorativeBlocks>
                </div>
              </AnimatedContent>

              <AnimatedContent>
                <div className="space-y-6">
                  <div>
                    <h2 className="text-3xl lg:text-4xl hero-heading">
                      {title}
                    </h2>
                    {tagline && (
                      <span className="text-xs font-semibold uppercase tracking-wider mt-2 inline-block opacity-70">
                        {tagline}
                      </span>
                    )}
                  </div>

                  <p className="text-lg leading-relaxed opacity-70">
                    {description}
                  </p>

                  <HighlightText text={highlightText} isLight={isLight} />

                  {keyPoints.length > 0 && (
                    <div className="mt-6 grid gap-4">
                      {keyPoints.map((point, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                          <div className="text-xl mt-0.5">{point.icon}</div>
                          <div>
                            <h3 className="text-base font-semibold">
                              {point.title}
                            </h3>
                            <p className="text-sm mt-1 opacity-70">
                              {point.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AnimatedContent>
            </>
          ) : (
            <>
              <AnimatedContent>
                <div className="space-y-6">
                  <div>
                    <h2 className="text-3xl lg:text-4xl hero-heading">
                      {title}
                    </h2>
                    {tagline && (
                      <span className="text-xs font-semibold uppercase tracking-wider mt-2 inline-block opacity-70">
                        {tagline}
                      </span>
                    )}
                  </div>

                  <p className="text-lg leading-relaxed opacity-70">
                    {description}
                  </p>

                  <HighlightText text={highlightText} isLight={isLight} />

                  {keyPoints.length > 0 && (
                    <div className="mt-6 grid gap-4">
                      {keyPoints.map((point, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                          <div className="text-xl mt-0.5">{point.icon}</div>
                          <div>
                            <h3 className="text-base font-semibold">
                              {point.title}
                            </h3>
                            <p className="text-sm mt-1 opacity-70">
                              {point.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AnimatedContent>

              <AnimatedContent>
                <div className="relative">
                  <DecorativeBlocks
                    colors={decorativeColors}
                    initialPlacement="bottom-right"
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
