'use client'

import { InvoiceLineItems } from './invoice-line-items'
import { SubscriptionPreviewResponse } from 'common/src/types/plan'
import { UsageLimits } from 'common/constants'
import { Separator } from '@/components/ui/separator'

interface BillingAdjustmentDetailsProps {
  preview: SubscriptionPreviewResponse
  targetPlan: UsageLimits
}

export const BillingAdjustments = ({
  preview,
  targetPlan,
}: BillingAdjustmentDetailsProps) => {
  const totalDue = preview.lineItems.reduce(
    (total, item) => total + item.amount,
    0
  )

  if (totalDue === 0) return null

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold mb-4">Billing Adjustment</h2>
      <p className="text-sm text-gray-500 mt-2">
        {totalDue > 0
          ? `Prorated charge for remaining ${preview.daysRemainingInBillingPeriod} days of current billing period, `
          : `Credit will be `}
        applied to your next bill.
      </p>
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg space-y-4">
        <div className="space-y-1 text-sm">
          <InvoiceLineItems items={preview.lineItems} targetPlan={targetPlan} />
        </div>
        {/* <Separator /> */}
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            {totalDue > 0 ? (
              <>
                <span className="text-xl font-bold">One-time charge</span>
                <span className="text-xl font-bold">
                  ${totalDue.toFixed(2)}
                </span>
              </>
            ) : (
              <>
                <span className="text-xl font-bold">Credit amount</span>
                <span className="text-xl font-bold text-green-600 dark:text-green-400">
                  ${Math.abs(totalDue).toFixed(2)}
                </span>
              </>
            )}
          </div>
        </div>
        <Separator />
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-2xl font-bold">Next bill total</span>
            <span className="text-2xl font-bold">
              ${(preview.newMonthlyRate + totalDue).toFixed(2)}
            </span>
          </div>
          <div className="text-sm text-gray-500 text-left">
            applied on{' '}
            {new Date(preview.prorationDate * 1000).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  )
}
