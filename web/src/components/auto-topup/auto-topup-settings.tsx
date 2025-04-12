import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const MIN_THRESHOLD_CREDITS = 100
const MAX_THRESHOLD_CREDITS = 10000
const MIN_TOPUP_DOLLARS = 5.0
const MAX_TOPUP_DOLLARS = 100.0

const AutoTopupSwitch = ({
  isEnabled,
  onToggle,
  isPending,
  autoTopupBlockedReason,
}: {
  isEnabled: boolean
  onToggle: (checked: boolean) => void
  isPending: boolean
  autoTopupBlockedReason: string | null
}) => {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Switch
            id="auto-topup-switch"
            checked={isEnabled}
            onCheckedChange={onToggle}
            disabled={Boolean(autoTopupBlockedReason) || isPending}
            aria-describedby={
              autoTopupBlockedReason ? 'auto-topup-blocked-reason' : undefined
            }
          />
          <Label htmlFor="auto-topup-switch">Auto Top-up</Label>
        </div>
        {autoTopupBlockedReason && !isEnabled && (
          <p className="text-sm text-muted-foreground">
            {autoTopupBlockedReason}
          </p>
        )}
      </div>
    </TooltipProvider>
  )
}

const AutoTopupSettingsSection = ({
  isEnabled,
  threshold,
  topUpAmountDollars,
  onThresholdChange,
  onTopUpAmountChange,
  isPending,
}: {
  isEnabled: boolean
  threshold: number
  topUpAmountDollars: number
  onThresholdChange: (value: number) => void
  onTopUpAmountChange: (value: number) => void
  isPending: boolean
}) => (
  <TooltipProvider>
    <div className="space-y-4">
      {isEnabled && (
        <>
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
              />
            </div>
          </div>
        </>
      )}
    </div>
  </TooltipProvider>
)

export function AutoTopupSettings({
  isEnabled,
  onToggle,
  isPending,
  autoTopupBlockedReason,
  threshold,
  topUpAmountDollars,
  onThresholdChange,
  onTopUpAmountChange,
}: {
  isEnabled: boolean
  onToggle: (checked: boolean) => void
  isPending: boolean
  autoTopupBlockedReason: string | null
  threshold: number
  topUpAmountDollars: number
  onThresholdChange: (value: number) => void
  onTopUpAmountChange: (value: number) => void
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <AutoTopupSwitch
          isEnabled={isEnabled}
          onToggle={onToggle}
          isPending={isPending}
          autoTopupBlockedReason={autoTopupBlockedReason}
        />
      </div>
      {isEnabled && (
        <AutoTopupSettingsSection
          isEnabled={isEnabled}
          threshold={threshold}
          topUpAmountDollars={topUpAmountDollars}
          onThresholdChange={onThresholdChange}
          onTopUpAmountChange={onTopUpAmountChange}
          isPending={isPending}
        />
      )}
    </div>
  )
}