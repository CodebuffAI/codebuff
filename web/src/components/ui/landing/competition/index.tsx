import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Section } from '../../section'
import { CompetitionTabs, type CompetitorType } from './tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import { SECTION_THEMES } from '../constants'
import posthog from 'posthog-js'

export function CompetitionSection() {
  const [progress, setProgress] = useState(0)
  const [activeTab, setActiveTab] = useState<CompetitorType>('github-copilot')
  const [isInView, setIsInView] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  // Function to reset and start the timer
  const resetTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)

    setProgress(0)
    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 0
        return prev + 1
      })
    }, 100)
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
      }
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
  }, [])

  // Handler for tab changes
  const handleTabChange = (tab: CompetitorType) => {
    setActiveTab(tab)
    resetTimer()
    
    posthog.capture('home.competition_tab_changed', {
      competitor: tab
    })
  }

  return (
    <Section background={SECTION_THEMES.competition.background}>
      <div ref={sectionRef} className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div>
          <motion.h2
            className={`text-3xl md:text-4xl font-medium ${SECTION_THEMES.competition.textColor} hero-heading`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            The "Competition" 🤣
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
              Spoiler: They're still trying to figure out how we trained our AI on unicorn magic
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
