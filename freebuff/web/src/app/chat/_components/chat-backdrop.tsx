'use client'

import { memo } from 'react'

// NB: `@/components/*` is aliased to vly in this package, so import relatively.
import { Starfield } from '../../../components/landing/Starfield'

/**
 * Ambient backdrop for the chat surface so it matches freebuff.com: the same
 * dark night-sky gradient and twinkling + shooting stars as the landing hero,
 * warmed with a soft forest-green glow up top to echo the brand palette. Sits
 * behind all chat chrome (sidebar/main are translucent so it shows through);
 * purely decorative and non-interactive.
 */
export const ChatBackdrop = memo(function ChatBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* Vertical night-sky gradient (near-flat, only a whisper of green). */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#03060a_0%,#05080c_30%,#070b0e_55%,#050708_78%,#000000_100%)]" />

      {/* Very soft forest-green glow biased to the top, like the landing scene. */}
      <div className="absolute inset-x-0 top-0 h-[55%] bg-[radial-gradient(ellipse_55%_60%_at_50%_-15%,rgba(36,107,55,0.07),transparent_72%)]" />

      {/* Twinkling stars + shooting stars, kept to the open upper sky. */}
      <div className="absolute inset-x-0 top-0 h-[680px] opacity-40">
        <Starfield />
      </div>
    </div>
  )
})
