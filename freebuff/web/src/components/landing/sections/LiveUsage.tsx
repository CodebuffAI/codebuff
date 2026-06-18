'use client'

import { motion } from 'framer-motion'

import { Parallax } from '../Parallax'

import {
  EMPTY_LIVE_STATS,
  countryName,
  useLiveStats,
} from '@/app/live/live-stats-client'

const GREEN = '#54a967'

function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return '🌐'
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)),
  )
}

/**
 * Compact "Freebuff Live" panel: the real active user count plus a small
 * country leaderboard with progress bars. Pulls the same `getFreebuffLiveStats`
 * snapshot used by the /live page (polled client-side every 60s). No world
 * map — kept intentionally minimal so it doesn't lag or take up much room.
 */
export function LiveUsage() {
  const stats = useLiveStats(EMPTY_LIVE_STATS, { refreshOnMount: true })
  const loaded = stats.generatedAt !== EMPTY_LIVE_STATS.generatedAt

  const top = stats.countries
    .filter((c) => c.countryCode !== 'UNKNOWN')
    .slice(0, 5)
  const max = Math.max(1, ...top.map((c) => c.count))

  return (
    <section className="relative bg-black px-6 py-16 md:py-20">
      <Parallax from={-44} to={44} className="mx-auto max-w-xl rounded-2xl bg-white/[0.02] p-6 md:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ background: GREEN }}
              />
              <span
                className="relative inline-flex h-2.5 w-2.5 rounded-full"
                style={{ background: GREEN }}
              />
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/50">
              Live now
            </span>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/35">
            Top countries
          </span>
        </div>

        <div className="mt-6 flex items-end gap-3">
          <span
            className="lp-text-glow-green font-mono text-5xl leading-none md:text-6xl"
            style={{ color: GREEN }}
          >
            {loaded ? stats.totalLiveUsers.toLocaleString() : '—'}
          </span>
          <span className="pb-1 text-sm leading-tight text-white/55">
            developers building
            <br />
            right now
          </span>
        </div>

        <ol className="mt-8 flex flex-col gap-3.5">
          {top.map((c, i) => (
            <li key={c.countryCode}>
              <div className="flex items-center gap-3">
                <span className="text-base leading-none">
                  {flagEmoji(c.countryCode)}
                </span>
                <span className="flex-1 truncate text-sm text-white/85">
                  {countryName(c.countryCode)}
                </span>
                <span
                  className="font-mono text-sm tabular-nums"
                  style={{ color: GREEN }}
                >
                  {c.count.toLocaleString()}
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, #2c7a40, ${GREEN})` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(c.count / max) * 100}%` }}
                  transition={{ duration: 0.7, delay: i * 0.05, ease: 'easeOut' }}
                />
              </div>
            </li>
          ))}
        </ol>

        <a
          href="/live"
          className="mt-7 inline-flex items-center gap-1.5 text-[13px] text-white/45 transition-colors hover:text-white"
        >
          View the live map
          <span aria-hidden>→</span>
        </a>
      </Parallax>
    </section>
  )
}
