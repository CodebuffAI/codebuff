'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { CREDITS_USAGE_LIMITS, UsageLimits } from 'common/constants'
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

const PlanDetails = ({
  baseRate,
  quota,
  overageCredits,
  overageAmount,
  overageRate,
  planType,
}: {
  baseRate: number
  quota: number
  overageCredits: number
  overageAmount: number
  overageRate: number | null
  planType: UsageLimits
}) => (
  <div>
    <div className="space-y-1">
      <div className="flex justify-between">
        <span>Base rate</span>
        <span>${baseRate}</span>
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>Includes</span>
        <span>{quota.toLocaleString()} credits</span>
      </div>
    </div>
    <div className="mt-3 flex justify-between text-amber-600 dark:text-amber-400">
      <div>
        <span>Overage</span>
        <div className="text-xs text-gray-500">
          {planType === UsageLimits.FREE ? (
            <div>No overage allowed</div>
          ) : (
            <div>{overageCredits.toLocaleString()} credits over quota</div>
          )}
        </div>
      </div>
      <div className="text-right">
        <div>${overageAmount.toFixed(2)}</div>
        <div className="text-xs text-gray-500">
          {overageRate ? `$${overageRate.toFixed(2)} per 100` : '--'}
        </div>
      </div>
    </div>
  </div>
)

const PlanTotal = ({ total }: { total: number }) => (
  <div>
    <div className="flex justify-between font-medium">
      <span>Total</span>
      <span>${total.toFixed(2)}</span>
    </div>
    <div className="text-xs text-gray-500 text-right">per month</div>
  </div>
)

const MobilePlanSummary = ({
  preview,
  currentPlan,
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
        <PlanDetails
          baseRate={preview.currentMonthlyRate}
          quota={preview.currentQuota}
          overageCredits={preview.overageCredits}
          overageAmount={preview.currentOverageAmount}
          overageRate={preview.currentOverageRate}
          planType={currentPlan}
        />
        <Separator />
        <PlanTotal total={currentMonthlyTotal} />
      </div>
    </TabsContent>
    <TabsContent value="new" className="mt-4">
      <div className="space-y-4">
        <PlanDetails
          baseRate={preview.newMonthlyRate}
          quota={CREDITS_USAGE_LIMITS[targetPlan]}
          overageCredits={preview.overageCredits}
          overageAmount={preview.newOverageAmount}
          overageRate={preview.newOverageRate}
          planType={targetPlan}
        />
        <Separator />
        <PlanTotal total={newMonthlyTotal} />
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
}: PlanSummaryProps) => {
  const PlanSection = ({
    title,
    planType,
    monthlyTotal,
    isNew,
  }: {
    title: string
    planType: UsageLimits
    monthlyTotal: number
    isNew: boolean
  }) => (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold mb-2">{title}</div>
        <PlanDetails
          baseRate={isNew ? preview.newMonthlyRate : preview.currentMonthlyRate}
          quota={isNew ? CREDITS_USAGE_LIMITS[planType] : preview.currentQuota}
          overageCredits={preview.overageCredits}
          overageAmount={
            isNew ? preview.newOverageAmount : preview.currentOverageAmount
          }
          overageRate={
            isNew ? preview.newOverageRate : preview.currentOverageRate
          }
          planType={planType}
        />
      </div>
      <Separator />
      <PlanTotal total={monthlyTotal} />
    </div>
  )

  return (
    <div className="grid grid-cols-[1fr,auto,1fr] gap-4">
      {/* Current Plan */}
      <PlanSection
        title="Current Plan"
        planType={currentPlan}
        monthlyTotal={currentMonthlyTotal}
        isNew={false}
      />

      {/* Arrow */}
      <div className="flex items-center justify-center text-2xl">→</div>

      {/* New Plan */}
      <PlanSection
        title="New Plan"
        planType={targetPlan}
        monthlyTotal={newMonthlyTotal}
        isNew={true}
      />
    </div>
  )
}

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
      </div>
    </div>
  )
}
