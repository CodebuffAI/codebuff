'use client'

import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { useEffect, useState, Suspense } from 'react'

import IDEDemo from '@/components/IDEDemo'
import { BlockColor, DecorativeBlocks } from '@/components/ui/decorative-blocks'
import { Hero } from '@/components/ui/hero'
import { CompetitionSection } from '@/components/ui/landing/competition'
import {
  FEATURE_POINTS,
  SECTION_THEMES
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

function SearchParamsHandler() {
  const searchParams = useSearchParams()
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
              }
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
    posthog.capture('home.feature_learn_more_clicked', {
      feature: featureName,
      link,
    })
  }

  return (
    <div className="relative">
      <Suspense>
        <SearchParamsHandler />
      </Suspense>
      
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
                  'bg-gradient-to-r from-green-500 to-green-300'
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
