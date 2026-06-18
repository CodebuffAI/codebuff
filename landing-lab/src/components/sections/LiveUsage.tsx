import { motion } from 'framer-motion'

import { Parallax } from '@/components/Parallax'

const GREEN = '#54a967'

// Mock leaderboard for the static prototype. The Next.js app feeds this the
// real `getFreebuffLiveStats()` snapshot (active sessions grouped by country).
const COUNTRIES = [
  { code: 'US', name: 'United States', flag: '🇺🇸', count: 1842 },
  { code: 'IN', name: 'India', flag: '🇮🇳', count: 1203 },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', count: 684 },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', count: 521 },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', count: 447 },
]

/**
 * Compact "Freebuff Live" panel: the active user count plus a small country
 * leaderboard with progress bars. No world map — kept intentionally minimal.
 */
export function LiveUsage() {
  const top = COUNTRIES.slice(0, 5)
  const total = COUNTRIES.reduce((sum, c) => sum + c.count, 0)
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
            className="text-glow-green font-mono text-5xl leading-none md:text-6xl"
            style={{ color: GREEN }}
          >
            {total.toLocaleString()}
          </span>
          <span className="pb-1 text-sm leading-tight text-white/55">
            developers building
            <br />
            right now
          </span>
        </div>

        <ol className="mt-8 flex flex-col gap-3.5">
          {top.map((c, i) => (
            <li key={c.code}>
              <div className="flex items-center gap-3">
                <span className="text-base leading-none">{c.flag}</span>
                <span className="flex-1 truncate text-sm text-white/85">{c.name}</span>
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
                  whileInView={{ width: `${(c.count / max) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: i * 0.05 }}
                />
              </div>
            </li>
          ))}
        </ol>
      </Parallax>
    </section>
  )
}
