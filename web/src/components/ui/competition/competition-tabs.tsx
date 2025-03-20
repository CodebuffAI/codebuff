'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CompetitorCard, CompetitorType } from './competitor-card'

const competitors: CompetitorType[] = ['cursor', 'claude-code', 'cline']

export function CompetitionTabs() {
  const [activeTab, setActiveTab] = useState<CompetitorType>('cursor')

  return (
    <div className="space-y-12">
      {/* Tabs */}
      <div className="flex justify-center space-x-4">
        {competitors.map((competitor) => (
          <button
            key={competitor}
            onClick={() => setActiveTab(competitor)}
            className={cn(
              'px-6 py-3 rounded-lg text-sm font-medium transition-all duration-300',
              'hover:bg-white/10 relative group overflow-hidden',
              activeTab === competitor
                ? 'bg-white/10 text-white'
                : 'text-white/60'
            )}
          >
            <span className="relative z-10">
              {competitor === 'cursor' && (
                <>
                  vs <span className="text-red-400">Cursor</span>
                </>
              )}
              {competitor === 'claude-code' && (
                <>
                  vs <span className="text-purple-400">Claude Code</span>
                </>
              )}
              {competitor === 'cline' && (
                <>
                  vs <span className="text-yellow-400">Cline</span>
                </>
              )}
            </span>
            {/* Hover effect */}
            <div 
              className={cn(
                "absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent",
                "opacity-0 group-hover:opacity-100 transition-opacity duration-300",
                activeTab === competitor && "opacity-100"
              )}
            />
            {/* Active indicator */}
            {activeTab === competitor && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary" />
            )}
            {/* Hover indicator */}
            <div 
              className={cn(
                "absolute bottom-0 left-0 w-full h-0.5 bg-primary/50",
                "scale-x-0 group-hover:scale-x-100 transition-transform duration-300",
                activeTab === competitor ? "opacity-0" : "opacity-100"
              )}
              style={{ transformOrigin: "left" }}
            />
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="relative min-h-[600px]">
        {competitors.map((competitor) => (
          <div
            key={competitor}
            className={cn(
              'absolute inset-0 transition-all duration-500',
              activeTab === competitor ? 'z-10' : 'z-0',
              activeTab === competitor ? 'translate-x-0 opacity-100' : 
                competitors.indexOf(competitor) < competitors.indexOf(activeTab) ? 
                '-translate-x-full opacity-0' : 'translate-x-full opacity-0'
            )}
          >
            <CompetitorCard
              type={competitor}
              isActive={activeTab === competitor}
            />
          </div>
        ))}
      </div>

      {/* Navigation dots */}
      <div className="flex justify-center space-x-2">
        {competitors.map((competitor) => (
          <button
            key={competitor}
            onClick={() => setActiveTab(competitor)}
            className={cn(
              'w-2 h-2 rounded-full transition-all duration-300 transform',
              activeTab === competitor 
                ? 'bg-primary scale-125' 
                : 'bg-white/20 hover:bg-white/40'
            )}
            aria-label={`Switch to ${competitor} comparison`}
          />
        ))}
      </div>
    </div>
  )
}