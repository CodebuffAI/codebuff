'use client'

import { useUserPlan } from '@/hooks/use-user-plan'
import { PlanName } from 'common/src/types/plan'

type CurrentPlanBadgeProps = {
  planName: PlanName
  subscriptionId: string | null | undefined
}

export const CurrentPlanBadge = ({
  planName,
  subscriptionId,
}: CurrentPlanBadgeProps) => {
  const { data: currentPlan } = useUserPlan(subscriptionId)

  if (!subscriptionId || !currentPlan || currentPlan !== planName) return null

  return (
    <div className="absolute -right-8 -top-8 transform rotate-12">
      <div className="relative">
        <div className="relative bg-blue-500 text-white text-xs px-3 py-2 rounded-lg shadow-lg transform hover:rotate-0 transition-transform duration-200">
          Current Plan
        </div>
      </div>
    </div>
  )
}
