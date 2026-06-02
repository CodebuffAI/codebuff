'use client'

import {
  Activity,
  BarChart3,
  Clock3,
  Gauge,
  RefreshCw,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

import type {
  FreebuffLatencyHourlyPoint,
  FreebuffLatencyModelStats,
  FreebuffLatencyStats,
} from '@/server/latency-stats'
import type { LucideIcon } from 'lucide-react'

const POLL_MS = 60_000

function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}

function formatCount(count: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: count >= 10_000 ? 'compact' : 'standard',
  }).format(count)
}

function formatSamples(count: number): string {
  return `${formatCount(count)} ${count === 1 ? 'sample' : 'samples'}`
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

function getRelativeFreshness(iso: string): string {
  const elapsedMs = Date.now() - new Date(iso).getTime()
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60_000))
  if (elapsedMinutes < 1) return 'just now'
  if (elapsedMinutes === 1) return '1 min ago'
  return `${elapsedMinutes} min ago`
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-white/45">
            {label}
          </div>
          <div className="mt-2 font-mono text-3xl font-medium leading-none text-white">
            {value}
          </div>
        </div>
        <Icon className="h-5 w-5 text-cyan-300" aria-hidden />
      </div>
      <div className="mt-3 text-sm text-white/54">{detail}</div>
    </div>
  )
}

function Sparkline({
  points,
  maxLatency,
}: {
  points: FreebuffLatencyHourlyPoint[]
  maxLatency: number
}) {
  return (
    <div
      className="flex h-10 items-end gap-1"
      aria-label="Hourly median latency chart"
      role="img"
    >
      {points.map((point) => {
        const value = point.p50TtftMs ?? 0
        const height = point.sampleCount
          ? Math.max(6, Math.round((value / Math.max(1, maxLatency)) * 36))
          : 3
        return (
          <div
            key={point.hour}
            title={`${formatTime(point.hour)}: ${
              point.sampleCount
                ? `${formatLatency(point.p50TtftMs)} median`
                : 'no samples'
            }`}
            className={cn(
              'w-full min-w-1 rounded-sm',
              point.sampleCount ? 'bg-cyan-300/80' : 'bg-white/[0.08]',
            )}
            style={{ height }}
          />
        )
      })}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-black/20 px-5 py-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
        <Clock3 className="h-5 w-5 text-white/45" aria-hidden />
      </div>
      <h2 className="mt-4 font-serif text-2xl text-white">No samples yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/55">
        The dashboard is reading Freebuff model rows from the messages table
        where TTFT was recorded in the last 24 hours.
      </p>
    </div>
  )
}

function ModelLatencyRow({
  model,
  maxP95,
  maxHourlyLatency,
}: {
  model: FreebuffLatencyModelStats
  maxP95: number
  maxHourlyLatency: number
}) {
  const width = `${Math.max(3, Math.round((model.p95TtftMs / maxP95) * 100))}%`

  return (
    <div className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.035] p-4 md:grid-cols-[minmax(180px,1fr)_120px_120px_minmax(180px,1.1fr)] md:items-center">
      <div className="min-w-0">
        <div className="truncate font-medium text-white">
          {model.displayName}
        </div>
        <div className="mt-1 truncate font-mono text-xs text-white/42">
          {model.modelId}
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-[0.14em] text-white/38">
          Median
        </div>
        <div className="mt-1 font-mono text-lg text-white">
          {formatLatency(model.p50TtftMs)}
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-[0.14em] text-white/38">
          P95
        </div>
        <div className="mt-1 font-mono text-lg text-white">
          {formatLatency(model.p95TtftMs)}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 text-xs text-white/42">
          <span>{formatSamples(model.sampleCount)}</span>
          <span>hourly median</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#7cff3f,#22d3ee)]"
            style={{ width }}
          />
        </div>
        <div className="mt-3">
          <Sparkline points={model.hourly} maxLatency={maxHourlyLatency} />
        </div>
      </div>
    </div>
  )
}

function useLatencyStats(initialStats: FreebuffLatencyStats) {
  const [stats, setStats] = useState(initialStats)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function refresh() {
      if (document.visibilityState === 'hidden') return

      try {
        setIsRefreshing(true)
        const response = await fetch('/api/latency', { cache: 'no-store' })
        if (response.ok && isMounted) {
          setStats((await response.json()) as FreebuffLatencyStats)
        }
      } catch {
        // Keep the previous snapshot if a refresh fails.
      } finally {
        if (isMounted) setIsRefreshing(false)
      }
    }

    const interval = window.setInterval(refresh, POLL_MS)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }

    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      isMounted = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  return { stats, isRefreshing }
}

export default function LatencyClient({
  initialStats,
}: {
  initialStats: FreebuffLatencyStats
}) {
  const { stats, isRefreshing } = useLatencyStats(initialStats)

  const fastestModel = stats.models[0]
  const maxP95 = Math.max(1, ...stats.models.map((model) => model.p95TtftMs))
  const maxHourlyLatency = Math.max(
    1,
    ...stats.models.flatMap((model) =>
      model.hourly.map((point) => point.p50TtftMs ?? 0),
    ),
  )
  const fastestModelDetail = fastestModel
    ? `${fastestModel.displayName} · ${formatSamples(fastestModel.sampleCount)}`
    : 'No model samples'

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#020403_0%,#07100f_42%,#020403_100%)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 py-7 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-white/64 transition hover:border-acid-matrix/50 hover:text-white"
              >
                Freebuff
              </Link>
              <Link
                href="/live"
                className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-white/64 transition hover:border-cyan-300/50 hover:text-white"
              >
                Live
              </Link>
            </div>
            <h1 className="mt-5 font-serif text-4xl font-medium leading-tight text-white md:text-5xl">
              Model latency
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58 md:text-base">
              Time to first token from the last 24 hours, grouped by Freebuff
              model.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-white/54">
            <RefreshCw
              className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
              aria-hidden
            />
            <span>Updated {getRelativeFreshness(stats.generatedAt)}</span>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <SummaryMetric
            icon={Gauge}
            label="Median TTFT"
            value={formatLatency(stats.overall?.p50TtftMs)}
            detail={`${formatSamples(stats.totalSamples)} in ${stats.windowHours}h`}
          />
          <SummaryMetric
            icon={Activity}
            label="P95 TTFT"
            value={formatLatency(stats.overall?.p95TtftMs)}
            detail="Slower tail across all models"
          />
          <SummaryMetric
            icon={Zap}
            label="Lowest Median"
            value={fastestModel ? formatLatency(fastestModel.p50TtftMs) : '-'}
            detail={fastestModelDetail}
          />
          <SummaryMetric
            icon={BarChart3}
            label="Models"
            value={formatCount(stats.modelCount)}
            detail="Reporting TTFT samples"
          />
        </section>

        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-serif text-2xl text-white">By model</h2>
              <p className="mt-1 text-sm text-white/50">
                Sorted by median TTFT. Bars show P95 latency.
              </p>
            </div>
            <div className="font-mono text-xs uppercase tracking-[0.14em] text-white/38">
              Last {stats.windowHours} hours
            </div>
          </div>

          {stats.models.length ? (
            <div className="space-y-3">
              {stats.models.map((model) => (
                <ModelLatencyRow
                  key={model.modelId}
                  model={model}
                  maxP95={maxP95}
                  maxHourlyLatency={maxHourlyLatency}
                />
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </section>
      </div>
    </main>
  )
}
