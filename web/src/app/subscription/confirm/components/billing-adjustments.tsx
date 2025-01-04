'use client'

import { InvoiceLineItems } from './invoice-line-items'
import { SubscriptionPreviewResponse } from 'common/src/types/plan'
import { UsageLimits } from 'common/constants'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

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
      <Collapsible>
        <CollapsibleTrigger className="group flex w-full items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100/50 dark:hover:bg-blue-900/40 border border-blue-100 dark:border-blue-900/50 rounded-md cursor-pointer">
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {totalDue > 0 ? 'One-time charge' : 'Credit amount'}
            </span>
          </div>
          <div className="flex space-x-2 items-center">
            <span
              className={cn(
                'text-lg font-bold',
                totalDue > 0 ? '' : 'text-green-600 dark:text-green-400'
              )}
            >
              ${Math.abs(totalDue).toFixed(2)}
            </span>
            <ChevronDown
              className="h-4 w-4 transform transition-transform duration-200 ease-in-out origin-center group-data-[state=open]:-rotate-180"
              aria-hidden="true"
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 text-sm p-4">
          <InvoiceLineItems items={preview.lineItems} targetPlan={targetPlan} />
        </CollapsibleContent>
      </Collapsible>

      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-2xl font-bold">Upcoming bill</span>
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
  )
}
