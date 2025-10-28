import { motion } from 'framer-motion'
import posthog from 'posthog-js'
import { useState, useEffect, useRef } from 'react'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import { CompetitionTabs, type CompetitorType, competitors } from './tabs'
import { Section } from '../../section'
import { SECTION_THEMES } from '../constants'

import { useIsMobile } from '@/hooks/use-mobile'

export function CompetitionSection() {
  const [progress, setProgress] = useState(0)
  const [activeTab, setActiveTab] = useState<CompetitorType>('github-copilot')
  const [isInView, setIsInView] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const cycleTimeMs = 8000 // 8 seconds per competitor

  // Function to advance to the next tab
  const advanceToNextTab = () => {
    if (competitors) {
      const currentIndex = competitors.indexOf(activeTab)
      if (currentIndex !== -1) {
        const nextIndex = (currentIndex + 1) % competitors.length
        setActiveTab(competitors[nextIndex])
        // Reset progress when switching tabs
        setProgress(0)
      }
    }
  }

  // Function to reset and start the timer
  const resetTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)

    setProgress(0)
    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        // Calculate the increment to complete in cycleTimeMs
        const increment = 100 / (cycleTimeMs / 50)
        const newProgress = prev + increment

        if (newProgress >= 100) {
          // Schedule the tab advance for the next tick to avoid state update conflicts
          setTimeout(() => advanceToNextTab(), 0)
          return 100 // Cap at 100 until the next tick
        }
        return newProgress
      })
    }, 50) // Update every 50ms for smoother animation
  }

  // Set up intersection observer to detect when section is in view
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        setIsInView(entry.isIntersecting)

        // Start or pause the timer based on visibility
        if (entry.isIntersecting) {
          resetTimer()
        } else {
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
        }
      },
      {
        rootMargin: '-10% 0px',
        threshold: 0.1, // Trigger when at least 10% of the section is visible
      },
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current)
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [activeTab]) // Re-establish timer when tab changes

  // Handler for tab changes initiated by user
  const handleTabChange = (tab: CompetitorType) => {
    // Set the active tab and reset progress
    if (tab !== activeTab) {
      setActiveTab(tab)
      setProgress(0)
      resetTimer()

      posthog.capture(AnalyticsEvent.HOME_COMPETITION_TAB_CHANGED, {
        competitor: tab,
      })
    }
  }

  return (
    <Section background={SECTION_THEMES.competition.background}>
      <div
        ref={sectionRef}
        className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
      >
        <div>
          <motion.h2
            className={`feature-heading ${SECTION_THEMES.competition.textColor}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            The Competition
          </motion.h2>
          <motion.div
            className="flex items-center gap-2 mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <span
              className={`text-xs font-semibold uppercase tracking-wider ${SECTION_THEMES.competition.textColor}/70 block`}
            >
              Spoiler: We're faster, smarter, and work anywhere you do
            </span>
          </motion.div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800/50 overflow-hidden h-[500px]">
          <CompetitionTabs
            progress={isInView ? progress : 0}
            animationComplexity={isMobile ? 'simple' : 'full'}
            layout="vertical"
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </div>
      </div>
    </Section>
  )
}
