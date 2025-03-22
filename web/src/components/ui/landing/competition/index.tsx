import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Section } from '../../section'
import { CompetitionTabs, type CompetitorType } from './tabs'
import { useIsMobile } from '@/hooks/use-mobile'

export function CompetitionSection() {
  const [progress, setProgress] = useState(0)
  const [activeTab, setActiveTab] = useState<CompetitorType>('cursor')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMobile = useIsMobile()

  // Function to reset and start the timer
  const resetTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    
    setProgress(0)
    intervalRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 0
        return prev + 1
      })
    }, 100)
  }

  // Start the timer on initial render
  useEffect(() => {
    resetTimer()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // Handler for tab changes
  const handleTabChange = (tab: CompetitorType) => {
    setActiveTab(tab)
    resetTimer()
  }

  return (
    <Section background="black">
      <div className="space-y-8">
        <div>
          <motion.h2
            className="text-3xl md:text-4xl font-medium text-white hero-heading"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            Codebuff vs the Competition
          </motion.h2>
          <motion.div
            className="flex items-center gap-2 mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-white/70 block">
              Spoiler: We're faster, smarter, and work anywhere you do
            </span>
          </motion.div>
        </div>
        
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden h-[500px]">
          <CompetitionTabs 
            progress={progress} 
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