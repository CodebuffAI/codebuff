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
    component: TimelineProgress,
  },
}

export function CompetitorCard({ type, className }: CompetitorCardProps) {
  const config = competitorConfigs[type]

  return (
    <div className={cn('h-full', className)}>
      <div className="h-full flex items-center justify-center">
        <config.component />
      </div>
    </div>
  )
}
