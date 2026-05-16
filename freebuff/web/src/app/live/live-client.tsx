'use client'

import { motion } from 'framer-motion'
import { ChevronDown, Cpu, Globe2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { CopyButton } from '@/components/copy-button'
import { cn } from '@/lib/utils'

import {
  EMPTY_LIVE_STATS,
  countryName,
  useLiveStats,
} from './live-stats-client'
import { COUNTRY_POINTS, WORLD_LAND_PATHS } from './world-map-data'

import type { FreebuffLiveStats } from '@/server/live-stats'
import type { LucideIcon } from 'lucide-react'

const INSTALL_COMMAND = 'npm install -g freebuff'
const MAP_SIZE = { width: 1000, height: 520 }
type CountryPoint = readonly [lat: number, lon: number]
type PlottedCountry = FreebuffLiveStats['countries'][number] & {
  point: CountryPoint
}

const COUNTRY_POINT_LOOKUP = COUNTRY_POINTS as Record<string, CountryPoint>

const EQUAL_EARTH = {
  a1: 1.340264,
  a2: -0.081106,
  a3: 0.000893,
  a4: 0.003796,
  maxX: 2.74,
  maxY: 1.36,
}

const SETUP_STEPS = [
  'Open your terminal',
  'Navigate to your project',
  INSTALL_COMMAND,
  'freebuff',
]

function formattedTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso))
}

function projectPoint(lat: number, lon: number) {
  const lambda = (lon * Math.PI) / 180
  const phi = (lat * Math.PI) / 180
  const theta = Math.asin((Math.sqrt(3) / 2) * Math.sin(phi))
  const theta2 = theta * theta
  const theta6 = theta2 * theta2 * theta2
  const theta8 = theta6 * theta2
  const x =
    (2 * Math.sqrt(3) * lambda * Math.cos(theta)) /
    (3 *
      (9 * EQUAL_EARTH.a4 * theta8 +
        7 * EQUAL_EARTH.a3 * theta6 +
        3 * EQUAL_EARTH.a2 * theta2 +
        EQUAL_EARTH.a1))
  const y =
    EQUAL_EARTH.a1 * theta +
    EQUAL_EARTH.a2 * theta * theta2 +
    EQUAL_EARTH.a3 * theta * theta6 +
    EQUAL_EARTH.a4 * theta * theta8

  return {
    x: ((x + EQUAL_EARTH.maxX) / (EQUAL_EARTH.maxX * 2)) * MAP_SIZE.width,
    y: ((EQUAL_EARTH.maxY - y) / (EQUAL_EARTH.maxY * 2)) * MAP_SIZE.height,
  }
}

function linePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  return `M${from.x} ${from.y} L${to.x} ${to.y}`
}

const GRATICULE_LINES = [
  ...[-120, -60, 0, 60, 120].map((lon) => ({
    key: `lon-${lon}`,
    d: linePath(projectPoint(-62, lon), projectPoint(78, lon)),
  })),
  ...[-45, 0, 45].map((lat) => ({
    key: `lat-${lat}`,
    d: linePath(projectPoint(lat, -178), projectPoint(lat, 178)),
  })),
]

function isPlottedCountry(
  country: PlottedCountry | null,
): country is PlottedCountry {
  return country !== null
}

function LiveUsersHero({ value }: { value: number }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-acid-matrix/35 bg-[radial-gradient(circle_at_20%_20%,rgba(124,255,63,0.22),transparent_34%),linear-gradient(135deg,rgba(124,255,63,0.12),rgba(34,211,238,0.06)_48%,rgba(255,255,255,0.04))] p-5 shadow-[0_0_55px_rgba(124,255,63,0.16),inset_0_1px_0_rgba(255,255,255,0.12)] md:min-w-[310px] md:p-6">
      <div className="absolute -right-16 -top-16 h-36 w-36 rounded-full border border-cyan-300/20" />
      <div className="absolute -bottom-20 right-12 h-40 w-40 rounded-full border border-acid-matrix/15" />
      <div className="relative flex items-center gap-3">
        <motion.span
          className="h-2.5 w-2.5 rounded-full bg-acid-matrix shadow-[0_0_20px_rgba(124,255,63,0.95)]"
          animate={{ opacity: [0.45, 1, 0.45], scale: [0.8, 1.25, 0.8] }}
          transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="font-mono text-xs uppercase tracking-[0.24em] text-white/58">
          Live users
        </span>
      </div>
      <div className="relative mt-3 font-mono text-6xl font-medium leading-none text-acid-matrix neon-text md:text-7xl">
        {value.toLocaleString()}
      </div>
      <div className="relative mt-3 text-sm text-white/56">
        active Freebuff sessions right now
      </div>
    </div>
  )
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-serif text-2xl text-white">{title}</h2>
        <Icon className="h-5 w-5 text-cyan-300" aria-hidden />
      </div>
      {children}
    </section>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-black/20 px-4 py-7 text-center text-sm text-white/50">
      {children}
    </div>
  )
}

