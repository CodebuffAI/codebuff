'use client'

/**
 * Freebuff Cloud is still in beta, so this small static "beta" pill is shown on
 * the Cloud surfaces (top bar + dashboard brand). Freebuff Web is GA, so its
 * separate {@link BetaBadge} stays a no-op — this one is Cloud-specific.
 */
export function CloudBetaBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none tracking-wide text-primary ${className}`}
    >
      beta
    </span>
  )
}
