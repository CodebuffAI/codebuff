'use client'

import { cn } from '@/lib/utils'
import { DecorativeBlocks, BlockColor } from '@/components/ui/decorative-blocks'
import { CursorMaze } from './cursor-maze'
import { CodebuffPath } from './codebuff-path'
import { TimelineProgress } from './timeline-progress'

export type CompetitorType = 'cursor' | 'claude-code' | 'cline'

interface CompetitorCardProps {
  type: CompetitorType
  className?: string
}

interface CompetitorConfig {
  title: string
  description: string
  colors: BlockColor[]
  component: () => JSX.Element
}

const competitorConfigs: Record<CompetitorType, CompetitorConfig> = {
  cursor: {
    title: 'Cursor',
    description: 'Generic AI suggestions',
    colors: [BlockColor.CRTAmber, BlockColor.DarkForestGreen],
    component: CursorMaze,
  },
  'claude-code': {
    title: 'Claude Code',
    description: 'Slow, multi-step process',
    colors: [BlockColor.GenerativeGreen, BlockColor.AcidMatrix],
    component: CodebuffPath,
  },
  cline: {
    title: 'Cline',
    description: 'Limited to specific environments',
    colors: [BlockColor.TerminalYellow, BlockColor.DarkForestGreen],
    component: () => <></>,
  },
}

export function CompetitorCard({ type, className }: CompetitorCardProps) {
  const config = competitorConfigs[type]

  return (
    <div className={cn('h-full p-8', className)}>
      <div className="h-full flex flex-col items-center justify-center gap-8">
        <div
          className={cn(
            'bg-black/40 backdrop-blur-sm rounded-lg p-8 text-center',
            type === 'cursor' ? 'w-[700px]' : 'w-[300px]'
          )}
        >
          <config.component />
        </div>

        {/* {'component' in config && (
          <div className="w-full max-w-md">
            <TimelineProgress
              progress={type === 'cursor' ? 50 : 100}
              events={type === 'cursor' ? [
                { timestamp: 2000, type: 'error', emotion: 'confused' },
                { timestamp: 5000, type: 'retry', emotion: 'frustrated' },
                { timestamp: 10000, type: 'retry', emotion: 'frustrated' },
                { timestamp: 15000, type: 'retry', emotion: 'confused' },
              ] : [
                { timestamp: 2000, type: 'success', emotion: 'confident' },
                { timestamp: 5000, type: 'success', emotion: 'confident' },
              ]}
            />
          </div>
        )} */}
      </div>
    </div>
  )
}
