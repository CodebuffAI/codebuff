import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { TooltipProvider } from '@/components/ui/tooltip'

interface BaseAutoTopupSwitchProps {
  isEnabled: boolean
  onToggle: (checked: boolean) => void
  isPending: boolean
  canManage: boolean
  label: string
  blockedReason?: string | null
  permissionMessage?: string
}

export function BaseAutoTopupSwitch({
  isEnabled,
  onToggle,
  isPending,
  canManage,
  label,
  blockedReason,
  permissionMessage,
}: BaseAutoTopupSwitchProps) {
  const isDisabled = Boolean(blockedReason) || isPending || !canManage

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Switch
            id="auto-topup-switch"
            checked={isEnabled}
            onCheckedChange={onToggle}
            disabled={isDisabled}
            aria-describedby={
              blockedReason ? 'auto-topup-blocked-reason' : 
              !canManage ? 'auto-topup-permission-note' : undefined
            }
          />
          <Label htmlFor="auto-topup-switch">{label}</Label>
        </div>
        {blockedReason && !isEnabled && (
          <p 
            id="auto-topup-blocked-reason"
            className="text-sm text-muted-foreground"
          >
            {blockedReason}
          </p>
        )}
        {!canManage && permissionMessage && (
          <p 
            id="auto-topup-permission-note"
            className="text-sm text-muted-foreground"
          >
            {permissionMessage}
          </p>
        )}
      </div>
    </TooltipProvider>
  )
}
