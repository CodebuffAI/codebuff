'use client'

import { motion } from 'framer-motion'

import { BrandLogo } from '../BrandLogo'
import { AXIS_TICKS, logWidthPct, type Competitor } from '../lib/competitors'

import { cn } from '@/lib/utils'

/**
 * Horizontal log-scale bar chart comparing Freebuff's $0 to a set of paid
 * competitors' projected yearly cost. Shared by every product landing
 * section (Web, Cloud, ...) that runs the "why pay $X/yr" argument — only
 * the `competitors` list changes.
 */
export function CostChart({ competitors }: { competitors: Competitor[] }) {
  return (
    <div className="relative">
      {/* Gridlines */}
      <div className="pointer-events-none absolute inset-y-0 right-0 left-[112px] sm:left-[180px]">
        {AXIS_TICKS.map((t) => (
          <span
            key={t.value}
            className="absolute top-0 h-full w-px bg-white/[0.05]"
            style={{ left: `${logWidthPct(t.value)}%` }}
          />
        ))}
      </div>

      <div className="relative space-y-3 sm:space-y-4">
        {competitors.map((c, i) => (
          <ChartRow key={c.name} c={c} index={i} />
        ))}
      </div>

      {/* Axis labels */}
      <div className="relative mt-4 border-t border-white/[0.07] pt-2.5">
        <div className="absolute inset-y-0 right-0 left-[112px] sm:left-[180px]">
          {AXIS_TICKS.map((t) => (
            <span
              key={t.value}
              className="absolute top-2.5 -translate-x-1/2 whitespace-nowrap text-[11px] tabular-nums text-white/30"
              style={{ left: `${logWidthPct(t.value)}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChartRow({ c, index }: { c: Competitor; index: number }) {
  const pct = logWidthPct(c.yearly)

  return (
    <div className="flex items-center">
      <div className="flex w-[112px] shrink-0 items-center gap-2 sm:w-[180px] sm:gap-3">
        {c.freebuff ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/logo-icon.png"
            alt="Freebuff"
            width={24}
            height={24}
            draggable={false}
            className="shrink-0 rounded-[5px]"
            style={{ width: 24, height: 24 }}
          />
        ) : (
          <BrandLogo
            name={c.name}
            mark={c.mark}
            slug={c.slug}
            domain={c.domain}
            logo={c.logo}
            size={24}
          />
        )}
        <span
          className={cn(
            'truncate text-[12.5px] sm:text-[15px]',
            c.freebuff ? 'font-normal text-white' : 'text-white/70',
          )}
        >
          {c.name}
        </span>
      </div>

      <div className="relative h-9 flex-1 sm:h-11">
        {c.freebuff ? (
          <motion.div
            initial={{ opacity: 0, scaleY: 0 }}
            whileInView={{ opacity: 1, scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute left-0 top-1/2 h-[22px] w-[3px] -translate-y-1/2 rounded-full bg-forest-bright shadow-[0_0_14px_4px_rgba(84,169,103,0.7)] sm:h-[26px]"
          />
        ) : (
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: `${pct}%` }}
            viewport={{ once: true }}
            transition={{
              duration: 0.75,
              delay: 0.06 * index,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="absolute left-0 top-1/2 h-[22px] -translate-y-1/2 rounded-l-[3px] rounded-r-[6px] sm:h-[26px]"
            style={{ background: 'linear-gradient(90deg, #f8717126, #ef4444)' }}
          />
        )}

        <span
          className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-2 text-[12px] font-normal tabular-nums sm:pl-3 sm:text-[15px]"
          style={{ left: c.freebuff ? '3px' : `${pct}%` }}
        >
          {c.freebuff ? (
            <span className="font-normal text-forest-bright">$0 / yr</span>
          ) : (
            <span className="text-white/60">
              ${c.yearly.toLocaleString()}
              <span className="text-white/30"> / yr</span>
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

export default CostChart
