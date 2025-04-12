import { useAutoTopup } from '@/hooks/use-auto-topup'
import { AutoTopupSettings } from './auto-topup-settings'

export function ConnectedAutoTopupSettings() {
  const {
    isEnabled,
    threshold,
    topUpAmountDollars,
    isLoadingProfile,
    userProfile,
    handleThresholdInputChange,
    handleTopUpAmountInputChange,
    handleToggleAutoTopup,
    isPending,
  } = useAutoTopup()

  if (isLoadingProfile) {
    return null
  }

  return (
    <AutoTopupSettings
      isEnabled={isEnabled}
      onToggle={handleToggleAutoTopup}
      isPending={isPending}
      autoTopupBlockedReason={userProfile?.auto_topup_blocked_reason ?? null}
      threshold={threshold}
      topUpAmountDollars={topUpAmountDollars}
      onThresholdChange={handleThresholdInputChange}
      onTopUpAmountChange={handleTopUpAmountInputChange}
    />
  )
}