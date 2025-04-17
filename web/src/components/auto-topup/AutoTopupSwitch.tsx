import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AutoTopupSwitchProps } from './types'

export function AutoTopupSwitch({
  isEnabled,
  onToggle,
  isPending,
  autoTopupBlockedReason,
}: AutoTopupSwitchProps) {
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