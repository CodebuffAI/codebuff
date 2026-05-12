'use client'

import { motion } from 'framer-motion'
import { ChevronDown, Cpu, Globe2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { CopyButton } from '@/components/copy-button'

import type { FreebuffLiveStats } from '@/server/live-stats'
import type { LucideIcon } from 'lucide-react'

const INSTALL_COMMAND = 'npm install -g freebuff'
const POLL_MS = 15_000
const MAP_SIZE = { width: 1000, height: 520 }
const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' })

const COUNTRY_POINTS: Record<string, readonly [lat: number, lon: number]> = {
  AT: [47.5, 14.5],
  AU: [-25.3, 133.8],
  BE: [50.5, 4.5],
  CA: [56.1, -106.3],
  CH: [46.8, 8.2],
  DE: [51.2, 10.4],
  DK: [56, 10],
  ES: [40.4, -3.7],
  FI: [64, 26],
  FR: [46.2, 2.2],
  GB: [55, -3],
  IE: [53.4, -8.2],
  IL: [31, 35],
  IS: [65, -18],
  IT: [42.8, 12.8],
  LI: [47.1, 9.6],
  LU: [49.8, 6.1],
  MT: [35.9, 14.4],
  NL: [52.1, 5.3],
  NO: [61, 8],
  NZ: [-41, 174],
  PT: [39.4, -8.2],
  SE: [62, 15],
  SG: [1.4, 103.8],
  US: [39.8, -98.6],
}

const LAND_PATHS = [
  'M93 151 C137 94 226 78 303 114 C376 149 362 217 288 237 C229 254 229 323 171 303 C104 280 61 197 93 151Z',
  'M276 291 C320 311 350 354 330 414 C313 468 269 500 247 466 C223 428 232 365 205 332 C185 307 229 277 276 291Z',
  'M444 118 C523 79 655 87 727 124 C799 160 890 160 923 214 C955 265 879 295 823 270 C744 235 725 292 638 283 C551 274 502 240 438 259 C386 274 338 225 357 176 C371 142 403 138 444 118Z',
  'M690 310 C731 277 796 297 825 333 C852 366 831 426 779 436 C728 447 671 390 690 310Z',
  'M766 439 C805 423 863 442 889 478 C837 492 792 489 746 470 C748 455 755 446 766 439Z',
  'M421 96 C448 80 495 83 516 105 C486 118 454 121 421 96Z',
]

const SETUP_STEPS = [
  'Open your terminal',
  'Navigate to your project',
  INSTALL_COMMAND,
  'freebuff',
]

function countryName(code: string): string {
  return code === 'UNKNOWN' ? 'Unknown' : (REGION_NAMES.of(code) ?? code)
}

function formattedTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso))
}

function projectPoint(lat: number, lon: number) {
  return {
    x: ((lon + 180) / 360) * MAP_SIZE.width,
    y: ((90 - lat) / 180) * MAP_SIZE.height,
  }
}

function useLiveStats(initialStats: FreebuffLiveStats) {
  const [stats, setStats] = useState(initialStats)

  useEffect(() => {
    let isMounted = true

    async function refresh() {
      const response = await fetch('/api/live', { cache: 'no-store' })
      if (response.ok && isMounted) {
        setStats((await response.json()) as FreebuffLiveStats)
      }
    }

    const interval = window.setInterval(refresh, POLL_MS)
    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [])

  return stats
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-[0.18em] text-white/45">
          {label}
        </span>
      </div>
      <div className="mt-3 min-h-10 text-3xl font-serif leading-none text-white">
        {value}
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

function WorldMap({ stats }: { stats: FreebuffLiveStats }) {
  const maxCount = Math.max(1, ...stats.countries.map((row) => row.count))
  const plottedCountries = stats.countries
    .map((country) => {
      const point = COUNTRY_POINTS[country.countryCode]
      return point ? { ...country, point } : null
    })
    .filter((country) => country !== null)

  return (
    <section className="relative overflow-hidden rounded-lg border border-white/10 bg-[#03110f] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <svg
        viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`}
        role="img"
        aria-label="World map of live Freebuff users by country"
        className="h-[360px] w-full md:h-[520px]"
      >
        <defs>
          <pattern
            id="live-map-grid"
            width="50"
            height="50"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M50 0H0V50"
              fill="none"
              stroke="rgba(255,255,255,0.055)"
              strokeWidth="1"
            />
          </pattern>
          <filter id="marker-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={MAP_SIZE.width} height={MAP_SIZE.height} fill="#03110f" />
        <rect
          width={MAP_SIZE.width}
          height={MAP_SIZE.height}
          fill="url(#live-map-grid)"
        />
        <path
          d="M0 260 C140 220 240 300 380 260 S650 205 1000 245 V520 H0Z"
          fill="rgba(34, 211, 238, 0.035)"
        />
        {LAND_PATHS.map((path) => (
          <path
            key={path}
            d={path}
            fill="rgba(255,255,255,0.105)"
            stroke="rgba(255,255,255,0.13)"
            strokeWidth="1.5"
          />
        ))}

        {plottedCountries.map(({ countryCode, count, point }) => {
          const [lat, lon] = point
          const { x, y } = projectPoint(lat, lon)
          const radius = 7 + Math.sqrt(count / maxCount) * 20

          return (
            <g key={countryCode}>
              <motion.circle
                cx={x}
                cy={y}
                r={radius}
                fill="rgba(34, 211, 238, 0.16)"
                stroke="rgba(34, 211, 238, 0.45)"
                strokeWidth="2"
                initial={{ opacity: 0.35, scale: 0.75 }}
                animate={{
                  opacity: [0.35, 0.78, 0.35],
                  scale: [0.85, 1, 0.85],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                style={{ transformOrigin: `${x}px ${y}px` }}
                filter="url(#marker-glow)"
              />
              <circle cx={x} cy={y} r="4.5" fill="#7CFF3F" />
              <text
                x={x}
                y={y - radius - 9}
                textAnchor="middle"
                className="fill-white text-[18px] font-medium"
              >
                {count}
              </text>
              <title>
                {countryName(countryCode)}: {count}
              </title>
            </g>
          )
        })}
      </svg>

      {plottedCountries.length === 0 && (
        <div className="absolute inset-x-6 top-1/2 mx-auto max-w-sm -translate-y-1/2 rounded-lg border border-white/10 bg-black/55 px-5 py-4 text-center backdrop-blur">
          <div className="font-serif text-2xl text-white">Standing by</div>
          <div className="mt-1 text-sm text-white/50">
            Live sessions will appear here as users start Freebuff.
          </div>
        </div>
      )}
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
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
  const topCountry = useMemo(
    () =>
      stats.countries[0]
        ? countryName(stats.countries[0].countryCode)
        : 'None yet',
    [stats.countries],
  )

  useEffect(() => {
    setHasMounted(true)
  }, [])

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(124,255,63,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.05)_1px,transparent_1px)] bg-[size:56px_56px]" />
        <div className="relative container mx-auto px-4 pb-6 pt-10 md:pb-8 md:pt-14">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
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
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2">
            <StatTile
              label="Live users"
              value={stats.totalLiveUsers.toLocaleString()}
            />
            <StatTile label="Top country" value={topCountry} />
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-8 pt-5 md:pb-10 md:pt-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
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
