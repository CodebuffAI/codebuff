'use client'

import React from 'react'

/**
 * Canonical Freebuff brand mark.
 *
 * Always renders the boxed favicon (dark rounded square + sparkle + green
 * accent) inside a fixed square so it can never be stretched or cropped into
 * looking like a different logo. Use this everywhere the brand mark appears
 * so the app, the favicon, and the marketing pages stay in lockstep.
 */
export function FreebuffLogo({
  size = 28,
  className = '',
  rounded = 'rounded-lg',
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
        src="/favicon.svg"
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
