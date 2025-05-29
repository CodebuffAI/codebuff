import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ORG_AUTO_TOPUP_CONSTANTS } from '@/hooks/use-org-auto-topup'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const {
  MIN_THRESHOLD_CREDITS,
  MAX_THRESHOLD_CREDITS,
  MIN_TOPUP_CREDITS,
  MAX_TOPUP_DOLLARS,
  CENTS_PER_CREDIT,
} = ORG_AUTO_TOPUP_CONSTANTS

const MIN_TOPUP_DOLLARS = (MIN_TOPUP_CREDITS * CENTS_PER_CREDIT) / 100
const MAX_TOPUP_CREDITS = (MAX_TOPUP_DOLLARS * 100) / CENTS_PER_CREDIT

interface OrgAutoTopupSettingsFormProps {
  isEnabled: boolean
  threshold: number
  topUpAmountDollars: number
  onThresholdChange: (value: number) => void
  onTopUpAmountChange: (value: number) => void
  isPending: boolean
  canManageAutoTopup: boolean
}

export function OrgAutoTopupSettingsForm({
  isEnabled,
  threshold,
  topUpAmountDollars,
  onThresholdChange,
  onTopUpAmountChange,
  isPending,
  canManageAutoTopup,
}: OrgAutoTopupSettingsFormProps) {
  const [thresholdError, setThresholdError] = useState<string>('')
  const [topUpCreditsError, setTopUpCreditsError] = useState<string>('')

  // Convert dollar amount to credits for display
  const topUpAmountCredits = Math.round((topUpAmountDollars * 100) / CENTS_PER_CREDIT)

  // Check threshold limits
  useEffect(() => {
    if (threshold < MIN_THRESHOLD_CREDITS) {
      setThresholdError(
        `Minimum ${MIN_THRESHOLD_CREDITS.toLocaleString()} credits`
      )
    } else if (threshold > MAX_THRESHOLD_CREDITS) {
      setThresholdError(
        `Maximum ${MAX_THRESHOLD_CREDITS.toLocaleString()} credits`
      )
    } else {
      setThresholdError('')
    }
  }, [threshold])

  // Check top-up credit limits
  useEffect(() => {
    if (topUpAmountCredits < MIN_TOPUP_CREDITS) {
      setTopUpCreditsError(
        `Minimum ${MIN_TOPUP_CREDITS.toLocaleString()} credits`
      )
    } else if (topUpAmountCredits > MAX_TOPUP_CREDITS) {
      setTopUpCreditsError(
        `Maximum ${MAX_TOPUP_CREDITS.toLocaleString()} credits`
      )
    } else {
      setTopUpCreditsError('')
    }
  }, [topUpAmountCredits])

  // Handle credits input change by converting to dollars
  const handleTopUpCreditsChange = (credits: number) => {
    const dollars = Number(((credits * CENTS_PER_CREDIT) / 100).toFixed(2))
    onTopUpAmountChange(dollars)
  }

  if (!isEnabled) return null

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="org-threshold" className="flex items-center gap-1">
              Low Balance Threshold
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    When the organization balance falls below this credit amount,
                    <br /> we'll automatically top it up.
                    <br />
                    Min: {MIN_THRESHOLD_CREDITS.toLocaleString()}, Max:{' '}
                    {MAX_THRESHOLD_CREDITS.toLocaleString()}
                  </p>
                </TooltipContent>
              </Tooltip>
            </Label>
            <Input
              id="org-threshold"
              type="number"
              value={threshold}
              onChange={(e) => onThresholdChange(Number(e.target.value))}
              placeholder={`e.g., ${MIN_THRESHOLD_CREDITS.toLocaleString()}`}
              className={cn(thresholdError && 'border-destructive')}
              disabled={isPending || !canManageAutoTopup}
            />
            {thresholdError && (
              <p className="text-xs text-destructive mt-1 pl-1">
                {thresholdError}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-topUpAmount" className="flex items-center gap-1">
              Top-up Amount
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    The amount of credits to automatically purchase
                    <br /> when the organization balance is low.
                    <br />
                    Min: {MIN_TOPUP_CREDITS.toLocaleString()}, Max:{' '}
                    {MAX_TOPUP_CREDITS.toLocaleString()}
                  </p>
                </TooltipContent>
              </Tooltip>
            </Label>
            <Input
              id="org-topUpAmount"
              type="number"
              value={topUpAmountCredits}
              onChange={(e) => handleTopUpCreditsChange(Number(e.target.value))}
              placeholder={`e.g., ${MIN_TOPUP_CREDITS.toLocaleString()}`}
              className={cn(topUpCreditsError && 'border-destructive')}
              disabled={isPending || !canManageAutoTopup}
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
        {!canManageAutoTopup && (
          <p className="text-sm text-muted-foreground">
            Only organization owners can modify auto top-up settings.
          </p>
        )}
      </div>
    </TooltipProvider>
  )
}
