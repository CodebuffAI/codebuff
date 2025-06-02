import { BaseAutoTopupSwitch } from './BaseAutoTopupSwitch'
import { AutoTopupSwitchProps } from './types'

export function AutoTopupSwitch({
  isEnabled,
  onToggle,
  isPending,
  autoTopupBlockedReason,
}: AutoTopupSwitchProps) {
  return (
    <BaseAutoTopupSwitch
      isEnabled={isEnabled}
      onToggle={onToggle}
      isPending={isPending}
      canManage={true} // Users can always manage their own settings
      label="Auto Top-up"
      blockedReason={autoTopupBlockedReason}
    />
  )
}