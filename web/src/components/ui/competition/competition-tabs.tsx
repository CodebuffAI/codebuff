'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CompetitorCard, CompetitorType } from './competitor-card'
import { motion } from 'framer-motion'
import { CodebuffPath } from './codebuff-path'

const competitors: CompetitorType[] = ['cursor', 'claude-code', 'cline']

const competitorInfo = {
  cursor: {
    name: 'Cursor',
    color: 'text-red-400',
    description: 'Generic AI suggestions',
  },
  'claude-code': {
    name: 'Claude Code',
    color: 'text-purple-400',
    description: 'Slow, multi-step process',
  },
  cline: {
    name: 'Cline',
    color: 'text-yellow-400',
    description: 'Limited to specific environments',
  },
}

export function CompetitionTabs() {
  const [activeTab, setActiveTab] = useState<CompetitorType>('cursor')

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Codebuff Path */}
      <div className="hidden md:block md:w-64 md:border-r border-zinc-800/50 bg-black/20">
        <div className="p-4">
          <CodebuffPath />
        </div>
      </div>

      {/* Vertical Tabs */}
      <div className="md:w-64 md:border-r border-zinc-800/50 bg-black/20">
        <div className="flex md:flex-col p-4 gap-2 overflow-x-auto md:overflow-visible">
          {competitors.map((competitor) => (
            <button
              key={competitor}
              onClick={() => setActiveTab(competitor)}
              className={cn(
                'flex-1 md:flex-none text-left p-6 rounded-lg transition-all duration-300',
                'hover:bg-white/5 relative group',
                activeTab === competitor
                  ? 'bg-white/10 text-white'
                  : 'text-white/60'
              )}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={competitorInfo[competitor].color}>vs</span>
                  <span className="font-medium">
                    {competitorInfo[competitor].name}
                  </span>
                </div>
                <p className="text-sm text-white/40 hidden md:block">
                  {competitorInfo[competitor].description}
                </p>
              </div>

              {/* Active indicator */}
              <div
                className={cn(
                  'absolute md:left-0 md:right-auto md:top-0 md:bottom-0 md:w-0.5 md:h-full',
                  'bottom-0 left-0 right-0 top-auto w-full h-0.5',
                  'bg-primary transform scale-x-0 transition-transform duration-300',
                  activeTab === competitor && 'scale-x-100'
                )}
                style={{ transformOrigin: 'left' }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 relative bg-black/30">
        <div className="absolute inset-0">
          {competitors.map((competitor) => (
            <motion.div
              key={competitor}
              initial={{ opacity: 0, x: 20 }}
              animate={{
                opacity: activeTab === competitor ? 1 : 0,
                x: activeTab === competitor ? 0 : 20,
              }}
              transition={{ duration: 0.3 }}
              className={cn(
                'absolute inset-0',
                activeTab === competitor
                  ? 'pointer-events-auto'
                  : 'pointer-events-none'
              )}
            >
              <CompetitorCard type={competitor} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
