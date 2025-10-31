'use client'

import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import posthog from 'posthog-js'
import { useEffect, useState, Suspense } from 'react'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import IDEDemo from '@/components/IDEDemo'
import { BlockColor, DecorativeBlocks } from '@/components/ui/decorative-blocks'
import { Hero } from '@/components/ui/hero'
import { CompetitionSection } from '@/components/ui/landing/competition'
import {
  FEATURE_POINTS,
  SECTION_THEMES,
} from '@/components/ui/landing/constants'
import { CTASection } from '@/components/ui/landing/cta-section'
import { FeatureSection } from '@/components/ui/landing/feature'
import { BrowserComparison } from '@/components/ui/landing/feature/browser-comparison'
import { ChartIllustration } from '@/components/ui/landing/feature/chart-illustration'
import { WorkflowIllustration } from '@/components/ui/landing/feature/workflow-illustration'
import { TestimonialsSection } from '@/components/ui/landing/testimonials-section'
import { Section } from '@/components/ui/section'
import { toast } from '@/components/ui/use-toast'
import { useIsMobile } from '@/hooks/use-mobile'
import { storeSearchParams } from '@/lib/trackConversions'
import { cn } from '@/lib/utils'
import { ReferralRedirect } from '@/components/referral-redirect'

function SearchParamsHandler() {
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const isMobile = useIsMobile()
  const { data: session } = useSession()

  useEffect(() => {
    storeSearchParams(searchParams)
  }, [searchParams])

  return null
}

