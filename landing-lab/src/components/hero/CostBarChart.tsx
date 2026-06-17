import { motion } from 'framer-motion'

import { BrandLogo } from '@/components/BrandLogo'
import type { Competitor, TabId } from '@/lib/competitors'
import { AXIS_TICKS, COMPETITORS_BY_TAB, logWidthPct } from '@/lib/competitors'
import { cn } from '@/lib/utils'

const LABEL_COL = 'w-[140px] sm:w-[180px] lg:w-[200px]'
const TRACK_INSET = 'left-[140px] sm:left-[180px] lg:left-[200px]'

function Row({ c, index, tab }: { c: Competitor; index: number; tab: TabId }) {
  const pct = logWidthPct(c.yearly)

  return (
    <div className="flex items-center">
      <div className={cn('flex shrink-0 items-center gap-3', LABEL_COL)}>
        {c.freebuff ? (
          <img
            src="/freebuff-mark.svg"
            alt="Freebuff"
            width={26}
            height={26}
            draggable={false}
            className="shrink-0"
            style={{ width: 26, height: 26 }}
          />
        ) : (
          <BrandLogo
            name={c.name}
            mark={c.mark}
            slug={c.slug}
            domain={c.domain}
            logo={c.logo}
            size={26}
          />
        )}
        <span
          className={cn(
            'truncate text-sm sm:text-[15px]',
            c.freebuff ? 'font-semibold text-white' : 'text-white/70',
          )}
        >
          {c.name}
        </span>
      </div>

      {/* Bar track */}
      <div className="relative h-9 flex-1 sm:h-11">
        {c.freebuff ? (
          <motion.div
            key={`${tab}-fb`}
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute left-0 top-1/2 h-[22px] w-[3px] -translate-y-1/2 rounded-full bg-forest-bright shadow-[0_0_14px_4px_rgba(84,169,103,0.7)] sm:h-[26px]"
          />
        ) : (
          <motion.div
            key={`${tab}-${c.name}`}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{
              duration: 0.75,
              delay: 0.06 * index,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="absolute left-0 top-1/2 h-[22px] -translate-y-1/2 rounded-l-[3px] rounded-r-[6px] sm:h-[26px]"
            style={{ background: 'linear-gradient(90deg, #f8717126, #ef4444)' }}
          />
        )}

        <motion.span
          key={`${tab}-${c.name}-label`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.06 * index + 0.4 }}
          className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-3 text-sm font-medium tabular-nums sm:text-[15px]"
          style={{ left: c.freebuff ? '3px' : `${pct}%` }}
        >
          {c.freebuff ? (
            <span className="font-semibold text-forest-bright">$0 / yr</span>
          ) : (
            <span className="text-white/60">
              ${c.yearly.toLocaleString()}
              <span className="text-white/30"> / yr</span>
            </span>
          )}
        </motion.span>
      </div>
    </div>
  )
}

export function CostBarChart({
  tab,
  className,
}: {
  tab: TabId
  className?: string
}) {
  const rows = COMPETITORS_BY_TAB[tab]

  return (
    <div
      className={cn(
        // Rounded only on top — the bottom runs deep behind the bushes so the
        // base of the card is always covered no matter the viewport height.
        'relative w-full overflow-hidden rounded-t-[20px] border border-b-0 border-white/[0.08] bg-[#0b0c0e]/95',
        'px-6 pt-7 pb-[42vh] sm:px-9 sm:pt-9 sm:pb-[46vh]',
        'shadow-[0_50px_140px_-25px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.04)_inset]',
        className,
      )}
    >
      <div className="relative">
        {/* Vertical gridlines over the bar-track region only */}
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 right-0',
            TRACK_INSET,
          )}
        >
          {AXIS_TICKS.map((t) => (
            <span
              key={t.value}
              className="absolute top-0 h-full w-px bg-white/[0.05]"
              style={{ left: `${logWidthPct(t.value)}%` }}
            />
          ))}
        </div>

        <div className="relative space-y-3 sm:space-y-4">
          {rows.map((c, i) => (
            <Row key={c.name} c={c} index={i} tab={tab} />
          ))}
        </div>

        {/* Axis tick labels */}
        <div className="relative mt-4 border-t border-white/[0.07] pt-2.5">
          <div className={cn('absolute inset-y-0 right-0', TRACK_INSET)}>
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
    </div>
  )
}
