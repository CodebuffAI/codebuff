import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { TooltipProvider } from '@/components/ui/tooltip'

interface OrgAutoTopupSwitchProps {
  isEnabled: boolean
  onToggle: (checked: boolean) => void
  isPending: boolean
  canManageAutoTopup: boolean
}

export function OrgAutoTopupSwitch({
  isEnabled,
  onToggle,
  isPending,
  canManageAutoTopup,
}: OrgAutoTopupSwitchProps) {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Switch
            id="org-auto-topup-switch"
            checked={isEnabled}
            onCheckedChange={onToggle}
            disabled={!canManageAutoTopup || isPending}
            aria-describedby={
              !canManageAutoTopup ? 'org-auto-topup-permission-note' : undefined
            }
          />
          <Label htmlFor="org-auto-topup-switch">Organization Auto Top-up</Label>
        </div>
        {!canManageAutoTopup && (
          <p 
            id="org-auto-topup-permission-note"
            className="text-sm text-muted-foreground"
          >
            Only organization owners can manage auto top-up settings.
          </p>
        )}
      </div>
    </TooltipProvider>
  )
}
