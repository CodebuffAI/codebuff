import { CreditManagementSkeleton } from './CreditManagementSkeleton'
import { CreditPurchaseSection } from './CreditPurchaseSection'

import { AutoTopupSettings } from '@/components/auto-topup/AutoTopupSettings'
import { OrgAutoTopupSettings } from '@/components/auto-topup/OrgAutoTopupSettings'

export interface CreditManagementSectionProps {
  onPurchase: (credits: number) => void
  isPurchasePending: boolean
  showAutoTopup?: boolean
  className?: string
  context?: 'user' | 'organization'
  organizationId?: string
  isOrganization?: boolean // Keep for backward compatibility
  isLoading?: boolean
}

export { CreditManagementSkeleton }

export function CreditManagementSection({
  onPurchase,
  isPurchasePending,
  showAutoTopup = true,
  className,
  context = 'user',
  organizationId,
  isOrganization = false,
  isLoading = false,
}: CreditManagementSectionProps) {
  // Determine if we're in organization context
  const isOrgContext = context === 'organization' || isOrganization

  if (isLoading) {
    return <CreditManagementSkeleton />
  }

  return (
    <div className={className}>
      <div className="space-y-8">
        <h3 className="text-2xl font-bold">Buy Credits</h3>
        <CreditPurchaseSection
          onPurchase={onPurchase}
          isPurchasePending={isPurchasePending}
          isOrganization={isOrgContext}
        />
        {showAutoTopup &&
          (isOrgContext && organizationId ? (
            <OrgAutoTopupSettings organizationId={organizationId} />
          ) : (
            <AutoTopupSettings />
          ))}
      </div>
    </div>
  )
}
