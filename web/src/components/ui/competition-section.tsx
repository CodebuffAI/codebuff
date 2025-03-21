'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CompetitionTabs } from './competition/competition-tabs'
import { CompetitorCard, CompetitorType } from './competition/competitor-card'
import { Section } from './section'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'

export function CompetitionSection() {
  const [autoPlayProgress, setAutoPlayProgress] = useState(0)
  const [activeCompetitor, setActiveCompetitor] = useState<CompetitorType>('cursor')
  const [userInteracting, setUserInteracting] = useState(false)
  const [interactionPoint, setInteractionPoint] = useState({ x: 0, y: 0 })
  const [showComparisonTooltip, setShowComparisonTooltip] = useState(false)
  const [animationComplexity, setAnimationComplexity] = useState<'simple' | 'full'>('full')
  const containerRef = useRef<HTMLDivElement>(null)
  const interactionTimeoutRef = useRef<NodeJS.Timeout>()
  const isMobile = useIsMobile()
  
  // Define competitors early
  const competitors: CompetitorType[] = ['cursor', 'claude-code', 'cline']
  
  // Set simpler animations on mobile
  useEffect(() => {
    if (isMobile) {
      setAnimationComplexity('simple')
    } else {
      setAnimationComplexity('full')
    }
  }, [isMobile])

  // Auto-play animation
  useEffect(() => {
    if (userInteracting) return // Pause when user interacts

    const interval = setInterval(() => {
      setAutoPlayProgress(p => {
        if (p >= 100) {
          // Smoothly reset and loop
          setTimeout(() => {
            // Rotate through competitors on completion
            setActiveCompetitor(prev => {
              const nextIndex = (competitors.indexOf(prev) + 1) % competitors.length
              return competitors[nextIndex]
            })
          }, 1000)
          return 0
        }
        return p + 0.3 // Slow, smooth progress
      })
    }, 50)

    return () => clearInterval(interval)
  }, [userInteracting, competitors])

  // Handle mouse interaction
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const width = rect.width
    
    // Calculate progress as percentage of width (constrained between 0-100)
    const calculatedProgress = Math.max(0, Math.min(100, (x / width) * 100))
    
    setInteractionPoint({ x, y: e.clientY - rect.top })
    setUserInteracting(true)
    setAutoPlayProgress(calculatedProgress)

    // Auto-resume after inactivity
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current)
    }

    interactionTimeoutRef.current = setTimeout(() => {
      setUserInteracting(false)
    }, 5000)
    
    // Show comparison tooltip if progress is high enough
    setShowComparisonTooltip(calculatedProgress > 70)
  }

  // Handle touch interaction
  const handleTouch = (e: React.TouchEvent) => {
    if (!containerRef.current || e.touches.length !== 1) return

    const touch = e.touches[0]
    const rect = containerRef.current.getBoundingClientRect()
    const x = touch.clientX - rect.left
    const width = rect.width
    
    // Calculate progress as percentage of width (constrained between 0-100)
    const calculatedProgress = Math.max(0, Math.min(100, (x / width) * 100))
    
    setInteractionPoint({ x, y: touch.clientY - rect.top })
    setUserInteracting(true)
    setAutoPlayProgress(calculatedProgress)

    // Auto-resume after inactivity
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current)
    }

    interactionTimeoutRef.current = setTimeout(() => {
      setUserInteracting(false)
    }, 5000)
    
    // Show comparison tooltip if progress is high enough
    setShowComparisonTooltip(calculatedProgress > 70)
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
          <motion.span 
            className="text-xs font-semibold uppercase tracking-wider text-white/70 mt-2 block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Spoiler: We're faster, smarter, and work anywhere you do
          </motion.span>
        </div>

        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-xl border border-zinc-800/50 shadow-lg"
          onMouseMove={!isMobile ? handleMouseMove : undefined}
          onTouchMove={handleTouch}
          onTouchStart={handleTouch}
        >
          {/* Interactive indicator - show on desktop */}
          {!isMobile && (
            <motion.div 
              className="absolute top-4 right-4 bg-black/70 text-white/80 text-xs px-3 py-1.5 rounded-full border border-white/10 z-20 flex items-center gap-2"
              initial={{ opacity: 0, y: -10 }}
              animate={{ 
                opacity: [0, 1, 1, 0],
                y: [-10, 0, 0, -10]
              }}
              transition={{ 
                duration: 4,
                delay: 3,
                times: [0, 0.1, 0.9, 1],
                repeat: Infinity,
                repeatDelay: 15
              }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span>Drag to interact</span>
            </motion.div>
          )}
          
          {/* Comparison tooltip */}
          <AnimatePresence>
            {showComparisonTooltip && !isMobile && (
              <motion.div
                className="absolute bg-black/80 border border-green-500/30 p-3 rounded-lg shadow-lg z-30 max-w-[220px]"
                style={{
                  top: interactionPoint.y - 20, 
                  left: interactionPoint.x + 20
                }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <div className="text-green-400 text-sm font-medium mb-1">Codebuff Advantage:</div>
                <ul className="text-white text-xs space-y-1">
                  <li className="flex items-start gap-1">
                    <span className="text-green-400 text-[10px] mt-0.5">✓</span>
                    <span>Direct path with no wasted steps</span>
                  </li>
                  <li className="flex items-start gap-1">
                    <span className="text-green-400 text-[10px] mt-0.5">✓</span>
                    <span>Works universally in any terminal</span>
                  </li>
                  <li className="flex items-start gap-1">
                    <span className="text-green-400 text-[10px] mt-0.5">✓</span>
                    <span>4x faster with 50% lower cost</span>
                  </li>
                </ul>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Layout container */}
          <div className="flex flex-col md:flex-row">
            {/* Left side tabs - vertical on desktop */}
            <div className="md:w-64 md:border-r border-zinc-800/50 bg-black/20">
              <CompetitionTabs 
                progress={autoPlayProgress}
                animationComplexity={animationComplexity}
                layout="vertical" 
              />
            </div>
            
            {/* Right side content - competitor cards */}
            <div className="flex-1 bg-black/40">
              <div className="relative h-full">
                {competitors.map((competitor) => (
                  <motion.div
                    key={competitor}
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: activeCompetitor === competitor ? 1 : 0,
                      transition: { duration: 0.3 }
                    }}
                    className={cn(
                      'absolute inset-0',
                      activeCompetitor === competitor
                        ? 'pointer-events-auto'
                        : 'pointer-events-none'
                    )}
                  >
                    <CompetitorCard 
                      type={competitor} 
                      progress={autoPlayProgress}
                      complexity={animationComplexity}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Progress scrubber - mobile only */}
          {isMobile && (
            <div className="absolute bottom-0 left-0 right-0 h-6 bg-black/50 backdrop-blur-sm border-t border-zinc-800/30">
              <div className="relative h-full w-full">
                <div className="absolute inset-0 flex items-center px-4">
                  <div className="h-1.5 bg-white/10 rounded-full w-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${autoPlayProgress}%` }}
                    />
                  </div>
                </div>
                <div 
                  className="absolute inset-0"
                  onTouchMove={handleTouch}
                  onTouchStart={handleTouch}
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Interactive instructions - mobile only */}
        {isMobile && (
          <motion.div 
            className="text-center text-xs text-white/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            Tap and drag to compare different stages
          </motion.div>
        )}
        
        {/* Bottom key metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KeyMetric 
            title="4x Faster" 
            description="5 min vs 20 min average task completion" 
            icon="⚡"
            color="bg-gradient-to-br from-amber-500/20 to-yellow-700/20" 
            delay={0}
          />
          <KeyMetric 
            title="Lower CPU Usage" 
            description="Less resource intensive than competitors" 
            icon="💻"
            color="bg-gradient-to-br from-green-500/20 to-emerald-700/20" 
            delay={0.1}
          />
          <KeyMetric 
            title="50% Lower Cost" 
            description="More efficient with better results" 
            icon="💰"
            color="bg-gradient-to-br from-blue-500/20 to-indigo-700/20" 
            delay={0.2}
          />
        </div>
        
        {/* Mobile view simplified explainer */}
        {isMobile && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <div className="space-y-4">
              <h3 className="text-xl font-medium text-white">How Codebuff Outperforms</h3>
              
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <div className="bg-red-900/30 p-1.5 rounded-lg">
                    <span className="text-red-400">😫</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-white">Cursor</h4>
                    <p className="text-sm text-white/60">Confusing maze of dead ends with frequent errors and rewrites</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <div className="bg-purple-900/30 p-1.5 rounded-lg">
                    <span className="text-purple-400">⌛</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-white">Claude Code</h4>
                    <p className="text-sm text-white/60">Multi-step process with higher CPU usage and costs</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <div className="bg-yellow-900/30 p-1.5 rounded-lg">
                    <span className="text-yellow-400">🔒</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-white">Cline</h4>
                    <p className="text-sm text-white/60">Limited to specific environments with complex setup requirements</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <div className="bg-green-900/30 p-1.5 rounded-lg">
                    <span className="text-green-400">🚀</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-white">Codebuff</h4>
                    <p className="text-sm text-white/60">Works in any terminal, 4x faster, with 50% lower cost and CPU usage</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

// Key metrics component
interface KeyMetricProps {
  title: string;
  description: string;
  icon: string;
  color: string;
  delay?: number;
}

function KeyMetric({ title, description, icon, color, delay = 0 }: KeyMetricProps) {
  return (
    <motion.div 
      className={`rounded-lg p-4 ${color} border border-white/10 shadow-md relative overflow-hidden`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ scale: 1.02 }}
    >
      {/* Animated gradient background */}
      <motion.div 
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background: 'linear-gradient(45deg, transparent 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%)',
          backgroundSize: '200% 200%',
        }}
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
        }}
        transition={{ repeat: Infinity, duration: 3 }}
      />
      
      <div className="flex items-center gap-3 relative z-10">
        <motion.div 
          className="text-2xl"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          {icon}
        </motion.div>
        <div>
          <div className="text-white font-medium">{title}</div>
          <div className="text-sm text-white/60">{description}</div>
        </div>
      </div>
    </motion.div>
  );
}