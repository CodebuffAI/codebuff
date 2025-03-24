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

  return (
    <div className="relative">
      {/* Hero section always visible */}
      <Section background={SECTION_THEMES.hero.background} hero>
        <div className="codebuff-container">
          <div className="w-full mb-8 md:mb-12">
            <Hero />
          </div>

          <div
            className={`w-full ${!demoSwitched ? 'flex items-center' : 'mt-8'}`}
          >
            <DecorativeBlocks
              colors={[BlockColor.GenerativeGreen, BlockColor.CRTAmber]}
              placement="bottom-right"
            >
              <IDEDemo />
            </DecorativeBlocks>
          </div>
        </div>
      </Section>

      {/* Remaining sections only visible when scrollEnabled is true */}
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
          tagline="DEEP PROJECT INSIGHTS & ACTIONS"
          highlightText="Indexes your entire codebase in 2 seconds"
          keyPoints={FEATURE_POINTS.understanding}
          illustration={
            <WorkflowIllustration
              steps={[
                {
                  icon: '🧠',
                  title: 'Total Codebase Awareness',
                  description: 'COPY_TODO',
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
                  description: 'COPY_TODO',
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
          description="COPY_TODO"
          backdropColor={SECTION_THEMES.feature2.background}
          decorativeColors={SECTION_THEMES.feature2.decorativeColors}
          imagePosition="left"
          tagline="COPY_TODO"
          highlightText="Zero setup hurdles, infinite control."
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
          title={<>Better Over Time</>}
          description="Don't repeat yourself. Codebuff takes notes on your conversations and stores them in human-readable markdown files. Each session makes it smarter about your specific needs and project setup."
          backdropColor={SECTION_THEMES.feature3.background}
          decorativeColors={SECTION_THEMES.feature3.decorativeColors}
          tagline="CONTINUOUS LEARNING & OPTIMIZATION"
          highlightText="Persists project knowledge between sessions"
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
