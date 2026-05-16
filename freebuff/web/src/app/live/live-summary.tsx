'use client'

import { ArrowRight, Cpu, Globe2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import {
  EMPTY_LIVE_STATS,
  countryName,
  useLiveStats,
} from './live-stats-client'

import type { FreebuffLiveStats } from '@/server/live-stats'
import type { LucideIcon } from 'lucide-react'

function useHomepageLiveStats(initialStats: FreebuffLiveStats) {
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const stats = useLiveStats(initialStats, {
    enabled: isVisible,
    pauseWhenHidden: true,
    refreshOnMount: true,
  })

  useEffect(() => {
    const section = sectionRef.current
    if (!section || !('IntersectionObserver' in window)) {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '240px 0px', threshold: 0.01 },
    )

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return { sectionRef, stats }
}

function LiveRows({
  title,
  icon: Icon,
  rows,
  emptyLabel,
}: {
  title: string
  icon: LucideIcon
  rows: { label: string; value: number; sublabel?: string }[]
  emptyLabel: string
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-white/46">
          {title}
        </h3>
        <Icon className="h-4 w-4 text-cyan-300" aria-hidden />
      </div>
      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={`${row.label}-${row.sublabel ?? ''}`}
              className="flex items-center justify-between gap-3 rounded-md bg-black/25 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white/86">
                  {row.label}
                </div>
                {row.sublabel && (
                  <div className="font-mono text-[11px] text-white/36">
                    {row.sublabel}
                  </div>
                )}
              </div>
              <div className="font-mono text-base text-acid-matrix">
                {row.value.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-white/12 bg-black/20 px-3 py-5 text-center text-sm text-white/45">
          {emptyLabel}
        </div>
      )}
    </div>
  )
}

export function HomepageLiveStats({
  initialStats = EMPTY_LIVE_STATS,
}: {
  initialStats?: FreebuffLiveStats
}) {
  const { sectionRef, stats } = useHomepageLiveStats(initialStats)
  const isLoading = stats.generatedAt === EMPTY_LIVE_STATS.generatedAt
  const topCountries = stats.countries.slice(0, 4).map((country) => ({
    label: countryName(country.countryCode),
    value: country.count,
  }))
  const topModels = stats.models.slice(0, 4).map((model) => ({
    label: model.displayName,
    value: model.count,
  }))
  const countryEmptyLabel = isLoading
    ? 'Loading active countries...'
    : 'No active countries yet.'
  const modelEmptyLabel = isLoading
    ? 'Loading active models...'
    : 'No active models right now.'

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-black py-14 md:py-20"
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(124,255,63,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.035)_1px,transparent_1px)] bg-[size:56px_56px]" />
      <div className="relative container mx-auto px-4">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-acid-matrix shadow-[0_0_20px_rgba(124,255,63,0.9)]" />
              <span className="font-mono text-xs uppercase tracking-[0.22em] text-white/48">
                Active users
              </span>
            </div>
            <div className="mt-3 font-mono text-6xl font-medium leading-none text-acid-matrix neon-text md:text-8xl">
              {isLoading ? '...' : stats.totalLiveUsers.toLocaleString()}
            </div>
            <Link
              href="/live"
              className="mt-6 inline-flex items-center gap-2 rounded-md border border-acid-matrix/45 bg-acid-matrix/10 px-4 py-2 text-sm font-medium text-acid-matrix transition-colors hover:bg-acid-matrix/15"
            >
              <span>View live map</span>
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <LiveRows
              title="Top countries"
              icon={Globe2}
              rows={topCountries}
              emptyLabel={countryEmptyLabel}
            />
            <LiveRows
              title="Models"
              icon={Cpu}
              rows={topModels}
              emptyLabel={modelEmptyLabel}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
