import { BaseAutoTopupSettingsForm } from './BaseAutoTopupSettingsForm'
import { ORG_AUTO_TOPUP_CONSTANTS } from '@/hooks/use-org-auto-topup'

const {
  MIN_THRESHOLD_CREDITS,
  MAX_THRESHOLD_CREDITS,
  MIN_TOPUP_CREDITS,
  MAX_TOPUP_DOLLARS,
  CENTS_PER_CREDIT,
} = ORG_AUTO_TOPUP_CONSTANTS

const MAX_TOPUP_CREDITS = (MAX_TOPUP_DOLLARS * 100) / CENTS_PER_CREDIT

interface OrgAutoTopupSettingsFormProps {
  isEnabled: boolean
  threshold: number
  topUpAmountDollars: number
  onThresholdChange: (value: number) => void
  onTopUpAmountChange: (value: number) => void
  isPending: boolean
  canManageAutoTopup: boolean
}

export function OrgAutoTopupSettingsForm({
  isEnabled,
  threshold,
  topUpAmountDollars,
  onThresholdChange,
  onTopUpAmountChange,
  isPending,
  canManageAutoTopup,
}: OrgAutoTopupSettingsFormProps) {
  return (
    <BaseAutoTopupSettingsForm
      isEnabled={isEnabled}
      threshold={threshold}
      topUpAmountDollars={topUpAmountDollars}
      onThresholdChange={onThresholdChange}
      onTopUpAmountChange={onTopUpAmountChange}
      isPending={isPending}
      canManage={canManageAutoTopup}
      constants={{
        MIN_THRESHOLD_CREDITS,
        MAX_THRESHOLD_CREDITS,
        MIN_TOPUP_CREDITS,
        MAX_TOPUP_CREDITS,
        CENTS_PER_CREDIT,
      }}
      entityType="organization"
      permissionMessage="Only organization owners can modify auto top-up settings."
    />
  )
}
