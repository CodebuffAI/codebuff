import { BaseAutoTopupSwitch } from './BaseAutoTopupSwitch'

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
    <BaseAutoTopupSwitch
      isEnabled={isEnabled}
      onToggle={onToggle}
      isPending={isPending}
      canManage={canManageAutoTopup}
      label="Organization Auto Top-up"
      permissionMessage="Only organization owners can manage auto top-up settings."
    />
  )
}
