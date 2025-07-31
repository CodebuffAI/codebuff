import { AutoTopupSettingsForm } from './AutoTopupSettingsForm'
import { AutoTopupSwitch } from './AutoTopupSwitch'
import { BaseAutoTopupSettings } from './BaseAutoTopupSettings'

import { useAutoTopup } from '@/hooks/use-auto-topup'

export function AutoTopupSettings() {
  const {
    isEnabled,
    threshold,
    topUpAmountDollars,
    isLoadingProfile,
    isPending,
    userProfile,
    handleToggleAutoTopup,
    handleThresholdChange,
    handleTopUpAmountChange,
  } = useAutoTopup()

  return (
    <BaseAutoTopupSettings
      isLoading={isLoadingProfile}
      switchComponent={
        <AutoTopupSwitch
          isEnabled={isEnabled}
          onToggle={handleToggleAutoTopup}
          isPending={isPending}
          autoTopupBlockedReason={
            userProfile?.auto_topup_blocked_reason ?? null
          }
        />
      }
      formComponent={
        <AutoTopupSettingsForm
          isEnabled={isEnabled}
          threshold={threshold}
          topUpAmountDollars={topUpAmountDollars}
          onThresholdChange={handleThresholdChange}
          onTopUpAmountChange={handleTopUpAmountChange}
          isPending={isPending}
        />
      }
    />
  )
}
