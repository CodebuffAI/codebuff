import React from 'react'

/**
 * Subtle "Beta" badge for Freebuff Web. Sits next to the logo / product name
 * to signal the app is still in beta without drawing too much attention.
 */
export function BetaBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-primary ${className}`}
    >
      Beta
    </span>
  )
}

export default BetaBadge
