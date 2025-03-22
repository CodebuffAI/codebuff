import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { CursorMazeVisualization } from './cursor'
import { ClaudeCodeVisualization } from './claude-code'
import { ClineVisualization } from './cline'

export type CompetitorType = 'cursor' | 'claude-code' | 'cline'

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
    color: 'text-orange-500', // Brighter orange for Claude branding
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

// Enhanced visualization component
function CompetitorCard({
  type,
  progress,
  complexity,
}: {
  type: CompetitorType
  progress: number
  complexity: 'simple' | 'full'
}) {
  // Render different visualizations based on competitor type
  if (type === 'cursor') {
    return (
      <CursorMazeVisualization progress={progress} complexity={complexity} />
    )
  } else if (type === 'claude-code') {
    return (
      <ClaudeCodeVisualization progress={progress} complexity={complexity} />
    )
  } else {
    return <ClineVisualization progress={progress} complexity={complexity} />
  }
}

export interface CompetitionTabsProps {
  progress?: number
  animationComplexity?: 'simple' | 'full'
  layout?: 'horizontal' | 'vertical'
  activeTab?: CompetitorType
  onTabChange?: (tab: CompetitorType) => void
}

export function CompetitionTabs({
  progress = 0,
  animationComplexity = 'full',
  layout = 'horizontal',
  activeTab: controlledActiveTab,
  onTabChange,
}: CompetitionTabsProps) {
  // Use internal state if no controlled state is provided
  const [internalActiveTab, setInternalActiveTab] =
    useState<CompetitorType>('cursor')

  // Determine which state to use (controlled or uncontrolled)
  const activeTab =
    controlledActiveTab !== undefined ? controlledActiveTab : internalActiveTab
  const isMobile = useIsMobile()

  // Force horizontal layout on mobile, otherwise use the specified layout
  const isVertical = layout === 'vertical' && !isMobile

  // Handler for tab changes
  const handleTabClick = (tab: CompetitorType) => {
    if (onTabChange) {
      // Controlled mode - notify parent
      onTabChange(tab)
    } else {
      // Uncontrolled mode - update internal state
      setInternalActiveTab(tab)
    }
  }

  // Change tabs automatically based on progress
  useEffect(() => {
    // Skip auto-changing if we're in controlled mode
    if (controlledActiveTab !== undefined) return

    const tabThreshold = 100 / competitors.length
    const tabIndex = Math.min(
      Math.floor(progress / tabThreshold),
      competitors.length - 1
    )

    // Only auto-change if progress is incrementing (not user clicking)
    if (progress > 0) {
      setInternalActiveTab(competitors[tabIndex])
    }
  }, [progress, controlledActiveTab])

  return (
    <div
      className={cn('h-full', isVertical ? 'flex flex-row' : 'flex flex-col')}
    >
      {/* Tabs - horizontal or vertical */}
      <div
        className={cn(
          isVertical
            ? 'w-1/4 p-2 flex flex-col border-r border-zinc-800/50 bg-black/10'
            : 'p-2 flex border-b border-zinc-800/50 bg-black/10',
          'min-h-[60px]' // Ensure minimum height for horizontal tabs
        )}
      >
        {competitors.map((competitor) => (
          <motion.button
            key={competitor}
            onClick={() => handleTabClick(competitor)}
            className={cn(
              'text-center py-2 px-4 rounded-lg transition-all duration-300',
              'hover:bg-white/5 relative group',
              isVertical ? 'mb-2' : 'flex-1',
              activeTab === competitor
                ? 'bg-white/10 text-white'
                : 'text-white/60'
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="space-y-1">
              <div
                className={cn(
                  'flex items-center justify-center gap-1 md:gap-2',
                  isVertical && 'justify-start'
                )}
              >
                <motion.span
                  className={competitorInfo[competitor].color}
                  animate={
                    activeTab === competitor
                      ? {
                          scale: [1, 1.1, 1],
                          rotate:
                            competitor === 'cursor'
                              ? [0, -5, 0, 5, 0]
                              : undefined,
                        }
                      : {}
                  }
                  transition={{
                    repeat: Infinity,
                    duration: competitor === 'cursor' ? 2 : 1.5,
                    repeatDelay: 1,
                  }}
                >
                  {competitorInfo[competitor].emoji}
                </motion.span>
                <span className="font-medium">
                  {competitorInfo[competitor].name}
                </span>
              </div>
              <p
                className={cn(
                  'text-xs text-white/40 hidden md:block',
                  isVertical && 'text-left'
                )}
              >
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
                scaleY:
                  isVertical && activeTab === competitor
                    ? 1
                    : isVertical
                      ? 0
                      : 1,
                scaleX:
                  !isVertical && activeTab === competitor
                    ? 1
                    : !isVertical
                      ? 0
                      : 1,
                opacity: activeTab === competitor ? 1 : 0.3,
              }}
              transition={{ duration: 0.3 }}
              style={{
                transformOrigin: isVertical ? 'top' : 'center',
                background:
                  activeTab === competitor
                    ? competitor === 'cursor'
                      ? 'linear-gradient(to right, rgba(248, 113, 113, 0.5), rgba(248, 113, 113, 0.3))'
                      : competitor === 'claude-code'
                        ? 'linear-gradient(to right, rgba(249, 115, 22, 0.5), rgba(249, 115, 22, 0.3))' // Brighter orange for Claude branding
                        : 'linear-gradient(to right, rgba(251, 191, 36, 0.5), rgba(251, 191, 36, 0.3))'
                    : 'rgba(255, 255, 255, 0.3)',
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

      {/* Content Area - shown in both layouts */}
      <div
        className={cn(
          'relative flex-1 bg-black/20',
          isVertical ? 'ml-4' : 'mt-1'
        )}
      >
        <div className="absolute inset-0">
          {competitors.map((competitor) => (
            <motion.div
              key={competitor}
              initial={{ opacity: 0 }}
              animate={{
                opacity: activeTab === competitor ? 1 : 0,
                transition: { duration: 0.3 },
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
    </div>
  )
}