'use client'

import { useMemo } from 'react'
import type { CSSProperties } from 'react'

type Star = {
  id: number
  style: CSSProperties
}

/**
 * Deterministic PRNG (mulberry32). Using a fixed seed means the server and the
 * client generate the exact same star field, so there's no hydration mismatch
 * while keeping the organic scattered look.
 */
function makeRng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A handful of bright stars, biased to the open upper sky (away from the demo). */
function makeStars(count: number): Star[] {
  const rand = makeRng(0x5eed1234)
  return Array.from({ length: count }, (_, id) => {
    const size = rand() < 0.5 ? 2 : 3
    return {
      id,
      style: {
        left: `${rand() * 100}%`,
        top: `${Math.pow(rand(), 1.5) * 88}%`,
        width: size,
        height: size,
        // CSS custom props consumed by the `lp-twinkle` keyframes
        ['--min' as string]: 0.5,
        ['--max' as string]: 1,
        ['--glow' as string]: `${size + 2}px`,
        ['--dur' as string]: `${3 + rand() * 3}s`,
        ['--delay' as string]: `${rand() * 5}s`,
      },
    }
  })
}

// Several shooting stars on staggered loops. Short, frequent loops mean one is
// streaking most of the time — so scrolling down through the sky always shows
// activity. Pure CSS keyframes keep this effectively free on the compositor.
const SHOOTERS = [
  { top: '8%', left: '6%', dx: 360, dy: 190, dur: 6, delay: 0.5 },
  { top: '14%', left: '52%', dx: 420, dy: 220, dur: 7, delay: 2.2 },
  { top: '22%', left: '78%', dx: 320, dy: 170, dur: 6.5, delay: 4 },
  { top: '30%', left: '20%', dx: 460, dy: 250, dur: 8, delay: 1.4 },
  { top: '38%', left: '64%', dx: 380, dy: 200, dur: 7.5, delay: 3.3 },
  { top: '46%', left: '34%', dx: 300, dy: 160, dur: 6.8, delay: 5 },
]

export function Starfield() {
  const stars = useMemo(() => makeStars(16), [])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((s) => (
        <span key={s.id} className="lp-star" style={s.style} />
      ))}

      {SHOOTERS.map((sh, i) => (
        <span
          key={`shooter-${i}`}
          className="lp-shooting-star"
          style={
            {
              top: sh.top,
              left: sh.left,
              ['--dx' as string]: `${sh.dx}px`,
              ['--dy' as string]: `${sh.dy}px`,
              ['--dur' as string]: `${sh.dur}s`,
              ['--delay' as string]: `${sh.delay}s`,
            } as CSSProperties
          }
        >
          <span
            className="block h-px w-[110px]"
            style={{
              transform: 'rotate(28deg)',
              transformOrigin: 'left center',
              background:
                'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 90%, rgba(255,255,255,1) 100%)',
              boxShadow: '0 0 6px rgba(255,255,255,0.5)',
            }}
          />
        </span>
      ))}
    </div>
  )
}
