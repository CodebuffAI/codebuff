import { UserProfile } from '@/types/user'

export interface AutoTopupState {
  isEnabled: boolean
  threshold: number
  topUpAmountDollars: number
  isLoadingProfile: boolean
  isPending: boolean
  userProfile: UserProfile | null
  handleToggleAutoTopup: (checked: boolean) => void
  handleThresholdChange: (value: number) => void
  handleTopUpAmountChange: (value: number) => void
}

export interface AutoTopupSwitchProps {
  isEnabled: boolean
  onToggle: (checked: boolean) => void
  isPending: boolean
  autoTopupBlockedReason: string | null
}

export interface AutoTopupSettingsFormProps {
  isEnabled: boolean
  threshold: number
  topUpAmountDollars: number
  onThresholdChange: (value: number) => void
  onTopUpAmountChange: (value: number) => void
  isPending: boolean
}