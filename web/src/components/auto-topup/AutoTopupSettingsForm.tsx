import { BaseAutoTopupSettingsForm } from './BaseAutoTopupSettingsForm'
import { AUTO_TOPUP_CONSTANTS } from './constants'
import { AutoTopupSettingsFormProps } from './types'
import { dollarsToCredits } from '@/lib/currency'

const {
  MIN_THRESHOLD_CREDITS,
  MAX_THRESHOLD_CREDITS,
  MIN_TOPUP_DOLLARS,
  MAX_TOPUP_DOLLARS,
  CENTS_PER_CREDIT,
} = AUTO_TOPUP_CONSTANTS

// Define min/max credits based on dollar limits using standard pricing
const MIN_TOPUP_CREDITS = dollarsToCredits(MIN_TOPUP_DOLLARS)
const MAX_TOPUP_CREDITS = dollarsToCredits(MAX_TOPUP_DOLLARS)

export function AutoTopupSettingsForm({
  isEnabled,
  threshold,
  topUpAmountDollars,
  onThresholdChange,
  onTopUpAmountChange,
  isPending,
}: AutoTopupSettingsFormProps) {
  return (
    <BaseAutoTopupSettingsForm
      isEnabled={isEnabled}
      threshold={threshold}
      topUpAmountDollars={topUpAmountDollars}
      onThresholdChange={onThresholdChange}
      onTopUpAmountChange={onTopUpAmountChange}
      isPending={isPending}
      canManage={true} // Users can always manage their own settings
      constants={{
        MIN_THRESHOLD_CREDITS,
        MAX_THRESHOLD_CREDITS,
        MIN_TOPUP_CREDITS,
        MAX_TOPUP_CREDITS,
        CENTS_PER_CREDIT,
      }}
      entityType="user"
    />
  )
}