function WorldMap({
  stats,
  compact = false,
  isLoading = false,
}: {
  stats: FreebuffLiveStats
  compact?: boolean
  isLoading?: boolean
}) {
  const maxCount = Math.max(1, ...stats.countries.map((row) => row.count))
  const plottedCountries = stats.countries
    .map((country) => {
      const point = COUNTRY_POINT_LOOKUP[country.countryCode]
      return point ? { ...country, point } : null
    })
    .filter(isPlottedCountry)
  const unplottedCount = stats.countries.length - plottedCountries.length

  return (
    <section className="relative self-start overflow-hidden rounded-lg border border-white/10 bg-[#020807] shadow-[0_24px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(34,211,238,0.14),transparent_38%),linear-gradient(180deg,rgba(124,255,63,0.04),rgba(0,0,0,0.2))]" />
      {!compact && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-md border border-white/10 bg-black/45 px-3 py-2 backdrop-blur md:left-5 md:top-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
            Active countries
          </div>
          <div className="mt-1 text-2xl font-serif leading-none text-white">
            {stats.countries.length.toLocaleString()}
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`}
        role="img"
        aria-label="World map of live Freebuff users by country"
        className={cn(
          'relative w-full',
          compact ? 'h-[230px] md:h-[380px]' : 'h-[300px] md:h-[520px]',
        )}
      >
        <defs>
          <pattern
            id="live-map-grid"
            width="48"
            height="48"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M48 0H0V48"
              fill="none"
              stroke="rgba(124,255,63,0.055)"
              strokeWidth="1"
            />
          </pattern>
          <linearGradient id="live-ocean" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#03100d" />
            <stop offset="46%" stopColor="#041918" />
            <stop offset="100%" stopColor="#010504" />
          </linearGradient>
          <linearGradient id="live-land" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.20)" />
            <stop offset="55%" stopColor="rgba(124,255,63,0.11)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0.12)" />
          </linearGradient>
          <filter id="land-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy="10"
              stdDeviation="12"
              floodColor="rgba(0,0,0,0.55)"
            />
          </filter>
          <filter id="marker-glow" x="-90%" y="-90%" width="280%" height="280%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect
          width={MAP_SIZE.width}
          height={MAP_SIZE.height}
          fill="url(#live-ocean)"
        />
        <rect
          width={MAP_SIZE.width}
          height={MAP_SIZE.height}
          fill="url(#live-map-grid)"
        />
        {GRATICULE_LINES.map((line) => (
          <path
            key={line.key}
            d={line.d}
            fill="none"
            stroke="rgba(255,255,255,0.075)"
            strokeDasharray="4 8"
          />
        ))}
        <path
          d="M0 355 C170 303 305 379 475 330 S760 298 1000 342 V520 H0Z"
          fill="rgba(34, 211, 238, 0.055)"
        />
        {WORLD_LAND_PATHS.map((path, index) => (
          <path
            key={`${index}-${path.slice(0, 16)}`}
            d={path}
            fill="url(#live-land)"
            fillRule="evenodd"
            stroke="rgba(255,255,255,0.16)"
            strokeWidth="0.8"
            filter="url(#land-shadow)"
          />
        ))}

        {plottedCountries.map(({ countryCode, count, point }, index) => {
          const [lat, lon] = point
          const { x, y } = projectPoint(lat, lon)
          const radius = 6 + Math.sqrt(count / maxCount) * 24
          const showLabel = index < 9 || radius >= 19

          return (
            <g key={countryCode}>
              <motion.circle
                cx={x}
                cy={y}
                r={radius}
                fill="rgba(34, 211, 238, 0.18)"
                stroke="rgba(34, 211, 238, 0.58)"
                strokeWidth="2"
                initial={{ opacity: 0.28, scale: 0.74 }}
                animate={{
                  opacity: [0.28, 0.82, 0.28],
                  scale: [0.85, 1, 0.85],
                }}
                transition={{
                  duration: 3.2,
                  delay: index * 0.04,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                style={{ transformOrigin: `${x}px ${y}px` }}
                filter="url(#marker-glow)"
              />
              <circle
                cx={x}
                cy={y}
                r={Math.max(3.8, Math.min(6.5, radius * 0.25))}
                fill="#7CFF3F"
                stroke="rgba(255,255,255,0.82)"
                strokeWidth="1.2"
              />
              {showLabel && (
                <g>
                  <rect
                    x={x + radius * 0.46}
                    y={y - radius - 17}
                    width={String(count).length * 10 + 20}
                    height="24"
                    rx="5"
                    fill="rgba(0,0,0,0.66)"
                    stroke="rgba(255,255,255,0.14)"
                  />
                  <text
                    x={x + radius * 0.46 + 10}
                    y={y - radius}
                    className="fill-white font-mono text-[16px] font-medium"
                  >
                    {count}
                  </text>
                </g>
              )}
              <title>
                {countryName(countryCode)}: {count}
              </title>
            </g>
          )
        })}
      </svg>

      {plottedCountries.length === 0 && isLoading && (
        <div className="absolute inset-x-6 top-1/2 mx-auto max-w-sm -translate-y-1/2 rounded-lg border border-white/10 bg-black/55 px-5 py-4 text-center backdrop-blur">
          <div className="font-serif text-2xl text-white">Loading live map</div>
        </div>
      )}
      {plottedCountries.length === 0 && !isLoading && (
        <div className="absolute inset-x-6 top-1/2 mx-auto max-w-sm -translate-y-1/2 rounded-lg border border-white/10 bg-black/55 px-5 py-4 text-center backdrop-blur">
          <div className="font-serif text-2xl text-white">Standing by</div>
          <div className="mt-1 text-sm text-white/50">
            Live sessions will appear here as users start Freebuff.
          </div>
        </div>
      )}
      {!compact && unplottedCount > 0 && (
        <div className="absolute bottom-4 right-4 rounded-md border border-white/10 bg-black/45 px-3 py-2 text-xs text-white/48 backdrop-blur">
          {unplottedCount} region{unplottedCount === 1 ? '' : 's'} listed
          off-map
        </div>
      )}
    </section>
  )
}

export function CompactLiveStats({
  initialStats = EMPTY_LIVE_STATS,
}: {
  initialStats?: FreebuffLiveStats
}) {
  const stats = useLiveStats(initialStats, { refreshOnMount: true })
  const isLoading = stats.generatedAt === EMPTY_LIVE_STATS.generatedAt

  return (
    <section className="relative overflow-hidden bg-black py-14 md:py-20">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(124,255,63,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.035)_1px,transparent_1px)] bg-[size:56px_56px]" />
      <div className="relative container mx-auto px-4">
        <div className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <motion.span
                className="h-2.5 w-2.5 rounded-full bg-acid-matrix shadow-[0_0_20px_rgba(124,255,63,0.95)]"
                animate={{ opacity: [0.45, 1, 0.45], scale: [0.8, 1.2, 0.8] }}
                transition={{
                  duration: 1.9,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              <span className="font-mono text-xs uppercase tracking-[0.22em] text-white/48">
                Active users
              </span>
            </div>
            <div className="mt-2 font-mono text-5xl font-medium leading-none text-acid-matrix neon-text md:text-7xl">
              {isLoading ? '...' : stats.totalLiveUsers.toLocaleString()}
            </div>
          </div>
        </div>

        <WorldMap stats={stats} compact isLoading={isLoading} />
      </div>
    </section>
  )
}

function ModelBars({ stats }: { stats: FreebuffLiveStats }) {
  const maxCount = Math.max(1, ...stats.models.map((model) => model.count))

  if (stats.models.length === 0) {
    return <EmptyState>No models are active right now.</EmptyState>
  }

  return (
    <div className="space-y-4">
      {stats.models.map((model) => (
        <div key={model.modelId}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-white">{model.displayName}</span>
            <span className="font-mono text-white/65">{model.count}</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-acid-matrix via-cyan-300 to-white"
              initial={{ width: 0 }}
              animate={{ width: `${(model.count / maxCount) * 100}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function CountryList({ stats }: { stats: FreebuffLiveStats }) {
  if (stats.countries.length === 0) {
    return <EmptyState>No active countries yet.</EmptyState>
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
      {stats.countries.map((country) => (
        <div
          key={country.countryCode}
          className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white">
              {countryName(country.countryCode)}
            </div>
            <div className="font-mono text-xs text-white/40">
              {country.countryCode}
            </div>
          </div>
          <div className="font-mono text-lg text-acid-matrix">
            {country.count}
          </div>
        </div>
      ))}
    </div>
  )
}

function InstallCallout() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section className="container mx-auto px-4 pb-10">
      <div className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:grid-cols-[minmax(220px,0.7fr)_minmax(0,1fr)] md:items-center">
        <Link
          href="/"
          className="group flex items-center gap-3 rounded-md transition-colors hover:text-acid-matrix"
        >
          <Image
            src="/logo-icon.png"
            alt="Freebuff"
            width={32}
            height={32}
            className="rounded-sm"
          />
          <div>
            <div className="font-serif text-xl tracking-widest text-white transition-colors group-hover:text-acid-matrix">
              freebuff
            </div>
            <div className="text-sm text-white/50">The free coding agent</div>
          </div>
        </Link>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-acid-matrix/45 bg-black/35 px-4 py-3 font-mono text-sm shadow-[0_0_24px_rgba(124,255,63,0.12)]">
            <span className="text-acid-matrix">$</span>
            <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap text-white/90">
              {INSTALL_COMMAND}
            </code>
            <CopyButton value={INSTALL_COMMAND} />
          </div>

          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            className="flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-acid-matrix"
            aria-expanded={isOpen}
          >
            <span>Install guide</span>
            <motion.span animate={{ rotate: isOpen ? 180 : 0 }}>
              <ChevronDown className="h-4 w-4" aria-hidden />
            </motion.span>
          </button>

          {isOpen && (
            <ol className="grid gap-2 text-sm text-white/65 sm:grid-cols-2">
              {SETUP_STEPS.map((step, index) => (
                <li
                  key={step}
                  className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-acid-matrix/35 text-xs text-acid-matrix">
                    {index + 1}
                  </span>
                  <span className="truncate font-mono">{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  )
}

export default function LiveClient({
  initialStats,
}: {
  initialStats: FreebuffLiveStats
}) {
  const [hasMounted, setHasMounted] = useState(false)
  const stats = useLiveStats(initialStats)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(124,255,63,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.05)_1px,transparent_1px)] bg-[size:56px_56px]" />
        <div className="relative container mx-auto px-4 pb-6 pt-10 md:pb-8 md:pt-14">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                <h1 className="relative max-w-3xl pl-7 font-serif text-4xl leading-tight text-white md:pl-8 md:text-6xl">
                  <span
                    aria-hidden
                    className="absolute left-0 top-[0.43em] h-3 w-3 -translate-y-1/2 md:h-4 md:w-4"
                  >
                    <motion.span
                      className="block h-full w-full rounded-full bg-acid-matrix shadow-[0_0_18px_rgba(124,255,63,0.9)]"
                      animate={{
                        opacity: [0.45, 1, 0.45],
                        scale: [0.86, 1.18, 0.86],
                      }}
                      transition={{
                        duration: 1.8,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                  </span>
                  Freebuff live
                </h1>
                {hasMounted && (
                  <span className="whitespace-nowrap text-sm text-white/45 md:text-base">
                    Updated {formattedTime(stats.generatedAt)}
                  </span>
                )}
              </div>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/54 md:text-lg">
                Real-time Freebuff sessions across every country we can
                identify, refreshed as people start coding.
              </p>
            </div>

            <LiveUsersHero value={stats.totalLiveUsers} />
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-8 pt-5 md:pb-10 md:pt-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(330px,0.78fr)]">
          <WorldMap stats={stats} />

          <div className="space-y-6">
            <Panel icon={Cpu} title="Models">
              <ModelBars stats={stats} />
            </Panel>

            <Panel icon={Globe2} title="Countries">
              <CountryList stats={stats} />
            </Panel>
          </div>
        </div>
      </section>

      <InstallCallout />
    </main>
  )
}
