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
      {/* Vertical night-sky gradient with green midtones (mirrors the hero). */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#03060a_0%,#060c12_22%,#0c1a1c_46%,#11201d_60%,#0a0f0e_80%,#000000_100%)]" />

      {/* Soft forest-green glow biased to the top, like the landing scene. */}
      <div className="absolute inset-x-0 top-0 h-[60%] bg-[radial-gradient(ellipse_60%_70%_at_50%_-10%,rgba(36,107,55,0.22),transparent_70%)]" />

      {/* Twinkling stars + shooting stars, kept to the open upper sky. */}
      <div className="absolute inset-x-0 top-0 h-[680px]">
        <Starfield />
      </div>
    </div>
  )
})
