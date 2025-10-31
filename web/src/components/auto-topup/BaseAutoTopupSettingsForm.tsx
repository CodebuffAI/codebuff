import { pluralize } from '@codebuff/common/util/string'
import { Info } from 'lucide-react'
import { useState, useEffect } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface AutoTopupConstants {
  MIN_THRESHOLD_CREDITS: number
  MAX_THRESHOLD_CREDITS: number
  MIN_TOPUP_CREDITS: number
  MAX_TOPUP_CREDITS: number
  CENTS_PER_CREDIT: number
}

interface BaseAutoTopupSettingsFormProps {
  isEnabled: boolean
  threshold: number
  topUpAmountDollars: number
  onThresholdChange: (value: number) => void
  onTopUpAmountChange: (value: number) => void
  isPending: boolean
  canManage: boolean
  constants: AutoTopupConstants
  entityType: 'user' | 'organization'
  permissionMessage?: string
}

export function BaseAutoTopupSettingsForm({
  isEnabled,
  threshold,
  topUpAmountDollars,
  onThresholdChange,
  onTopUpAmountChange,
  isPending,
  canManage,
  constants,
  entityType,
  permissionMessage,
}: BaseAutoTopupSettingsFormProps) {
  const [thresholdError, setThresholdError] = useState<string>('')
  const [topUpCreditsError, setTopUpCreditsError] = useState<string>('')

  const {
    MIN_THRESHOLD_CREDITS,
    MAX_THRESHOLD_CREDITS,
    MIN_TOPUP_CREDITS,
    MAX_TOPUP_CREDITS,
    CENTS_PER_CREDIT,
  } = constants

  // Convert dollar amount to credits for display
  const topUpAmountCredits = Math.round(
    (topUpAmountDollars * 100) / CENTS_PER_CREDIT,
  )

  // Check threshold limits
  useEffect(() => {
    if (threshold < MIN_THRESHOLD_CREDITS) {
      setThresholdError(`Minimum ${pluralize(MIN_THRESHOLD_CREDITS, 'credit')}`)
    } else if (threshold > MAX_THRESHOLD_CREDITS) {
      setThresholdError(`Maximum ${pluralize(MAX_THRESHOLD_CREDITS, 'credit')}`)
    } else {
      setThresholdError('')
    }
  }, [threshold, MIN_THRESHOLD_CREDITS, MAX_THRESHOLD_CREDITS])

  // Check top-up credit limits
  useEffect(() => {
    if (topUpAmountCredits < MIN_TOPUP_CREDITS) {
      setTopUpCreditsError(`Minimum ${pluralize(MIN_TOPUP_CREDITS, 'credit')}`)
    } else if (topUpAmountCredits > MAX_TOPUP_CREDITS) {
      setTopUpCreditsError(`Maximum ${pluralize(MAX_TOPUP_CREDITS, 'credit')}`)
    } else {
      setTopUpCreditsError('')
    }
  }, [topUpAmountCredits, MIN_TOPUP_CREDITS, MAX_TOPUP_CREDITS])

  // Handle credits input change by converting to dollars
  const handleTopUpCreditsChange = (credits: number) => {
    const dollars = Number(((credits * CENTS_PER_CREDIT) / 100).toFixed(2))
    onTopUpAmountChange(dollars)
  }

  if (!isEnabled) return null

  const balanceText =
    entityType === 'organization'
      ? 'the organization balance falls below this credit amount'
      : 'your balance falls below this credit amount'

  const topUpText =
    entityType === 'organization'
      ? 'when the organization balance is low'
      : 'when your balance is low'

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <Label
              htmlFor={`${entityType}-threshold`}
              className="flex items-center gap-1"
            >
              Low Balance Threshold
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    When {balanceText},
                    <br /> we'll automatically top it up.
                    <br />
                    Min: {MIN_THRESHOLD_CREDITS.toLocaleString()}, Max:{' '}
                    {MAX_THRESHOLD_CREDITS.toLocaleString()}
                  </p>
                </TooltipContent>
              </Tooltip>
            </Label>
            <Input
              id={`${entityType}-threshold`}
              type="number"
              value={threshold}
              onChange={(e) => onThresholdChange(Number(e.target.value))}
              placeholder={`e.g., ${MIN_THRESHOLD_CREDITS.toLocaleString()}`}
              className={cn(thresholdError && 'border-destructive')}
              disabled={isPending || !canManage}
            />
            {thresholdError && (
              <p className="text-xs text-destructive mt-1 pl-1">
                {thresholdError}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label
              htmlFor={`${entityType}-topUpAmount`}
              className="flex items-center gap-1"
            >
              Top-up Amount
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    The amount of credits to automatically purchase
                    <br /> {topUpText}.
                    <br />
                    Min: {MIN_TOPUP_CREDITS.toLocaleString()}, Max:{' '}
                    {MAX_TOPUP_CREDITS.toLocaleString()}
                  </p>
                </TooltipContent>
              </Tooltip>
            </Label>
            <Input
              id={`${entityType}-topUpAmount`}
              type="number"
              value={topUpAmountCredits}
              onChange={(e) => handleTopUpCreditsChange(Number(e.target.value))}
              placeholder={`e.g., ${MIN_TOPUP_CREDITS.toLocaleString()}`}
              className={cn(topUpCreditsError && 'border-destructive')}
              disabled={isPending || !canManage}
            />
            {topUpCreditsError ? (
              <p className="text-xs text-destructive mt-1 pl-1">
                {topUpCreditsError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1 pl-1">
                ${topUpAmountDollars.toFixed(2)}
              </p>
            )}
          </div>
        </div>
        {!canManage && permissionMessage && (
          <p className="text-sm text-muted-foreground">{permissionMessage}</p>
        )}
      </div>
    </TooltipProvider>
  )
}
