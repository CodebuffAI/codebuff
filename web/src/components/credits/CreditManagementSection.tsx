import { CreditPurchaseSection } from './CreditPurchaseSection'
import { CreditManagementSkeleton } from './CreditManagementSkeleton'

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
  billingPortalUrl?: string
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
  billingPortalUrl,
}: CreditManagementSectionProps) {
  // Determine if we're in organization context
  const isOrgContext = context === 'organization' || isOrganization

  if (isLoading) {
    return <CreditManagementSkeleton />
  }

  return (
    <div className={className}>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold">Buy Credits</h3>
          {billingPortalUrl && (
            <a
              href={billingPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline underline-offset-4 hover:text-primary/90"
            >
              Billing Portal →
            </a>
          )}
        </div>
        <CreditPurchaseSection
          onPurchase={onPurchase}
          isPurchasePending={isPurchasePending}
          isOrganization={isOrgContext}
        />
        {showAutoTopup && (
          <>
            <div className="border-t border-border" />
            {isOrgContext && organizationId ? (
              <OrgAutoTopupSettings organizationId={organizationId} />
            ) : (
              <AutoTopupSettings />
            )}
          </>
        )}
      </div>
    </div>
  )
}
