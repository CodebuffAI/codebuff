'use client'

import { cn } from '@/lib/utils'
import { DecorativeBlocks, BlockColor } from '@/components/ui/decorative-blocks'

export type CompetitorType = 'cursor' | 'claude-code' | 'cline'

interface CompetitorCardProps {
  type: CompetitorType
  className?: string
}

const competitorConfigs = {
  cursor: {
    title: 'Cursor',
    description: 'Generic AI suggestions',
    colors: [BlockColor.CRTAmber, BlockColor.DarkForestGreen],
    placeholder: 'Placeholder for Cursor demo',
  },
  'claude-code': {
    title: 'Claude Code',
    description: 'Slow, multi-step process',
    colors: [BlockColor.GenerativeGreen, BlockColor.AcidMatrix],
    placeholder: 'Placeholder for Claude Code demo',
  },
  cline: {
    title: 'Cline',
    description: 'Limited to specific environments',
    colors: [BlockColor.TerminalYellow, BlockColor.DarkForestGreen],
    placeholder: 'Placeholder for Cline demo',
  },
}

export function CompetitorCard({ type, className }: CompetitorCardProps) {
  const config = competitorConfigs[type]

  return (
    <div className={cn('h-full p-8', className)}>
      <div className="h-full flex items-center justify-center">
        <DecorativeBlocks colors={config.colors} initialPlacement="top-left">
          <div className="bg-black/40 backdrop-blur-sm rounded-lg p-8 text-center">
            <p className="text-white/60">{config.placeholder}</p>
          </div>
        </DecorativeBlocks>
      </div>
    </div>
  )
}