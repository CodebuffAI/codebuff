'use client'

import { api } from '@/convex/_generated/api'
import { useQuery } from 'convex/react'
import { Globe } from 'lucide-react'

export function SandboxTierNotice({
  runtimeSurface,
}: {
  runtimeSurface: 'web' | 'cloud'
}) {
  const accessStatus = useQuery(api.webAccess.getWebAccessStatus, {})

  if (accessStatus?.accessTier !== 'limited') {
    return null
  }

  return (
    <div className="mx-2 mt-2 rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 lg:mx-3">
      <div className="flex items-start gap-2">
        <Globe className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Limited region mode is active. This{' '}
          {runtimeSurface === 'cloud' ? 'cloud workspace' : 'workspace'} uses a
          smaller sandbox tier to keep capacity available. Disable VPN/proxy or
          connect from a full-access region for standard sandbox size.
        </p>
      </div>
    </div>
  )
}
