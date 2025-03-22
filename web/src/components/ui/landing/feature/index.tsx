'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { DecorativeBlocks, BlockColor } from '../../decorative-blocks'
import { Section } from '../../section'
import { useIsMobile } from '@/hooks/use-mobile'
import { HighlightText } from './highlight-text'
import { CodeIllustration } from './code-illustration'
import { ChartIllustration } from './chart-illustration'
import { WorkflowIllustration } from './workflow-illustration'
import { BrowserComparison } from './browser-comparison'
import type { FeatureIllustration, KeyPoint } from '../types'

interface FeatureSectionProps {
  title: string
  description: string
  backdropColor?: BlockColor
  imagePosition?: 'left' | 'right'
  codeSample?: string[]
  tagline?: string
  decorativeColors?: BlockColor[]
  keyPoints?: KeyPoint[]
  highlightText?: string
  illustration?: FeatureIllustration
}

// Internal animated wrapper component
function AnimatedContent({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
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
  codeSample = [],
  tagline,
  decorativeColors = [BlockColor.GenerativeGreen, BlockColor.DarkForestGreen],
  keyPoints = [],
  highlightText,
  illustration,
}: FeatureSectionProps) {
  const isLight =
    backdropColor === BlockColor.CRTAmber ||
    backdropColor === BlockColor.TerminalYellow
  const isMobile = useIsMobile()

  // Determine which illustration component to use
  const getIllustrationComponent = () => {
    // If a custom illustration is provided
    if (illustration) {
      switch (illustration.type) {
        case 'code':
          return (
            <CodeIllustration
              codeSample={illustration.codeSample || codeSample}
              isLight={isLight}
              className="shadow-xl"
            />
          )
        case 'chart':
          return (
            illustration.chartData && (
              <ChartIllustration
                chartData={illustration.chartData}
                isLight={isLight}
              />
            )
          )
        case 'workflow':
          return (
            illustration.workflowSteps && (
              <WorkflowIllustration
                steps={illustration.workflowSteps}
                isLight={isLight}
              />
            )
          )
        case 'browserComparison':
          return (
            illustration.browserComparisonData && (
              <BrowserComparison
                comparisonData={illustration.browserComparisonData}
                isLight={isLight}
              />
            )
          )
        case 'terminal':
          return (
            <CodeIllustration
              codeSample={illustration.codeSample || codeSample}
              isLight={isLight}
              className="shadow-xl"
            />
          )
        default:
          // Fall back to code illustration with default code sample if nothing matches
          return (
            <CodeIllustration
              codeSample={codeSample}
              isLight={isLight}
              className="shadow-xl"
            />
          )
      }
    }

    // Default illustration is a code display
    return (
      <CodeIllustration
        codeSample={codeSample}
        isLight={isLight}
        className="shadow-xl"
      />
    )
  }

  return (
    <Section background={backdropColor}>
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
                  <h2
                    className={cn('text-3xl lg:text-4xl hero-heading', {
                      'text-black': isLight,
                      'text-white': !isLight,
                    })}
                  >
                    {title}
                  </h2>
                  {tagline && (
                    <span
                      className={cn(
                        'text-xs font-semibold uppercase tracking-wider mt-2 inline-block',
                        {
                          'text-black/70': isLight,
                          'text-white/70': !isLight,
                        }
                      )}
                    >
                      {tagline}
                    </span>
                  )}
                </div>

                <p
                  className={cn('text-lg leading-relaxed', {
                    'text-black/70': isLight,
                    'text-white/70': !isLight,
                  })}
                >
                  {description}
                </p>

                {highlightText && (
                  <HighlightText text={highlightText} isLight={isLight} />
                )}

                {keyPoints.length > 0 && (
                  <div className="mt-6 grid gap-4">
                    {keyPoints.map((point, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div
                          className={cn('text-xl mt-0.5', {
                            'text-black': isLight,
                            'text-white': !isLight,
                          })}
                        >
                          {point.icon}
                        </div>
                        <div>
                          <h3
                            className={cn('text-base font-semibold', {
                              'text-black': isLight,
                              'text-white': !isLight,
                            })}
                          >
                            {point.title}
                          </h3>
                          <p
                            className={cn('text-sm mt-1', {
                              'text-black/70': isLight,
                              'text-white/70': !isLight,
                            })}
                          >
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
                  <div className="relative">{getIllustrationComponent()}</div>
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
                  <div className="relative">{getIllustrationComponent()}</div>
                </DecorativeBlocks>
              </div>
            </AnimatedContent>

            <AnimatedContent>
              <div className="space-y-6">
                <div>
                  <h2
                    className={cn('text-3xl lg:text-4xl hero-heading', {
                      'text-black': isLight,
                      'text-white': !isLight,
                    })}
                  >
                    {title}
                  </h2>
                  {tagline && (
                    <span
                      className={cn(
                        'text-xs font-semibold uppercase tracking-wider mt-2 inline-block',
                        {
                          'text-black/70': isLight,
                          'text-white/70': !isLight,
                        }
                      )}
                    >
                      {tagline}
                    </span>
                  )}
                </div>

                <p
                  className={cn('text-lg leading-relaxed', {
                    'text-black/70': isLight,
                    'text-white/70': !isLight,
                  })}
                >
                  {description}
                </p>

                {highlightText && (
                  <HighlightText text={highlightText} isLight={isLight} />
                )}

                {keyPoints.length > 0 && (
                  <div className="mt-6 grid gap-4">
                    {keyPoints.map((point, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div
                          className={cn('text-xl mt-0.5', {
                            'text-black': isLight,
                            'text-white': !isLight,
                          })}
                        >
                          {point.icon}
                        </div>
                        <div>
                          <h3
                            className={cn('text-base font-semibold', {
                              'text-black': isLight,
                              'text-white': !isLight,
                            })}
                          >
                            {point.title}
                          </h3>
                          <p
                            className={cn('text-sm mt-1', {
                              'text-black/70': isLight,
                              'text-white/70': !isLight,
                            })}
                          >
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
                  <h2
                    className={cn('text-3xl lg:text-4xl hero-heading', {
                      'text-black': isLight,
                      'text-white': !isLight,
                    })}
                  >
                    {title}
                  </h2>
                  {tagline && (
                    <span
                      className={cn(
                        'text-xs font-semibold uppercase tracking-wider mt-2 inline-block',
                        {
                          'text-black/70': isLight,
                          'text-white/70': !isLight,
                        }
                      )}
                    >
                      {tagline}
                    </span>
                  )}
                </div>

                <p
                  className={cn('text-lg leading-relaxed', {
                    'text-black/70': isLight,
                    'text-white/70': !isLight,
                  })}
                >
                  {description}
                </p>

                {highlightText && (
                  <HighlightText text={highlightText} isLight={isLight} />
                )}

                {keyPoints.length > 0 && (
                  <div className="mt-6 grid gap-4">
                    {keyPoints.map((point, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div
                          className={cn('text-xl mt-0.5', {
                            'text-black': isLight,
                            'text-white': !isLight,
                          })}
                        >
                          {point.icon}
                        </div>
                        <div>
                          <h3
                            className={cn('text-base font-semibold', {
                              'text-black': isLight,
                              'text-white': !isLight,
                            })}
                          >
                            {point.title}
                          </h3>
                          <p
                            className={cn('text-sm mt-1', {
                              'text-black/70': isLight,
                              'text-white/70': !isLight,
                            })}
                          >
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
                  <div className="relative">{getIllustrationComponent()}</div>
                </DecorativeBlocks>
              </div>
            </AnimatedContent>
          </>
        )}
      </div>
    </Section>
  )
}
