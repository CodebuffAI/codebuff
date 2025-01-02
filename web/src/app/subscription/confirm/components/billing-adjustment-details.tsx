'use client'

import { InvoiceLineItems } from './invoice-line-items'
import { PlanName, SubscriptionPreviewResponse } from 'common/src/types/plan'

interface BillingAdjustmentDetailsProps {
  preview: SubscriptionPreviewResponse
  targetPlan: PlanName
}

export const BillingAdjustmentDetails = ({
  preview,
  targetPlan,
}: BillingAdjustmentDetailsProps) => {
  const totalDue = preview.lineItems.reduce((total, item) => total + item.amount, 0)

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold mb-4">Billing Adjustment Details</h2>
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg space-y-2">
        <div className="space-y-1 text-sm">
          <InvoiceLineItems items={preview.lineItems} targetPlan={targetPlan} />
        </div>
      </div>

      <div className="flex justify-between items-center">
        <span className="text-2xl font-bold">Due today</span>
        <span className="text-2xl font-bold">${totalDue.toFixed(2)}</span>
      </div>
      <p className="text-sm text-gray-500 mt-2">
        Prorated charge for remaining {preview.daysRemainingInBillingPeriod} days
        of current billing period, excluding overage charges.
      </p>
    </div>
  )
}
