'use client'

import React from 'react'

/**
 * Canonical Freebuff brand mark.
 *
 * Renders the square boxed logo PNG (dark square + sparkle + green dash) at
 * its natural shape. The PNG ships with its own subtle corner radius so the
 * wrapper does not add additional rounding by default. Use this everywhere
 * the brand mark appears so the app, the favicon, and the marketing pages
 * stay in lockstep.
 */
export function FreebuffLogo({
  size = 28,
  className = '',
  rounded = '',
}: {
  size?: number
  className?: string
  rounded?: string
}) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center overflow-hidden ${rounded} ${className}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-icon.png"
        alt="Freebuff"
        width={size}
        height={size}
        className="h-full w-full object-contain"
        draggable={false}
      />
    </span>
  )
}

export default FreebuffLogo
