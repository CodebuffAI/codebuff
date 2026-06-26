'use client'

import { api } from '@/convex/_generated/api'
import { useQuery } from 'convex/react'
import { Gauge } from 'lucide-react'

/**
 * Nav-bar indicator shown when the current user is provisioned on the limited
 * (small) sandbox tier. Renders nothing for full-access users. Mobile shows an
 * icon-only chip; the full "Limited sandbox" label appears from `sm` up.
 */
export function LimitedSandboxBadge({ className = '' }: { className?: string }) {
  const webAccessStatus = useQuery(api.webAccess.getWebAccessStatus, {})
  if (webAccessStatus?.accessTier !== 'limited') return null

  return (
    <span
      title="Limited region — your sandbox runs on the smaller tier"
      className={`inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[11px] font-medium text-amber-200 ${className}`}
    >
      <Gauge className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Limited sandbox</span>
    </span>
  )
}
