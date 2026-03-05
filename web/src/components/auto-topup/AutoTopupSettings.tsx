import { AutoTopupSettingsForm } from './AutoTopupSettingsForm'
import { AutoTopupSwitch } from './AutoTopupSwitch'
import { BaseAutoTopupSettings } from './BaseAutoTopupSettings'

import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
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
    showConfirmDialog,
    confirmDialogBalance,
    confirmEnableAutoTopup,
    cancelEnableAutoTopup,
  } = useAutoTopup()

  return (
    <>
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
      <ConfirmationDialog
        isOpen={showConfirmDialog}
        onClose={cancelEnableAutoTopup}
        onConfirm={confirmEnableAutoTopup}
        title="Enable Auto Top-up?"
        description={`Your current balance (${(confirmDialogBalance ?? 0).toLocaleString()} credits) is below your threshold (${threshold.toLocaleString()} credits). Enabling auto top-up will charge your payment method ~$${topUpAmountDollars.toFixed(2)} on your next usage.`}
        confirmText="Enable Anyway"
      />
    </>
  )
}
