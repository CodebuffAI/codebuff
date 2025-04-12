import { useAutoTopup } from '@/hooks/use-auto-topup'
import { AutoTopupSwitch } from './AutoTopupSwitch'
import { AutoTopupSettingsForm } from './AutoTopupSettingsForm'

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

  if (isLoadingProfile) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <AutoTopupSwitch
          isEnabled={isEnabled}
          onToggle={handleToggleAutoTopup}
          isPending={isPending}
          autoTopupBlockedReason={userProfile?.auto_topup_blocked_reason ?? null}
        />
      </div>
      <AutoTopupSettingsForm
        isEnabled={isEnabled}
        threshold={threshold}
        topUpAmountDollars={topUpAmountDollars}
        onThresholdChange={handleThresholdChange}
        onTopUpAmountChange={handleTopUpAmountChange}
        isPending={isPending}
      />
    </div>
  )
}