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
import { cn } from '@/lib/utils'

export default function Home() {
  const [demoSwitched, setDemoSwitched] = useState(false)
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()

  useEffect(() => {
    storeSearchParams(searchParams)
  }, [searchParams])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDemoSwitched(true)
    }, 2000)
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
      <Section background={SECTION_THEMES.hero.background} hero fullViewport>
        <div
          className={cn(
            'codebuff-container h-full flex flex-col transition-all duration-1000'
          )}
        >
          <div className={cn('w-full mb-8 md:mb-12 flex-shrink-0')}>
            <Hero />
          </div>

          <div
            className={cn(
              'w-full flex-grow flex',
              !demoSwitched ? 'items-center' : ''
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
        {/* Feature Section 1 */}
        <FeatureSection
          title={
            <>
              Your Codebase,{' '}
              <span className="whitespace-nowrap">Psychically Decoded</span>
            </>
          }
          description="ClaudeCodeBuff uses a secret blend of unicorn magic and psychic powers to understand your codebase better than you do. Even the parts you haven't written yet!"
          backdropColor={SECTION_THEMES.feature1.background}
          decorativeColors={SECTION_THEMES.feature1.decorativeColors}
          textColor={SECTION_THEMES.feature1.textColor}
          tagline="MYSTICAL CODE UNDERSTANDING & DIVINATION"
          highlightText="Reads your entire codebase with its third eye"
          learnMoreText="Witness The Magic"
          learnMoreLink="/docs/advanced"
          keyPoints={FEATURE_POINTS.understanding}
          illustration={
            <WorkflowIllustration
              steps={[
                {
                  icon: '🔮',
                  title: 'Crystal Ball Codebase Reading',
                  description:
                    'Gazes into the future of your project, including bugs you haven\'t even created yet',
                },
                {
                  icon: '🧙‍♂️',
                  title: 'Magical Code Incantations',
                  description:
                    "Waves a digital wand and mutters spells to transform your code while no one's looking",
                },
                {
                  icon: '🦄',
                  title: 'Unicorn-Powered Solutions',
                  description:
                    'Each solution is hand-crafted by our team of coding unicorns',
                },
              ]}
            />
          }
        />

        {/* Feature Section 2 */}
        <FeatureSection
          title={
            <>
              Command your code{' '}
              <span className="whitespace-nowrap">like a wizard</span>
            </>
          }
          description="Wave your terminal around like a magic wand! ClaudeCodeBuff works with any tech stack because magic is universal. No potions or special cauldrons required."
          backdropColor={SECTION_THEMES.feature2.background}
          decorativeColors={SECTION_THEMES.feature2.decorativeColors}
          textColor={SECTION_THEMES.feature2.textColor}
          imagePosition="left"
          tagline="ARCANE CONTROL & MYSTICAL FLEXIBILITY"
          highlightText="Zero setup wizardry, infinite magical power"
          learnMoreText="View Spellbook (Installation Guide)"
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

        {/* Feature Section 3 */}
        <FeatureSection
          title={<>Gets Weirder Over Time (In a Good Way)</>}
          description="ClaudeCodeBuff is like that friend who remembers every embarrassing detail about you. It stores your coding secrets in magic scrolls (markdown files) and uses them to haunt your future sessions."
          backdropColor={SECTION_THEMES.feature3.background}
          decorativeColors={SECTION_THEMES.feature3.decorativeColors}
          textColor={SECTION_THEMES.feature3.textColor}
          tagline="SUPERNATURAL MEMORY & UNCANNY LEARNING"
          highlightText="Haunts your projects with spooky-good memory"
          learnMoreText="Learn About Our Mystical Knowledge Scrolls"
          learnMoreLink="/docs/tips#knowledge-files"
          keyPoints={FEATURE_POINTS.remembers}
          illustration={
            <ChartIllustration
              chartData={{
                labels: [
                  'Psychic Ability',
                  'Magic Power',
                  'Unicorn Energy',
                  'Memory Haunting',
                ],
                values: [95, 110, 120, 100],
                colors: Array(4).fill(
                  'bg-gradient-to-r from-green-500 to-green-300'
                ),
              }}
            />
          }
        />

        {/* Competition Section */}
        <CompetitionSection />

        {/* Testimonials Section */}
        <TestimonialsSection />

        {/* CTA Section */}
        <CTASection />
      </div>
    </div>
  )
}
