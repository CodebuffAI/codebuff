import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { CursorMazeVisualization } from './cursor'
import { ClaudeCodeVisualization } from './claude-code'
import { ClineVisualization } from './cline'
import { GithubCopilotVisualization } from './github-copilot'

const competitors = [
  'github-copilot',
  'cursor',
  'claude-code',
  'cline',
] as const
export type CompetitorType = (typeof competitors)[number]

const competitorInfo = {
  'github-copilot': {
    name: 'GitHub Copilot',
    color: 'text-indigo-400',
    description: 'Endless bugs and hallucinations',
    emoji: '🤖',
    component: GithubCopilotVisualization,
  },
  cursor: {
    name: 'Cursor',
    color: 'text-red-400',
    description: 'Confusing maze of dead ends',
    emoji: '😫',
    component: CursorMazeVisualization,
  },
  'claude-code': {
    name: 'Claude Code',
    color: 'text-orange-500',
    description: 'Slow, multi-step process',
    emoji: '⌛',
    component: ClaudeCodeVisualization,
  },
  cline: {
    name: 'Cline',
    color: 'text-yellow-400',
    description: 'Requires constant babysitting',
    emoji: '👶',
    component: ClineVisualization,
  },
}

interface CompetitorCardProps {
  type: CompetitorType
  progress: number
  complexity: 'simple' | 'full'
  isActive?: boolean
}

function CompetitorCard({ type, progress, complexity, isActive }: CompetitorCardProps) {
  const Component = competitorInfo[type].component
  return <Component progress={progress} complexity={complexity} isActive={isActive} />
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
  const [internalActiveTab, setInternalActiveTab] =
    useState<CompetitorType>('cursor')

  const activeTab =
    controlledActiveTab !== undefined ? controlledActiveTab : internalActiveTab
  const isMobile = useIsMobile()

  const isVertical = layout === 'vertical' && !isMobile

  const handleTabClick = (tab: CompetitorType) => {
    if (onTabChange) {
      onTabChange(tab)
    } else {
      setInternalActiveTab(tab)
    }
  }

  useEffect(() => {
    if (controlledActiveTab !== undefined) return

    const tabThreshold = 100 / competitors.length
    const tabIndex = Math.min(
      Math.floor(progress / tabThreshold),
      competitors.length - 1
    )

    if (progress > 0) {
      setInternalActiveTab(competitors[tabIndex])
    }
  }, [progress, controlledActiveTab])

  return (
    <div
      className={cn('h-full', isVertical ? 'flex flex-row' : 'flex flex-col')}
    >
      <div
        className={cn(
          isVertical
            ? 'w-1/4 p-2 flex flex-col border-r border-zinc-800/50 bg-black/10'
            : 'p-2 flex border-b border-zinc-800/50 bg-black/10',
          'min-h-[60px]'
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
                        ? 'linear-gradient(to right, rgba(249, 115, 22, 0.5), rgba(249, 115, 22, 0.3))'
                        : competitor === 'github-copilot'
                          ? 'linear-gradient(to right, rgba(129, 140, 248, 0.5), rgba(129, 140, 248, 0.3))'
                          : 'linear-gradient(to right, rgba(251, 191, 36, 0.5), rgba(251, 191, 36, 0.3))'
                    : 'rgba(255, 255, 255, 0.3)',
              }}
            />

            <motion.div
              className="absolute inset-0 rounded-lg bg-white/0 pointer-events-none"
              initial={false}
              whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.03)' }}
              transition={{ duration: 0.2 }}
            />
          </motion.button>
        ))}
      </div>

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
                isActive={activeTab === competitor}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
