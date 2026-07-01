'use client'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/vly/components/ui/popover'
import {
  getSpecsBySize,
  getSizeDisplayName,
  type SandboxSize,
} from '@/vly/lib/sandbox-specs'
import { formatBytes } from '@/vly/lib/monitoring/monitoring-utils'
import type { SandboxStats } from '@/vly/codebase-utils/codebase/Codebase'
import { useQuery } from '@tanstack/react-query'
import { useAction } from 'convex/react'
import {
  AlertTriangle,
  ArrowUpCircle,
  Cpu,
  HardDrive,
  Loader2,
  MemoryStick,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

/** Disk usage at/above this percent shows the "almost full" warning + upgrade. */
const DISK_WARNING_THRESHOLD = 80

/** Client mirror of the server disk-pressure classifier (see DaytonaCodebase). */
function isDiskPressureText(message: string | null | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return (
    m.includes('no space left') ||
    m.includes('enospc') ||
    m.includes('disk full') ||
    m.includes('out of disk') ||
    m.includes('disk quota') ||
    m.includes('no space') ||
    (m.includes('disk') && m.includes('full'))
  )
}

export function VmStatusPopover({
  projectId,
  sandboxSize,
  statusLabel,
  dotClassName,
  pingClassName,
  connectionErrorMessage,
}: {
  projectId: Id<'project'> | undefined
  sandboxSize: SandboxSize | undefined
  statusLabel: string
  dotClassName: string
  pingClassName?: string
  /** Raw error from the connection/boot path, surfaced verbatim in the popover. */
  connectionErrorMessage?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [upgrading, setUpgrading] = useState(false)

  const getSandboxStats = useAction(api.monitoring.getSandboxStats)
  const upgradeStorage = useAction(api.cloud.storage.upgradeSandboxStorage)

  // Only poll the (relatively heavy) live stats while the popover is open.
  const statsQuery = useQuery<SandboxStats>({
    queryKey: ['vmStatusStats', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('No project ID')
      return (await getSandboxStats({ projectId })) as SandboxStats
    },
    enabled: open && !!projectId,
    refetchInterval: 15000,
    retry: 1,
  })

  const specs = getSpecsBySize(sandboxSize)
  const stats = statsQuery.data
  const disk = stats?.disk
  const diskPercent = disk?.usage_percent ?? null
  // Prefer the VM's real provisioned disk over the static tier spec, which can
  // lag behind snapshot resizes.
  const diskGbLabel = disk?.size_bytes
    ? `${Math.round(disk.size_bytes / 1024 ** 3)} GB`
    : `${specs.disk_gb} GB`
  const nearFull = diskPercent !== null && diskPercent >= DISK_WARNING_THRESHOLD
  // Already at/above the 8GB tier — nothing larger to offer.
  const canUpgrade = sandboxSize !== 'large' && (sandboxSize ?? 'small') !== 'medium'

  const barColor = nearFull
    ? 'bg-red-500'
    : diskPercent !== null && diskPercent >= 60
      ? 'bg-amber-400'
      : 'bg-primary'

  const connError = connectionErrorMessage?.trim() || null
  const connErrorIsDisk = isDiskPressureText(connError)

  const handleUpgrade = async () => {
    if (!projectId || upgrading) return
    try {
      setUpgrading(true)
      await upgradeStorage({ projectId })
      toast.success(
        'Upgrading your VM to 8 GB storage. This can take a minute — the computer will restart.',
      )
      setOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not upgrade VM storage',
      )
    } finally {
      setUpgrading(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Virtual machine: ${statusLabel}`}
          className="relative flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-muted"
        >
          {pingClassName && (
            <span
              className={`absolute h-2.5 w-2.5 rounded-full ${pingClassName} animate-ping`}
            />
          )}
          <span
            className={`relative h-2.5 w-2.5 rounded-full ${dotClassName}`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 p-0 text-popover-foreground"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${dotClassName}`} />
            <span className="text-sm font-semibold">Virtual machine</span>
          </div>
          <span className="text-xs text-muted-foreground">{statusLabel}</span>
        </div>

        <div className="space-y-3 p-3">
          {/* Size / specs */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Size
              </span>
              <span className="text-xs font-semibold">
                {getSizeDisplayName(sandboxSize)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <SpecCell
                icon={<Cpu className="h-3.5 w-3.5" />}
                label="vCPU"
                value={`${specs.vcpu}`}
              />
              <SpecCell
                icon={<MemoryStick className="h-3.5 w-3.5" />}
                label="RAM"
                value={`${specs.ram_gb} GB`}
              />
              <SpecCell
                icon={<HardDrive className="h-3.5 w-3.5" />}
                label="Disk"
                value={diskGbLabel}
              />
            </div>
          </div>

          {/* Live disk usage */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Storage used
              </span>
              <span className="text-xs font-semibold tabular-nums">
                {diskPercent !== null ? `${diskPercent.toFixed(0)}%` : '—'}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                style={{ width: `${Math.min(diskPercent ?? 0, 100)}%` }}
              />
            </div>
            <div className="text-[11px] text-muted-foreground">
              {disk
                ? `${formatBytes(disk.used_bytes)} / ${formatBytes(disk.size_bytes)}`
                : statsQuery.isFetching
                  ? 'Reading usage…'
                  : statsQuery.isError
                    ? 'Usage unavailable (VM may be asleep)'
                    : 'Usage unavailable'}
            </div>
          </div>

          {/* Boot / connection error (surfaced verbatim so users see the real
              sandbox failure, e.g. "no space left on device"). */}
          {connError && (
            <div className="space-y-2 rounded-md border border-red-500/40 bg-red-500/10 p-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                <div className="min-w-0 space-y-1">
                  <p className="text-[11px] font-semibold text-foreground">
                    {connErrorIsDisk
                      ? 'VM ran out of storage'
                      : 'VM connection error'}
                  </p>
                  <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-snug text-muted-foreground">
                    {connError}
                  </p>
                </div>
              </div>
              {connErrorIsDisk && canUpgrade && (
                <button
                  type="button"
                  onClick={handleUpgrade}
                  disabled={upgrading || !projectId}
                  className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {upgrading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowUpCircle className="h-3.5 w-3.5" />
                  )}
                  Increase storage to 8 GB
                </button>
              )}
            </div>
          )}

          {/* Near-full warning + upgrade */}
          {!connError && nearFull && (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p className="text-[11px] leading-snug text-foreground/90">
                  Storage is almost full. Large installs can crash the VM and
                  stop it from starting. {canUpgrade ? 'Increase storage to keep building.' : 'Free up space to keep building.'}
                </p>
              </div>
              {canUpgrade && (
                <button
                  type="button"
                  onClick={handleUpgrade}
                  disabled={upgrading || !projectId}
                  className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {upgrading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowUpCircle className="h-3.5 w-3.5" />
                  )}
                  Increase storage to 8 GB
                </button>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SpecCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md border border-border bg-muted/30 py-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs font-semibold tabular-nums">{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  )
}
