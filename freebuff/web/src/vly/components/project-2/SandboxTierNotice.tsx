'use client'

import { api } from '@/convex/_generated/api'
import { useQuery } from 'convex/react'
import { Globe, ArrowUpRight } from 'lucide-react'
import { sandboxSpecsBySize } from '@/vly/lib/sandbox-specs'

export function SandboxTierNotice({
  runtimeSurface,
}: {
  runtimeSurface: 'web' | 'cloud'
}) {
  const accessStatus = useQuery(api.webAccess.getWebAccessStatus, {})

  if (accessStatus?.accessTier !== 'limited') {
    return null
  }

  // Keep the displayed specs in sync with the actual provisioned tiers
  // (sandbox-specs.ts) so this notice never contradicts the resources panel.
  const small = sandboxSpecsBySize.small
  const large = sandboxSpecsBySize.large

  return (
    <div className="mx-2 mt-2 rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 lg:mx-3">
      <div className="flex items-start gap-2">
        <Globe className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex flex-1 flex-wrap items-start gap-x-3 gap-y-1">
          <p className="flex-1">
            <span className="font-medium">Limited region</span> — your sandbox
            runs on {small.vcpu} vCPU / {small.ram_gb} GB RAM.{' '}
            {runtimeSurface === 'cloud'
              ? `Upgrade for ${large.vcpu} vCPU / ${large.ram_gb} GB and priority capacity.`
              : 'Disable VPN/proxy or connect from a full-access region for a standard sandbox.'}
          </p>
          {runtimeSurface === 'cloud' && (
            <a
              href="mailto:support@vly.sh?subject=Sandbox%20upgrade%20request&body=Hi%2C%20I%27d%20like%20to%20upgrade%20my%20cloud%20sandbox%20to%20a%20full%20tier."
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 rounded-md border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 font-medium text-amber-200 transition hover:bg-amber-500/30"
            >
              Upgrade
              <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
