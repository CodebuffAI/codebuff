import { useOrgAutoTopup } from '@/hooks/use-org-auto-topup'
import { OrgAutoTopupSwitch } from './OrgAutoTopupSwitch'
import { OrgAutoTopupSettingsForm } from './OrgAutoTopupSettingsForm'
import { BaseAutoTopupSettings } from './BaseAutoTopupSettings'

interface OrgAutoTopupSettingsProps {
  organizationId: string
}

export function OrgAutoTopupSettings({ organizationId }: OrgAutoTopupSettingsProps) {
  const {
    isEnabled,
    threshold,
    topUpAmountDollars,
    isLoadingSettings,
    isPending,
    canManageAutoTopup,
    handleToggleAutoTopup,
    handleThresholdChange,
    handleTopUpAmountChange,
  } = useOrgAutoTopup(organizationId)

  return (
    <BaseAutoTopupSettings
      isLoading={isLoadingSettings}
      switchComponent={
        <OrgAutoTopupSwitch
          isEnabled={isEnabled}
          onToggle={handleToggleAutoTopup}
          isPending={isPending}
          canManageAutoTopup={canManageAutoTopup}
        />
      }
      formComponent={
        <OrgAutoTopupSettingsForm
          isEnabled={isEnabled}
          threshold={threshold}
          topUpAmountDollars={topUpAmountDollars}
          onThresholdChange={handleThresholdChange}
          onTopUpAmountChange={handleTopUpAmountChange}
          isPending={isPending}
          canManageAutoTopup={canManageAutoTopup}
        />
      }
    />
  )
}
