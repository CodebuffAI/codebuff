import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { AUTO_TOPUP_CONSTANTS } from './constants'
import { AutoTopupSettingsFormProps } from './types'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { dollarsToCredits, creditsToDollars } from '@/lib/currency'

const {
  MIN_THRESHOLD_CREDITS,
  MAX_THRESHOLD_CREDITS,
  MIN_TOPUP_DOLLARS,
  MAX_TOPUP_DOLLARS,
  CENTS_PER_CREDIT,
} = AUTO_TOPUP_CONSTANTS

// Define min/max credits based on dollar limits
const MIN_TOPUP_CREDITS = dollarsToCredits(MIN_TOPUP_DOLLARS, CENTS_PER_CREDIT)
const MAX_TOPUP_CREDITS = dollarsToCredits(MAX_TOPUP_DOLLARS, CENTS_PER_CREDIT)

export function AutoTopupSettingsForm({
  isEnabled,
  threshold,
  topUpAmountDollars,
  onThresholdChange,
  onTopUpAmountChange,
  isPending,
}: AutoTopupSettingsFormProps) {
  const [thresholdError, setThresholdError] = useState<string>('')
  const [topUpCreditsError, setTopUpCreditsError] = useState<string>('')

  // Convert dollar amount to credits for display
  const topUpAmountCredits = dollarsToCredits(topUpAmountDollars, CENTS_PER_CREDIT)

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
            <Label htmlFor="threshold" className="flex items-center gap-1">
              Low Balance Threshold
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    When your balance falls below this credit amount,
                    <br /> we'll automatically top it up.
                    <br />
                    Min: {MIN_THRESHOLD_CREDITS.toLocaleString()}, Max:{' '}
                    {MAX_THRESHOLD_CREDITS.toLocaleString()}
                  </p>
                </TooltipContent>
              </Tooltip>
            </Label>
            <Input
              id="threshold"
              type="number"
              value={threshold}
              onChange={(e) => onThresholdChange(Number(e.target.value))}
              placeholder={`e.g., ${MIN_THRESHOLD_CREDITS.toLocaleString()}`}
              className={cn(thresholdError && 'border-destructive')}
              disabled={isPending}
            />
            {thresholdError && (
              <p className="text-xs text-destructive mt-1 pl-1">
                {thresholdError}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="topUpAmount" className="flex items-center gap-1">
              Top-up Amount
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    The amount of credits to automatically purchase
                    <br /> when your balance is low.
                    <br />
                    Min: {MIN_TOPUP_CREDITS.toLocaleString()}, Max:{' '}
                    {MAX_TOPUP_CREDITS.toLocaleString()}
                  </p>
                </TooltipContent>
              </Tooltip>
            </Label>
            <Input
              id="topUpAmount"
              type="number"
              value={topUpAmountCredits}
              onChange={(e) => handleTopUpCreditsChange(Number(e.target.value))}
              placeholder={`e.g., ${MIN_TOPUP_CREDITS.toLocaleString()}`}
              className={cn(topUpCreditsError && 'border-destructive')}
              disabled={isPending}
            />
            {topUpCreditsError ? (
              <p className="text-xs text-destructive mt-1 pl-1">
                {topUpCreditsError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1 pl-1">
                ${creditsToDollars(topUpAmountCredits, CENTS_PER_CREDIT)}
              </p>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
