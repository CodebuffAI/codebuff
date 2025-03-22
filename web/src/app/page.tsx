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
import { SECTION_THEMES, DEMO_CODE, FEATURE_POINTS } from '@/components/ui/landing/constants'
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
      <Section
        background={SECTION_THEMES.hero.background}
        hero
      >
        <div
          className="codebuff-container"
          style={{ paddingTop: isMobile ? '60px' : '120px' }}
        >
          <div className="w-full mb-8 md:mb-12">
            <Hero />
          </div>

          <div className={`w-full ${!demoSwitched ? 'flex items-center' : 'mt-8'}`}>
            <DecorativeBlocks
              colors={[
                BlockColor.GenerativeGreen,
                BlockColor.CRTAmber
              ]}
              initialPlacement="bottom-right"
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
          title="Full Codebase Understanding"
          description="Codebuff deeply understands your entire codebase structure, dependencies, and patterns to provide intelligent context-aware assistance that other AI tools can't match."
          backdropColor={SECTION_THEMES.feature1.background}
          decorativeColors={SECTION_THEMES.feature1.decorativeColors}
          tagline="DEEP PROJECT ANALYSIS & INSIGHTS"
          highlightText="4x faster than other AI coding assistants with deep codebase comprehension"
          keyPoints={FEATURE_POINTS.understanding}
          illustration={
            <WorkflowIllustration
              steps={[
                {
                  icon: '📁',
                  title: 'Scan Codebase',
                  description: 'Automatically analyzes all files, dependencies, and imports.',
                },
                {
                  icon: '🧠',
                  title: 'Apply Intelligence',
                  description: 'Uses deep understanding to provide context-aware assistance',
                },
                {
                  icon: '⚡',
                  title: 'Deliver Results',
                  description: 'Provides precise, targeted solutions 4x faster than competitors',
                },
              ]}
            />
          }
        />

        {/* Feature Section 2 - Black */}
        <FeatureSection
          title="Does the Right Stuff for Your Project"
          description="Codebuff intelligently handles project configuration, provides precise code edits, and integrates seamlessly with any technology stack without complex setup or environment restrictions."
          backdropColor={SECTION_THEMES.feature2.background}
          decorativeColors={SECTION_THEMES.feature2.decorativeColors}
          imagePosition="left"
          tagline="INTELLIGENT PROJECT ASSISTANCE"
          highlightText="Works in any terminal with 50% lower CPU usage than competitors"
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
          title="Learns Between Sessions"
          description="Codebuff maintains knowledge about your projects, preferences, and previous interactions, creating a continuous experience that gets smarter and more efficient over time."
          backdropColor={SECTION_THEMES.feature3.background}
          decorativeColors={SECTION_THEMES.feature3.decorativeColors}
          tagline="CONTINUOUS LEARNING & OPTIMIZATION"
          highlightText="Saves your context in knowledge files that persist between sessions"
          keyPoints={FEATURE_POINTS.remembers}
          illustration={
            <ChartIllustration
              chartData={{
                labels: ['Time to Context', 'Assistance Quality', 'Repeat Tasks', 'Project Recall'],
                values: [95, 85, 90, 100],
                colors: Array(4).fill('bg-gradient-to-r from-green-500 to-green-300'),
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
