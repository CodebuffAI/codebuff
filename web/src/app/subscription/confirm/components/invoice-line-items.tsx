import { InvoiceLineItem } from 'common/src/types/plan'
import { UsageLimits, PLAN_CONFIGS } from 'common/constants'
import { useUserPlan } from '@/hooks/use-user-plan'
import { useSession } from 'next-auth/react'

interface InvoiceLineItemsProps {
  items: InvoiceLineItem[]
  targetPlan: UsageLimits
}

export const InvoiceLineItems = ({
  items,
  targetPlan,
}: InvoiceLineItemsProps) => {
  const { data: session } = useSession()
  const { data: currentPlanLimit } = useUserPlan(
    session?.user?.stripe_customer_id
  )
  const currentPlan = currentPlanLimit
    ? PLAN_CONFIGS[currentPlanLimit].displayName
    : 'Free'

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
            `new plan (${PLAN_CONFIGS[targetPlan].displayName})`
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
