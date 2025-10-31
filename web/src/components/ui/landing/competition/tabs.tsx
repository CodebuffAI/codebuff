import { motion } from 'framer-motion'
import Image from 'next/image'
import { useEffect, useState } from 'react'

import { ClaudeCodeVisualization } from './claude-code'
import { ClineVisualization } from './cline'
import { CursorMazeVisualization } from './cursor'
import { GithubCopilotVisualization } from './github-copilot'

import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

export const competitors = [
  'github-copilot',
  'cursor',
  'claude-code',
  'cline',
  // Potential additional competitors to consider:
  // - Replit Ghostwriter/Agent
] as const
export type CompetitorType = (typeof competitors)[number]

const competitorInfo = {
  'github-copilot': {
    name: 'GitHub Copilot',
    shortName: 'Copilot',
    color: 'text-indigo-400',
    description: 'Endless bugs and hallucinations',
    emoji: '🤖',
    className: 'invert',
    component: GithubCopilotVisualization,
  },
  cursor: {
    name: 'Cursor',
    shortName: 'Cursor',
    color: 'text-red-400',
    description: 'Confusing maze of dead ends',
    emoji: '😫',
    className: '',
    component: CursorMazeVisualization,
  },
  'claude-code': {
    name: 'Claude Code',
    shortName: 'Claude',
    color: 'text-orange-500',
    description: 'Slow, multi-step process',
    emoji: '⌛',
    className: '',
    component: ClaudeCodeVisualization,
  },
  cline: {
    name: 'Cline',
    shortName: 'Cline',
    color: 'text-yellow-400',
    description: 'Requires constant babysitting',
    emoji: '👶',
    className: '',
    component: ClineVisualization,
  },
}

interface CompetitorCardProps {
  type: CompetitorType
  progress: number
  complexity: 'simple' | 'full'
  isActive?: boolean
}

function CompetitorCard({
  type,
  progress,
  complexity,
  isActive,
}: CompetitorCardProps) {
  const Component = competitorInfo[type].component
  return (
    <Component
      progress={progress}
      complexity={complexity}
      isActive={isActive}
    />
  )
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
      competitors.length - 1,
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
            : isMobile
              ? 'p-1 grid grid-cols-4 gap-1 border-b border-zinc-800/50 bg-black/10'
              : 'p-2 flex border-b border-zinc-800/50 bg-black/10',
          'min-h-[40px]',
        )}
        role="tablist"
        aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      >
        {competitors.map((competitor) => (
          <motion.button
            key={competitor}
            role="tab"
            id={`tab-${competitor}`}
            aria-selected={activeTab === competitor}
            aria-controls={`panel-${competitor}`}
            onClick={() => handleTabClick(competitor)}
            tabIndex={activeTab === competitor ? 0 : -1}
            className={cn(
              'text-center py-2 px-2 sm:px-4 transition-all duration-300',
              'relative group font-paragraph',
              isVertical ? 'mb-2' : 'flex-1',
              isMobile ? 'rounded' : 'rounded-lg',
              activeTab === competitor
                ? 'bg-white/10 text-white'
                : 'text-white/60',
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="space-y-1">
              <div
                className={cn(
                  'flex items-center justify-center gap-1 md:gap-2',
                  isVertical && 'justify-start',
                  isMobile && 'flex-col',
                )}
              >
                <motion.span
                  className={cn(
                    competitorInfo[competitor].color,
                    'flex items-center justify-center w-5 h-5',
                  )}
                  animate={
                    activeTab === competitor
                      ? {
                          scale: [1, 1.1, 1],
                        }
                      : {}
                  }
                  transition={{
                    repeat: Infinity,
                    duration: competitor === 'cursor' ? 2 : 1.5,
                    repeatDelay: 1,
                  }}
                >
                  <span
                    className={cn(
                      'flex items-center justify-center relative w-5 h-5',
                      competitorInfo[competitor].className,
                    )}
                  >
                    <Image
                      src={`/logos/${competitor}.png`}
                      alt={competitorInfo[competitor].name}
                      width={18}
                      height={18}
                    />
                  </span>
                </motion.span>
                <span
                  className={cn(
                    'font-medium truncate max-w-full',
                    isMobile && 'text-xs',
                  )}
                >
                  {isMobile
                    ? competitorInfo[competitor].shortName
                    : competitorInfo[competitor].name}
                </span>
              </div>
              <p
                className={cn(
                  'text-xs text-white/40 hidden md:block',
                  isVertical && 'text-left',
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
                'bg-white/30',
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
              className="absolute inset-0 rounded bg-white/0 pointer-events-none"
              initial={false}
              transition={{ duration: 0.2 }}
            />
          </motion.button>
        ))}
      </div>

      <div
        className={cn(
          'relative flex-1 bg-black/20',
          isVertical ? 'ml-4' : 'mt-1',
        )}
      >
        <div className="absolute inset-0">
          {competitors.map((competitor) => (
            <motion.div
              key={competitor}
              id={`panel-${competitor}`}
              role="tabpanel"
              aria-labelledby={`tab-${competitor}`}
              initial={{ opacity: 0 }}
              animate={{
                opacity: activeTab === competitor ? 1 : 0,
                transition: { duration: 0.3 },
              }}
              className={cn(
                'absolute inset-0',
                activeTab === competitor
                  ? 'pointer-events-auto'
                  : 'pointer-events-none',
              )}
              hidden={activeTab !== competitor}
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
