import { useUserPlan } from '@/hooks/use-user-plan'
import { InvoiceLineItem, PlanName } from 'common/src/types/plan'
import { useSession } from 'next-auth/react'

interface InvoiceLineItemsProps {
  items: InvoiceLineItem[]
  targetPlan: PlanName
}

export const InvoiceLineItems = ({
  items,
  targetPlan,
}: InvoiceLineItemsProps) => {
  const { data: session } = useSession()
  const { data: currentPlan } = useUserPlan(session?.user?.stripe_customer_id)
  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        // Make the descriptions more user-friendly
        let description = item.description
        if (description.includes('Unused time on ')) {
          description = description.replace(
            'Early Supporter Subscription',
            `current plan (${currentPlan})`
          )
        }
        if (description.includes('Remaining time')) {
          description = description.replace(
            'Early Supporter Subscription',
            `new plan (${targetPlan})`
          )
        }

        return (
          <div key={index} className="flex justify-between">
            <span>{description}</span>
            <span
              className={
                item.amount < 0 ? 'text-green-600 dark:text-green-400' : ''
              }
            >
              {`${item.amount < 0 ? '-' : ''}$${Math.abs(item.amount).toFixed(2)}`}
            </span>
          </div>
        )
      })}
    </div>
  )
}
