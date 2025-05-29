import { CreditPurchaseSection } from './CreditPurchaseSection'
import { AutoTopupSettings } from '@/components/auto-topup/AutoTopupSettings'

export interface CreditManagementSectionProps {
  onPurchase: (credits: number) => void
  isPurchasePending: boolean
  showAutoTopup?: boolean
  className?: string
  isOrganization?: boolean
}

export function CreditManagementSection({
  onPurchase,
  isPurchasePending,
  showAutoTopup = true,
  className,
  isOrganization = false,
}: CreditManagementSectionProps) {
  return (
    <div className={className}>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold">Buy Credits</h3>
        </div>
        <CreditPurchaseSection
          onPurchase={onPurchase}
          isPurchasePending={isPurchasePending}
          isOrganization={isOrganization}
        />
        {showAutoTopup && (
          <>
            <div className="border-t border-border" />
            <AutoTopupSettings />
          </>
        )}
      </div>
    </div>
  )
}
