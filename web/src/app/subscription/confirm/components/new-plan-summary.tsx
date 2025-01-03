'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  CREDITS_USAGE_LIMITS,
  PLAN_CONFIGS,
  UsageLimits,
} from 'common/constants'
import { SubscriptionPreviewResponse } from 'common/src/types/plan'
import { useIsMobile } from '@/hooks/use-mobile'
import { changeOrUpgrade, cn } from '@/lib/utils'

interface PlanSummaryProps {
  preview: SubscriptionPreviewResponse
  currentPlan: UsageLimits
  targetPlan: UsageLimits
  currentMonthlyTotal: number
  newMonthlyTotal: number
}

const MobilePlanSummary = ({
  preview,
  targetPlan,
  currentMonthlyTotal,
  newMonthlyTotal,
}: PlanSummaryProps) => (
  <Tabs defaultValue="new" className="w-full">
    <TabsList className="grid w-full grid-cols-2">
      <TabsTrigger value="current">Current Plan</TabsTrigger>
      <TabsTrigger value="new">New Plan</TabsTrigger>
    </TabsList>
    <TabsContent value="current" className="mt-4">
      <div className="space-y-4">
        <div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Base rate</span>
              <span>${preview.currentMonthlyRate}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Includes</span>
              <span>{preview.currentQuota.toLocaleString()} credits</span>
            </div>
          </div>
          <div className="mt-3 flex justify-between text-amber-600 dark:text-amber-400">
            <div>
              <span>Overage</span>
              <div className="text-xs text-gray-500">
                {preview.overageCredits.toLocaleString()} credits
              </div>
            </div>
            <div className="text-right">
              <div>${preview.currentOverageAmount.toFixed(2)}</div>
              <div className="text-xs text-gray-500">
                ${preview.currentOverageRate.toFixed(2)} per 100
              </div>
            </div>
          </div>
        </div>
        <Separator />
        <div>
          <div className="flex justify-between font-medium">
            <span>Total</span>
            <span>${currentMonthlyTotal.toFixed(2)}</span>
          </div>
          <div className="text-xs text-gray-500 text-right">per month</div>
        </div>
      </div>
    </TabsContent>
    <TabsContent value="new" className="mt-4">
      <div className="space-y-4">
        <div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Base rate</span>
              <span>${preview.newMonthlyRate}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Includes</span>
              <span>
                {CREDITS_USAGE_LIMITS[
                  targetPlan === UsageLimits.PRO ? 'PRO' : 'MOAR_PRO'
                ].toLocaleString()}{' '}
                credits
              </span>
            </div>
          </div>
          <div className="mt-3 flex justify-between text-amber-600 dark:text-amber-400">
            <div>
              <span>Overage</span>
              <div className="text-xs text-gray-500">
                {preview.overageCredits.toLocaleString()} credits
              </div>
            </div>
            <div className="text-right">
              <div>${preview.newOverageAmount.toFixed(2)}</div>
              <div className="text-xs text-gray-500">
                ${preview.newOverageRate.toFixed(2)} per 100
              </div>
            </div>
          </div>
        </div>
        <Separator />
        <div>
          <div className="flex justify-between font-medium">
            <span>Total</span>
            <span>${newMonthlyTotal.toFixed(2)}</span>
          </div>
          <div className="text-xs text-gray-500 text-right">per month</div>
        </div>
      </div>
    </TabsContent>
  </Tabs>
)

