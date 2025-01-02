'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { CREDITS_USAGE_LIMITS } from 'common/constants'
import { PlanName, SubscriptionPreviewResponse } from 'common/src/types/plan'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

interface PlanSummaryProps {
  preview: SubscriptionPreviewResponse
  targetPlan: PlanName
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
          <div className="font-medium mb-2">Current Plan</div>
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
        <div className="space-y-2">
          <Separator />
          <div className="flex justify-between font-medium">
            <span>Monthly Total</span>
            <span>${currentMonthlyTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </TabsContent>
    <TabsContent value="new" className="mt-4">
      <div className="space-y-4">
        <div>
          <div className="font-medium mb-2">New Plan</div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Base rate</span>
              <span>${preview.newMonthlyRate}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Includes</span>
              <span>
                {CREDITS_USAGE_LIMITS[
                  targetPlan === 'Pro' ? 'PRO' : 'MOAR_PRO'
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
                {preview.newOverageAmount === 0 && (
                  <span className="text-green-600"> (included)</span>
                )}
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
        <div className="space-y-2">
          <Separator />
          <div className="flex justify-between font-medium">
            <span>Monthly Total</span>
            <span>${newMonthlyTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </TabsContent>
  </Tabs>
)

const DesktopPlanSummary = ({
  preview,
  targetPlan,
  currentMonthlyTotal,
  newMonthlyTotal,
}: PlanSummaryProps) => (
  <div className="grid grid-cols-[1fr,auto,1fr] gap-4">
    {/* Current Plan */}
    <div className="space-y-4">
      <div>
        <div className="font-medium mb-2">Current Plan</div>
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
      <div className="space-y-2">
        <Separator />
        <div className="flex justify-between font-medium">
          <span>Monthly Total</span>
          <span>${currentMonthlyTotal.toFixed(2)}</span>
        </div>
      </div>
    </div>

    {/* Arrow */}
    <div className="flex items-center justify-center text-2xl">→</div>

    {/* New Plan */}
    <div className="space-y-4">
      <div>
        <div className="font-medium mb-2">New Plan</div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span>Base rate</span>
            <span>${preview.newMonthlyRate}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Includes</span>
            <span>
              {CREDITS_USAGE_LIMITS[
                targetPlan === 'Pro' ? 'PRO' : 'MOAR_PRO'
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
              {preview.newOverageAmount === 0 && (
                <span className="text-green-600"> (included)</span>
              )}
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
      <div className="space-y-2">
        <Separator />
        <div className="flex justify-between font-medium">
          <span>Monthly Total</span>
          <span>${newMonthlyTotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  </div>
)

export const NewPlanSummary = ({
  preview,
  targetPlan,
}: Omit<
  PlanSummaryProps,
  'currentMonthlyTotal' | 'newMonthlyTotal' | 'monthlySavings'
>) => {
  const isMobile = useIsMobile()
  const currentMonthlyTotal =
    preview.currentMonthlyRate + preview.currentOverageAmount
  const newMonthlyTotal = preview.newMonthlyRate + preview.newOverageAmount
  const monthlySavings = currentMonthlyTotal - newMonthlyTotal

  if (!preview.overageCredits) return null

  return (
    <>
      {monthlySavings > 0 && (
        <div className={'p-3 bg-green-50 dark:bg-green-900/20 rounded-lg'}>
          <div className="text-sm text-green-600 dark:text-green-400">
            You'll save ${monthlySavings.toFixed(2)} per month
          </div>
        </div>
      )}

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
            currentMonthlyTotal={currentMonthlyTotal}
            newMonthlyTotal={newMonthlyTotal}
          />
        ) : (
          <DesktopPlanSummary
            preview={preview}
            targetPlan={targetPlan}
            currentMonthlyTotal={currentMonthlyTotal}
            newMonthlyTotal={newMonthlyTotal}
          />
        )}
      </div>
    </>
  )
}
