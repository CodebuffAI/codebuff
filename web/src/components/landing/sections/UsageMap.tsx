'use client'

import { motion } from 'framer-motion'
import { Globe2 } from 'lucide-react'
import type { CSSProperties } from 'react'

import { COUNTRY_POINTS, WORLD_LAND_PATHS } from '../lib/world-map-data'

const MAP_SIZE = { width: 1000, height: 520 }
type CountryPoint = readonly [lat: number, lon: number]
const COUNTRY_POINT_LOOKUP = COUNTRY_POINTS as Record<string, CountryPoint>

const EQUAL_EARTH = {
  a1: 1.340264,
  a2: -0.081106,
  a3: 0.000893,
  a4: 0.003796,
  maxX: 2.74,
  maxY: 1.36,
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

function linePath(from: { x: number; y: number }, to: { x: number; y: number }) {
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

const COUNTRIES = [
  { code: 'US', name: 'United States', flag: '🇺🇸', count: 1842 },
  { code: 'IN', name: 'India', flag: '🇮🇳', count: 1203 },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', count: 684 },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', count: 521 },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', count: 447 },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', count: 392 },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', count: 318 },
  { code: 'FR', name: 'France', flag: '🇫🇷', count: 286 },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', count: 241 },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', count: 198 },
]

const GREEN = '#7CFF3F'

function WorldMap() {
  const maxCount = Math.max(1, ...COUNTRIES.map((c) => c.count))
  const plotted = COUNTRIES.map((c) => ({
    ...c,
    point: COUNTRY_POINT_LOOKUP[c.code],
  })).filter((c) => c.point)

  return (
    <section className="relative self-start overflow-hidden rounded-2xl border border-white/10 bg-[#020807] shadow-[0_24px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(34,211,238,0.14),transparent_38%),linear-gradient(180deg,rgba(124,255,63,0.04),rgba(0,0,0,0.2))]" />
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-md border border-white/10 bg-black/45 px-3 py-2 md:left-5 md:top-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
          Active countries
        </div>
        <div className="mt-1 font-serif text-2xl leading-none text-white">
          {COUNTRIES.length}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`}
        role="img"
        aria-label="World map of live Freebuff users by country"
        className="relative h-[300px] w-full md:h-[480px]"
      >
        <defs>
          <pattern id="lm-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0H0V48" fill="none" stroke="rgba(124,255,63,0.055)" strokeWidth="1" />
          </pattern>
          <linearGradient id="lm-ocean" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#03100d" />
            <stop offset="46%" stopColor="#041918" />
            <stop offset="100%" stopColor="#010504" />
          </linearGradient>
          <linearGradient id="lm-land" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="55%" stopColor="rgba(124,255,63,0.10)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0.11)" />
          </linearGradient>
        </defs>

        <rect width={MAP_SIZE.width} height={MAP_SIZE.height} fill="url(#lm-ocean)" />
        <rect width={MAP_SIZE.width} height={MAP_SIZE.height} fill="url(#lm-grid)" />
        {GRATICULE_LINES.map((line) => (
          <path key={line.key} d={line.d} fill="none" stroke="rgba(255,255,255,0.07)" strokeDasharray="4 8" />
        ))}

        {/* Single combined landmass — no per-path filters (keeps paint cheap). */}
        <g fill="url(#lm-land)" stroke="rgba(255,255,255,0.14)" strokeWidth="0.8">
          {WORLD_LAND_PATHS.map((path, index) => (
            <path key={`${index}-${path.slice(0, 16)}`} d={path} fillRule="evenodd" />
          ))}
        </g>

        {plotted.map(({ code, count, point }, index) => {
          const [lat, lon] = point as CountryPoint
          const { x, y } = projectPoint(lat, lon)
          const radius = 6 + Math.sqrt(count / maxCount) * 22
          const dot = Math.max(3.4, Math.min(6, radius * 0.26))
          return (
            <g key={code}>
              <circle
                className="lp-lm-pulse"
                cx={x}
                cy={y}
                r={radius}
                fill="rgba(34, 211, 238, 0.16)"
                stroke="rgba(34, 211, 238, 0.5)"
                strokeWidth="1.5"
                style={
                  {
                    '--dur': `${2.8 + (index % 4) * 0.4}s`,
                    '--delay': `${index * 0.18}s`,
                  } as CSSProperties
                }
              />
              <circle
                cx={x}
                cy={y}
                r={dot}
                fill={GREEN}
                stroke="rgba(255,255,255,0.8)"
                strokeWidth="1.1"
              />
              <text
                x={x + radius + 5}
                y={y + 4}
                paintOrder="stroke"
                stroke="rgba(0,0,0,0.85)"
                strokeWidth="3.5"
                strokeLinejoin="round"
                className="font-mono text-[13px] font-semibold"
                fill={GREEN}
              >
                {count.toLocaleString()}
              </text>
            </g>
          )
        })}
      </svg>
    </section>
  )
}

export function UsageMap() {
  const totalLive = COUNTRIES.reduce((s, c) => s + c.count, 0)
  const maxCountry = Math.max(1, ...COUNTRIES.map((c) => c.count))

  return (
    <section className="relative bg-black px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em]" style={{ color: GREEN }}>
              Freebuff Live
            </p>
            <h2 className="lp-feature-heading text-white">
              Developers are building right now, everywhere
            </h2>
          </div>
          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <motion.span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: GREEN, boxShadow: `0 0 20px ${GREEN}` }}
                animate={{ opacity: [0.45, 1, 0.45], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              <span className="font-mono text-xs uppercase tracking-[0.22em] text-white/48">
                Active users
              </span>
            </div>
            <div className="mt-2 font-mono text-5xl font-medium leading-none md:text-6xl" style={{ color: GREEN }}>
              {totalLive.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(300px,0.72fr)]">
          <WorldMap />

          <section className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#04100c] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="font-serif text-xl text-white">Top countries</h3>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white/35">
                  Live · last 24h
                </p>
              </div>
              <Globe2 className="h-5 w-5 text-white/30" aria-hidden />
            </div>

            <ol className="flex flex-1 flex-col justify-between gap-y-4">
              {COUNTRIES.map((c, i) => (
                <li key={c.code} className="group">
                  <div className="flex items-center gap-3">
                    <span className="w-4 shrink-0 text-center font-mono text-xs text-white/30">
                      {i + 1}
                    </span>
                    <span className="text-base leading-none">{c.flag}</span>
                    <span className="flex-1 truncate text-sm text-white/85">
                      {c.name}
                    </span>
                    <span
                      className="font-mono text-sm tabular-nums"
                      style={{ color: GREEN }}
                    >
                      {c.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="ml-7 mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${GREEN}, rgba(34,211,238,0.9))`,
                      }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(c.count / maxCountry) * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.7, delay: i * 0.04 }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </section>
  )
}