const DesktopPlanSummary = ({
  preview,
  targetPlan,
  currentPlan,
  currentMonthlyTotal,
  newMonthlyTotal,
}: PlanSummaryProps) => (
  <div className="grid grid-cols-[1fr,auto,1fr] gap-4">
    {/* Current Plan */}
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold mb-2">Current Plan</div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span>Base rate</span>
            <span>${preview.currentMonthlyRate}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Includes</span>
            <span>{preview.currentQuota.toLocaleString()} credits</span>
          </div>
        </div>
        <div className="mt-3 flex justify-between text-amber-600 dark:text-amber-400">
          <div>
            <span>Overage</span>
            <div className="text-xs text-gray-500">
              {CREDITS_USAGE_LIMITS[currentPlan].toLocaleString()} credits
            </div>
          </div>
          <div className="text-right">
            <div>${preview.currentOverageAmount.toFixed(2)}</div>
            <div className="text-xs text-gray-500">
              ${PLAN_CONFIGS[currentPlan].overageRate!.toFixed(2)} per 100
            </div>
          </div>
        </div>
      </div>
      <Separator />
      <div>
        <div className="flex justify-between font-medium">
          <span>Total</span>
          <span>${currentMonthlyTotal.toFixed(2)}</span>
        </div>
        <div className="text-xs text-gray-500 text-right">per month</div>
      </div>
    </div>

    {/* Arrow */}
    <div className="flex items-center justify-center text-2xl">→</div>

    {/* New Plan */}
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold mb-2">New Plan</div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span>Base rate</span>
            <span>${preview.newMonthlyRate}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Includes</span>
            <span>
              {CREDITS_USAGE_LIMITS[targetPlan].toLocaleString()} credits
            </span>
          </div>
        </div>
        <div className="mt-3 flex justify-between text-amber-600 dark:text-amber-400">
          <div>
            <span>Overage</span>
            <div className="text-xs text-gray-500">
              {PLAN_CONFIGS[targetPlan].limit.toLocaleString()} credits
            </div>
          </div>
          <div className="text-right">
            <div>${preview.newOverageAmount.toFixed(2)}</div>
            <div className="text-xs text-gray-500">
              ${PLAN_CONFIGS[targetPlan].overageRate!.toFixed(2)} per 100
            </div>
          </div>
        </div>
      </div>
      <Separator />
      <div>
        <div className="flex justify-between font-medium">
          <span>Total</span>
          <span>${newMonthlyTotal.toFixed(2)}</span>
        </div>
        <div className="text-xs text-gray-500 text-right">per month</div>
      </div>
    </div>
  </div>
)

export const NewPlanSummary = ({
  preview,
  currentPlan,
  targetPlan,
}: Omit<PlanSummaryProps, 'currentMonthlyTotal' | 'newMonthlyTotal'>) => {
  const isMobile = useIsMobile()
  const currentMonthlyTotal =
    preview.currentMonthlyRate + preview.currentOverageAmount
  const newMonthlyTotal = preview.newMonthlyRate + preview.newOverageAmount
  const monthlySavings = currentMonthlyTotal - newMonthlyTotal
  const modification = changeOrUpgrade(currentPlan, targetPlan)

  return (
    <div className="space-y-4">
      <div className="text-sm">
        You've used{' '}
        <span className="font-medium">
          {preview.creditsUsed.toLocaleString()} credits
        </span>{' '}
        during this billing period so far.{' '}
      </div>

      <div
        className={cn(
          'bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg',
          'space-y-2 text-md'
        )}
      >
        {isMobile ? (
          <MobilePlanSummary
            preview={preview}
            targetPlan={targetPlan}
            currentPlan={currentPlan}
            currentMonthlyTotal={currentMonthlyTotal}
            newMonthlyTotal={newMonthlyTotal}
          />
        ) : (
          <DesktopPlanSummary
            preview={preview}
            targetPlan={targetPlan}
            currentPlan={currentPlan}
            currentMonthlyTotal={currentMonthlyTotal}
            newMonthlyTotal={newMonthlyTotal}
          />
        )}

        {monthlySavings > 0 && (
          <span className="mt-2 text-sm inline-block">
            <>
              Based on your current usage, you should save about{' '}
              <div className="text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 inline-block ">
                ${monthlySavings.toFixed(2)}
              </div>{' '}
              per month by switching.
            </>
          </span>
        )}
      </div>
    </div>
  )
}