export default function Home() {
  const [demoSwitched, setDemoSwitched] = useState(false)
  const isMobile = useIsMobile()
  const { data: session } = useSession()

  useEffect(() => {
    const timer = setTimeout(() => {
      setDemoSwitched(true)
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const handleReferralCode = async () => {
      const referralCode = localStorage.getItem('referral_code')
      if (referralCode && session?.user?.id) {
        try {
          const response = await fetch('/api/referrals', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ referralCode }),
          })

          const data = await response.json()

          if (response.ok) {
            toast({
              title: 'Success!',
              description: `You earned ${data.credits_redeemed} credits from your referral!`,
              className: 'cursor-pointer',
              onClick: () => {
                window.location.href = '/referrals'
              },
            })
          }
        } catch (error) {
          console.error('Error redeeming referral code:', error)
        } finally {
          localStorage.removeItem('referral_code')
        }
      }
    }

    handleReferralCode()
  }, [session?.user?.id])

  const handleFeatureLearnMoreClick = (featureName: string, link: string) => {
    posthog.capture(AnalyticsEvent.HOME_FEATURE_LEARN_MORE_CLICKED, {
      feature: featureName,
      link,
    })
  }

  return (
    <div className="relative">
      <Suspense>
        <SearchParamsHandler />
      </Suspense>
      <ReferralRedirect />

      <Section background={SECTION_THEMES.hero.background} hero fullViewport>
        <div
          className={cn(
            'codebuff-container min-h-full flex flex-col transition-all duration-1000',
          )}
        >
          <div className={cn('w-full mb-8 md:mb-12 flex-shrink-0')}>
            <Hero />
          </div>

          <div
            className={cn(
              'w-full flex-grow flex',
              !demoSwitched ? 'items-center' : '',
            )}
          >
            <DecorativeBlocks
              colors={[BlockColor.CRTAmber, BlockColor.AcidMatrix]}
              placement="bottom-right"
            >
              <IDEDemo />
            </DecorativeBlocks>
          </div>
        </div>
      </Section>

      <div className={cn('transition-all duration-1000')}>
        {/* Visual divider between hero and comparison */}
        <div className="h-px bg-gradient-to-r from-transparent via-green-500/30 to-transparent"></div>

        {/* Prominent Claude Code vs Codebuff Comparison - MOVED TO TOP */}
        <Section background={BlockColor.DarkForestGreen}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6 }}
              className="space-y-8"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="bg-gradient-to-r from-red-500 to-orange-500 text-white px-3 py-1 rounded-full text-sm font-bold tracking-wider shadow-lg"
                  >
                    🆕 NEW
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="bg-green-500/20 border border-green-500/50 text-green-400 px-3 py-1 rounded-full text-sm font-semibold"
                  >
                    BENCHMARK RESULTS
                  </motion.div>
                </div>
                <h2 className="text-4xl md:text-5xl font-bold text-white">
                  BuffBench Results
                </h2>
                <p className="text-xl text-white/70 max-w-2xl mx-auto">
                  State of the art coding agent evaluation using generated
                  workflows and judging from open source repositories
                </p>
              </div>

              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.7, delay: 0.2 }}
                className="relative"
              >
                <div className="bg-zinc-900/50 border-2 border-green-500/30 rounded-xl p-8 shadow-2xl shadow-green-500/10">
                  <Image
                    src="/codebuff-vs-claude-code.png"
                    alt="Codebuff vs Claude Code Performance Comparison"
                    width={800}
                    height={600}
                    className="rounded-lg mx-auto"
                    priority
                  />
                </div>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-6"
                >
                  <div className="text-3xl font-bold text-green-400 mb-2">
                    175+
                  </div>
                  <div className="text-white font-semibold mb-1">
                    Real Tasks
                  </div>
                  <div className="text-white/60 text-sm">
                    Git commit reconstruction from open source projects
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                  className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-6"
                >
                  <div className="text-3xl font-bold text-green-400 mb-2">
                    5
                  </div>
                  <div className="text-white font-semibold mb-1">
                    Turn Conversations
                  </div>
                  <div className="text-white/60 text-sm">
                    Prompting agent simulates human for multiple turns
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.8 }}
                  className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-6"
                >
                  <div className="text-3xl font-bold text-green-400 mb-2">
                    4D
                  </div>
                  <div className="text-white font-semibold mb-1">
                    Scoring System
                  </div>
                  <div className="text-white/60 text-sm">
                    Completion, efficiency, code quality, and overall scores
                  </div>
                </motion.div>
              </div>

              <div className="mt-8">
                <motion.a
                  href="https://github.com/CodebuffAI/codebuff/tree/main/evals"
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 1.0 }}
                  className="inline-flex items-center gap-2 text-green-400 hover:text-green-300 transition-colors"
                >
                  <span>View evaluation methodology</span>
                  <span className="text-xs">↗</span>
                </motion.a>
              </div>
            </motion.div>
          </div>
        </Section>

        <FeatureSection
          title={
            <>
              Your Codebase,{' '}
              <span className="whitespace-nowrap">Fully Understood</span>
            </>
          }
          description="Codebuff deeply understands your entire codebase structure, dependencies, and patterns to generate code that other AI tools can't match."
          backdropColor={SECTION_THEMES.feature1.background}
          decorativeColors={SECTION_THEMES.feature1.decorativeColors}
          textColor={SECTION_THEMES.feature1.textColor}
          tagline="DEEP PROJECT INSIGHTS & ACTIONS"
          highlightText="Indexes your entire codebase in 2 seconds"
          learnMoreText="See How It Works"
          learnMoreLink="/docs/advanced"
          keyPoints={FEATURE_POINTS.understanding}
          illustration={
            <WorkflowIllustration
              steps={[
                {
                  icon: '🧠',
                  title: 'Total Codebase Awareness',
                  description:
                    'Builds a complete map of your project, including hidden dependencies',
                },
                {
                  icon: '✂️',
                  title: 'Surgical Code Edits',
                  description:
                    "Makes pinpoint changes while respecting your codebase's existing structure and style",
                },
                {
                  icon: '⚡',
                  title: 'Instant Solutions',
                  description:
                    'Tailors solutions based on your codebase context',
                },
              ]}
            />
          }
        />

        <FeatureSection
          title={
            <>
              Direct Your Codebase{' '}
              <span className="whitespace-nowrap"> Like a Movie</span>
            </>
          }
          description="Works in your terminal with any tech stack, no special environments needed. Just install npm and you're good to go."
          backdropColor={SECTION_THEMES.feature2.background}
          decorativeColors={SECTION_THEMES.feature2.decorativeColors}
          textColor={SECTION_THEMES.feature2.textColor}
          imagePosition="left"
          tagline="PRECISE CONTROL & FLEXIBILITY"
          highlightText="Zero setup hurdles, infinite control"
          learnMoreText="View Installation Guide"
          learnMoreLink="/docs/help"
          keyPoints={FEATURE_POINTS.rightStuff}
          illustration={
            <BrowserComparison
              comparisonData={{
                beforeUrl: 'http://my-app.example/weather',
                afterUrl: 'http://my-app.example/weather',
                transitionDuration: 3000,
              }}
            />
          }
        />

        <FeatureSection
          title={<>Better and Better Over Time</>}
          description="Don't repeat yourself. Codebuff can take notes on your conversations and stores them in human-readable markdown files. Each session teaches it about your specific needs and project setup."
          backdropColor={SECTION_THEMES.feature3.background}
          decorativeColors={SECTION_THEMES.feature3.decorativeColors}
          textColor={SECTION_THEMES.feature3.textColor}
          tagline="CONTINUOUS LEARNING & OPTIMIZATION"
          highlightText="Persists project knowledge between sessions"
          learnMoreText="Learn About Knowledge Files"
          learnMoreLink="/docs/tips#knowledge-files"
          keyPoints={FEATURE_POINTS.remembers}
          illustration={
            <ChartIllustration
              chartData={{
                labels: [
                  'Time to Context',
                  'Assistance Quality',
                  'Repeat Tasks',
                  'Project Recall',
                ],
                values: [95, 85, 90, 100],
                colors: Array(4).fill(
                  'bg-gradient-to-r from-green-500 to-green-300',
                ),
              }}
            />
          }
        />

        <CompetitionSection />
        <TestimonialsSection />
        <CTASection />
      </div>
    </div>
  )
}
