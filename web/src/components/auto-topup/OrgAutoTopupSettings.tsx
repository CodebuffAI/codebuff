import { useOrgAutoTopup } from '@/hooks/use-org-auto-topup'
import { OrgAutoTopupSwitch } from './OrgAutoTopupSwitch'
import { OrgAutoTopupSettingsForm } from './OrgAutoTopupSettingsForm'

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

  if (isLoadingSettings) {
    return null
  }

  return (
    <div className="space-y-6">
      <OrgAutoTopupSwitch
        isEnabled={isEnabled}
        onToggle={handleToggleAutoTopup}
        isPending={isPending}
        canManageAutoTopup={canManageAutoTopup}
      />
      
      {/* Add more space between toggle and form */}
      <div className="pt-2">
        <OrgAutoTopupSettingsForm
          isEnabled={isEnabled}
          threshold={threshold}
          topUpAmountDollars={topUpAmountDollars}
          onThresholdChange={handleThresholdChange}
          onTopUpAmountChange={handleTopUpAmountChange}
          isPending={isPending}
          canManageAutoTopup={canManageAutoTopup}
        />
      </div>
    </div>
  )
}
