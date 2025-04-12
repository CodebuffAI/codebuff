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

const {
  MIN_THRESHOLD_CREDITS,
  MAX_THRESHOLD_CREDITS,
  MIN_TOPUP_DOLLARS,
  MAX_TOPUP_DOLLARS,
} = AUTO_TOPUP_CONSTANTS

export function AutoTopupSettingsForm({
  isEnabled,
  threshold,
  topUpAmountDollars,
  onThresholdChange,
  onTopUpAmountChange,
  isPending,
}: AutoTopupSettingsFormProps) {
  if (!isEnabled) return null

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="threshold" className="flex items-center gap-1">
              Low Balance Threshold (Credits)
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    When your balance falls below this credit amount,
                    <br /> we'll automatically top it up.
                    <br />
                    Min: {MIN_THRESHOLD_CREDITS}, Max: {MAX_THRESHOLD_CREDITS}
                  </p>
                </TooltipContent>
              </Tooltip>
            </Label>
            <Input
              id="threshold"
              type="number"
              value={threshold}
              onChange={(e) => onThresholdChange(Number(e.target.value))}
              placeholder={`e.g., ${MIN_THRESHOLD_CREDITS}`}
              min={MIN_THRESHOLD_CREDITS}
              max={MAX_THRESHOLD_CREDITS}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="topUpAmount" className="flex items-center gap-1">
              Top-up Amount ($)
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    The amount in USD to automatically purchase
                    <br /> when your balance is low.
                    <br />
                    Min: ${MIN_TOPUP_DOLLARS.toFixed(2)}, Max: $
                    {MAX_TOPUP_DOLLARS.toFixed(2)}
                  </p>
                </TooltipContent>
              </Tooltip>
            </Label>
            <Input
              id="topUpAmount"
              type="number"
              step="0.01"
              value={topUpAmountDollars}
              onChange={(e) => onTopUpAmountChange(Number(e.target.value))}
              placeholder={`e.g., ${MIN_TOPUP_DOLLARS.toFixed(2)}`}
              min={MIN_TOPUP_DOLLARS}
              max={MAX_TOPUP_DOLLARS}
              disabled={isPending}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}