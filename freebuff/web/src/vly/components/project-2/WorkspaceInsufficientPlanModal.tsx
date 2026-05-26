'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/vly/components/ui/dialog'
import { Button } from '@/vly/components/ui/button'
import {
  AlertTriangle,
  ArrowUp,
  Check,
  Cpu,
  MemoryStick,
  HardDrive,
  RefreshCw,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { SandboxSize } from '@/vly/lib/sandbox-specs'
import type { AutumnCustomer } from '@/vly/lib/billing/types'
import {
  getAvailableDowngradeTiers,
  getAutoDowngradeTier,
} from '@/vly/lib/billing/workspace-quota-utils'
import { DAYTONA_SNAPSHOTS } from '@/vly/config/daytona-snapshots'
import { getSizeDisplayName } from '@/vly/lib/sandbox-specs'

interface WorkspaceInsufficientPlanModalProps {
  open: boolean
  projectName: string
  currentWorkspaceSize: SandboxSize
  customer: AutumnCustomer | null | undefined
  onDowngrade: (targetSize: SandboxSize) => Promise<void>
}

export function WorkspaceInsufficientPlanModal({
  open,
  projectName,
  currentWorkspaceSize,
  customer,
  onDowngrade,
}: WorkspaceInsufficientPlanModalProps) {
  const router = useRouter()
  const [isDowngrading, setIsDowngrading] = useState(false)
  const [showManualSelection, setShowManualSelection] = useState(false)
  const [selectedTier, setSelectedTier] = useState<SandboxSize | null>(null)

  const autoDowngradeTier = getAutoDowngradeTier(customer)
  const availableTiers = getAvailableDowngradeTiers(
    currentWorkspaceSize,
    customer,
  )

  const handleAutoDowngrade = async () => {
    setIsDowngrading(true)
    try {
      await onDowngrade(autoDowngradeTier)
    } catch (error) {
      console.error('Failed to auto-downgrade:', error)
      setIsDowngrading(false)
    }
  }

  const handleManualDowngrade = async () => {
    if (!selectedTier) return
    setIsDowngrading(true)
    try {
      await onDowngrade(selectedTier)
    } catch (error) {
      console.error('Failed to downgrade:', error)
      setIsDowngrading(false)
    }
  }

  const currentSnapshot = DAYTONA_SNAPSHOTS.find(
    (s) => s.tier === currentWorkspaceSize,
  )
  const autoDowngradeSnapshot = DAYTONA_SNAPSHOTS.find(
    (s) => s.tier === autoDowngradeTier,
  )

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-2xl [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="py-4">
          {/* Header */}
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-red-100 p-4">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </div>

          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              Workspace Access Restricted
            </DialogTitle>
            <DialogDescription className="mt-2 text-center">
              This {getSizeDisplayName(currentWorkspaceSize)} workspace requires
              a higher plan tier to access.
            </DialogDescription>
          </DialogHeader>

          {/* Project Info */}
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-700">
              Project: {projectName}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="font-medium">Current Workspace:</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800">
                {getSizeDisplayName(currentWorkspaceSize)}
              </span>
              {currentSnapshot && (
                <span className="text-xs text-slate-500">
                  ({currentSnapshot.specs.cpu} CPU, {currentSnapshot.specs.ram}{' '}
                  RAM, {currentSnapshot.specs.disk} Disk)
                </span>
              )}
            </div>
          </div>

          {/* Warning */}
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">
              Your current plan doesn't include{' '}
              {getSizeDisplayName(currentWorkspaceSize)} workspaces. To access
              this project, you need to either upgrade your plan or downgrade
              the workspace.
            </p>
          </div>

          {/* Action Options */}
          <div className="mt-6 space-y-4">
            {/* Option 1: Upgrade Plan */}
            <div className="rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-purple-100 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <ArrowUp className="h-5 w-5 text-purple-600" />
                    <h3 className="text-base font-semibold text-purple-900">
                      Upgrade Your Plan
                    </h3>
                  </div>
                  <p className="mt-2 text-sm text-purple-800">
                    Keep your {getSizeDisplayName(currentWorkspaceSize)}{' '}
                    workspace and upgrade your billing plan to access it. This
                    is the recommended option if you need the extra resources.
                  </p>
                </div>
                <Button
                  onClick={() => router.push('/web/dashboard')}
                  className="ml-4 shrink-0 bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700"
                  disabled={isDowngrading}
                >
                  <ArrowUp className="mr-2 h-4 w-4" />
                  View Plans
                </Button>
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-sm font-medium text-slate-500">OR</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {/* Option 2: Downgrade Workspace */}
            <div className="rounded-lg border border-orange-200 bg-gradient-to-r from-orange-50 to-orange-100 p-4">
              <div className="mb-3 flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-orange-600" />
                <h3 className="text-base font-semibold text-orange-900">
                  Downgrade Workspace
                </h3>
              </div>

              <p className="mb-4 text-sm text-orange-800">
                Reduce your workspace tier to one supported by your current
                plan.
              </p>

              {/* Auto-downgrade option */}
              {autoDowngradeSnapshot && (
                <div className="mb-3 rounded-lg border border-orange-300 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-orange-900">
                        Quick Downgrade to{' '}
                        {getSizeDisplayName(autoDowngradeTier)}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-orange-700">
                        <span className="flex items-center gap-1">
                          <Cpu className="h-3 w-3" />
                          {autoDowngradeSnapshot.specs.cpu}
                        </span>
                        <span className="flex items-center gap-1">
                          <MemoryStick className="h-3 w-3" />
                          {autoDowngradeSnapshot.specs.ram}
                        </span>
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          {autoDowngradeSnapshot.specs.disk}
                        </span>
                      </div>
                    </div>
                    <Button
                      onClick={handleAutoDowngrade}
                      disabled={isDowngrading}
                      size="sm"
                      className="ml-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700"
                    >
                      {isDowngrading ? (
                        <>
                          <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                          Downgrading...
                        </>
                      ) : (
                        'Downgrade Now'
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Manual selection toggle */}
              {availableTiers.length > 1 && (
                <button
                  onClick={() => setShowManualSelection(!showManualSelection)}
                  className="text-sm font-medium text-orange-700 underline hover:text-orange-800"
                  disabled={isDowngrading}
                >
                  {showManualSelection ? 'Hide' : 'Choose a different tier'}
                </button>
              )}

              {/* Manual tier selection */}
              {showManualSelection && availableTiers.length > 1 && (
                <div className="mt-3 space-y-2">
                  {availableTiers.map((tier) => {
                    const snapshot = DAYTONA_SNAPSHOTS.find(
                      (s) => s.tier === tier.size,
                    )
                    if (!snapshot) return null

                    return (
                      <button
                        key={tier.size}
                        onClick={() => setSelectedTier(tier.size)}
                        disabled={isDowngrading}
                        className={`w-full rounded-lg border p-3 text-left transition-all ${
                          selectedTier === tier.size
                            ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-500'
                            : 'border-orange-200 bg-white hover:border-orange-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900">
                                {snapshot.name}
                              </span>
                              {selectedTier === tier.size && (
                                <Check className="h-4 w-4 text-orange-600" />
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-xs text-slate-600">
                              <span className="flex items-center gap-1">
                                <Cpu className="h-3 w-3" />
                                {snapshot.specs.cpu}
                              </span>
                              <span className="flex items-center gap-1">
                                <MemoryStick className="h-3 w-3" />
                                {snapshot.specs.ram}
                              </span>
                              <span className="flex items-center gap-1">
                                <HardDrive className="h-3 w-3" />
                                {snapshot.specs.disk}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                  <Button
                    onClick={handleManualDowngrade}
                    disabled={!selectedTier || isDowngrading}
                    className="mt-2 w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700"
                  >
                    {isDowngrading ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Downgrading...
                      </>
                    ) : (
                      <>
                        Downgrade to{' '}
                        {selectedTier && getSizeDisplayName(selectedTier)}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Help Text */}
          <p className="mt-6 text-center text-xs text-slate-500">
            Need help? Contact support or visit our{' '}
            <a href="/web/contact" className="text-purple-600 hover:underline">
              help center
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
