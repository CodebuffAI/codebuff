'use client'

import { useState, useEffect } from 'react'
import { Section } from '@/components/ui/section'
import { Hero } from '@/components/ui/hero'
import { FeatureSection } from '@/components/ui/landing/feature'
import { CompetitionSection } from '@/components/ui/landing/competition'
import { TestimonialsSection } from '@/components/ui/landing/testimonials-section'
import { CTASection } from '@/components/ui/landing/cta-section'
import { DecorativeBlocks, BlockColor } from '@/components/ui/decorative-blocks'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSearchParams } from 'next/navigation'
import { storeSearchParams } from '@/lib/trackConversions'
import IDEDemo from '@/components/IDEDemo'
import {
  SECTION_THEMES,
  DEMO_CODE,
  FEATURE_POINTS,
} from '@/components/ui/landing/constants'
import { WorkflowIllustration } from '@/components/ui/landing/feature/workflow-illustration'
import { BrowserComparison } from '@/components/ui/landing/feature/browser-comparison'
import { ChartIllustration } from '@/components/ui/landing/feature/chart-illustration'
import posthog from 'posthog-js'

export default function Home() {
  const [demoSwitched, setDemoSwitched] = useState(false)
  const [scrollEnabled, setScrollEnabled] = useState(false)
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()

  useEffect(() => {
    storeSearchParams(searchParams)
  }, [searchParams])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDemoSwitched(true)
      setScrollEnabled(true)
    }, 4000)
    return () => clearTimeout(timer)
  }, [])

  const handleFeatureLearnMoreClick = (featureName: string, link: string) => {
    posthog.capture('home.feature_learn_more_clicked', {
      feature: featureName,
      link,
    })
  }

  return (
    <div className="relative">
      {/* Hero section always visible */}
      <Section background={SECTION_THEMES.hero.background} hero>
        <div className="codebuff-container">
          <div className="w-full mb-8 md:mb-12">
            <Hero />
          </div>

          <div
            className={`w-full ${!demoSwitched ? 'flex items-center' : 'mt-8'} pt-4 md:pt-0`}
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

      <div
        className="transition-opacity duration-500"
        style={{
          opacity: scrollEnabled ? 1 : 0,
          visibility: scrollEnabled ? 'visible' : 'hidden',
          position: scrollEnabled ? 'relative' : 'absolute',
          top: scrollEnabled ? 'auto' : '-9999px',
          pointerEvents: scrollEnabled ? 'auto' : 'none',
        }}
      >
        {/* Feature Section 1 - Yellow */}
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

        {/* Feature Section 2 - Black */}
        <FeatureSection
          title={
            <>
              Direct your codebase{' '}
              <span className="whitespace-nowrap"> like a movie</span>
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

        {/* Feature Section 3 - Yellow */}
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
                  'bg-gradient-to-r from-green-500 to-green-300'
                ),
              }}
            />
          }
        />

        {/* Competition Section - Black */}
        <CompetitionSection />

        {/* Testimonials Section - Yellow */}
        <TestimonialsSection />

        {/* CTA Section - Black */}
        <CTASection />
      </div>
    </div>
  )
}
