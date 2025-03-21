'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { CompetitorCard, CompetitorType } from './competitor-card'
import { motion } from 'framer-motion'
import { useIsMobile } from '@/hooks/use-mobile'

const competitors: CompetitorType[] = ['cursor', 'claude-code', 'cline']

const competitorInfo = {
  cursor: {
    name: 'Cursor',
    color: 'text-red-400',
    description: 'Confusing maze of dead ends',
    emoji: '😫',
  },
  'claude-code': {
    name: 'Claude Code',
    color: 'text-purple-400',
    description: 'Slow, multi-step process',
    emoji: '⌛',
  },
  cline: {
    name: 'Cline',
    color: 'text-yellow-400',
    description: 'Limited to specific environments',
    emoji: '🔒',
  },
}

export interface CompetitionTabsProps {
  progress?: number;
  animationComplexity?: 'simple' | 'full';
  layout?: 'horizontal' | 'vertical';
}

export function CompetitionTabs({ 
  progress = 0, 
  animationComplexity = 'full',
  layout = 'horizontal'
}: CompetitionTabsProps) {
  const [activeTab, setActiveTab] = useState<CompetitorType>('cursor')
  const isMobile = useIsMobile()
  const isVertical = layout === 'vertical' && !isMobile

  // Change tabs automatically based on progress
  useEffect(() => {
    const tabThreshold = 100 / competitors.length;
    const tabIndex = Math.min(
      Math.floor(progress / tabThreshold),
      competitors.length - 1
    );
    
    // Only auto-change if progress is incrementing (not user clicking)
    if (progress > 0) {
      setActiveTab(competitors[tabIndex]);
    }
  }, [progress]);
  
  // Handle reduced animations on mobile
  // This is just for guidance - we'll actually rely on the parent to set complexity
  useEffect(() => {
    // Let the parent component control the animation complexity
    // This effect just ensures proper logging or side effects
    console.log("Mobile status:", isMobile ? "mobile" : "desktop", "with complexity:", animationComplexity);
  }, [isMobile, animationComplexity]);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs - horizontal or vertical */}
      <div className={cn(
        isVertical ? "flex-1 p-2 flex flex-col" : "p-2 flex border-b border-zinc-800/50 bg-black/10"
      )}>
        {competitors.map((competitor) => (
          <motion.button
            key={competitor}
            onClick={() => setActiveTab(competitor)}
            className={cn(
              'text-center py-2 px-4 rounded-lg transition-all duration-300',
              'hover:bg-white/5 relative group',
              isVertical ? "mb-2" : "flex-1", 
              activeTab === competitor
                ? 'bg-white/10 text-white'
                : 'text-white/60'
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="space-y-1">
              <div className={cn(
                "flex items-center justify-center gap-1 md:gap-2",
                isVertical && "justify-start"
              )}>
                <motion.span 
                  className={competitorInfo[competitor].color}
                  animate={activeTab === competitor ? {
                    scale: [1, 1.1, 1],
                    rotate: competitor === 'cursor' ? [0, -5, 0, 5, 0] : undefined
                  } : {}}
                  transition={{ 
                    repeat: Infinity, 
                    duration: competitor === 'cursor' ? 2 : 1.5,
                    repeatDelay: 1
                  }}
                >
                  {competitorInfo[competitor].emoji}
                </motion.span>
                <span className="font-medium">
                  {competitorInfo[competitor].name}
                </span>
                
                {/* Show metrics badge for active tab */}
                {activeTab === competitor && !isMobile && (
                  <motion.span 
                    className="ml-1 text-xs py-0.5 px-1.5 rounded-full bg-black/30 border border-white/10"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    {competitor === 'cursor' ? (
                      <span className="text-red-400">4x Slower</span>
                    ) : competitor === 'claude-code' ? (
                      <span className="text-purple-400">2x Slower</span>
                    ) : (
                      <span className="text-yellow-400">3x Slower</span>
                    )}
                  </motion.span>
                )}
              </div>
              <p className={cn(
                "text-xs text-white/40 hidden md:block",
                isVertical && "text-left"
              )}>
                {competitorInfo[competitor].description}
              </p>
            </div>

            {/* Active indicator */}
            <motion.div
              className={cn(
                isVertical 
                  ? 'absolute left-0 top-0 bottom-0 w-0.5 h-full'
                  : 'absolute left-0 right-0 bottom-0 h-0.5 w-full',
                'bg-white/30'
              )}
              initial={false}
              animate={{ 
                scaleY: isVertical && activeTab === competitor ? 1 : isVertical ? 0 : 1,
                scaleX: !isVertical && activeTab === competitor ? 1 : !isVertical ? 0 : 1, 
                opacity: activeTab === competitor ? 1 : 0.3
              }}
              transition={{ duration: 0.3 }}
              style={{ 
                transformOrigin: isVertical ? 'top' : 'center',
                background: activeTab === competitor ? (
                  competitor === 'cursor' ? 'linear-gradient(to right, rgba(248, 113, 113, 0.5), rgba(248, 113, 113, 0.3))' :
                  competitor === 'claude-code' ? 'linear-gradient(to right, rgba(167, 139, 250, 0.5), rgba(167, 139, 250, 0.3))' :
                  'linear-gradient(to right, rgba(251, 191, 36, 0.5), rgba(251, 191, 36, 0.3))'
                ) : 'rgba(255, 255, 255, 0.3)'
              }}
            />
            
            {/* Hover effect */}
            <motion.div 
              className="absolute inset-0 rounded-lg bg-white/0 pointer-events-none"
              initial={false}
              whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.03)' }}
              transition={{ duration: 0.2 }}
            />
          </motion.button>
        ))}
      </div>

      {/* Content Area - only shown in horizontal layout */}
      {!isVertical && (
        <div className="relative flex-1 bg-black/20">
          <div className="absolute inset-0">
            {competitors.map((competitor) => (
              <motion.div
                key={competitor}
                initial={{ opacity: 0 }}
                animate={{
                  opacity: activeTab === competitor ? 1 : 0,
                  transition: { duration: 0.3 }
                }}
                className={cn(
                  'absolute inset-0',
                  activeTab === competitor
                    ? 'pointer-events-auto'
                    : 'pointer-events-none'
                )}
              >
                <CompetitorCard 
                  type={competitor} 
                  progress={progress}
                  complexity={animationComplexity}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}