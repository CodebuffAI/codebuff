'use client'

import { Button } from '@/components/ui/button'
import { LoadingDots } from '@/components/ui/loading-dots'
import Link from 'next/link'
import { env } from '@/env.mjs'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { PlanName } from 'common/src/types/plan'

type PricingCardFooterProps = {
  planName: PlanName
  currentPlan: PlanName | undefined
  isLoading?: boolean
}

export const PricingCardFooter = ({
  planName,
  currentPlan,
  isLoading,
}: PricingCardFooterProps) => {
  const isCurrentPlan = currentPlan === planName
  const router = useRouter()

  return (
    <div className="w-full flex flex-col items-center text-center justify-center space-y-2">
      {isCurrentPlan && (
        <div className="mb-4">
          <p className="text-xs">
            Need to cancel?<br></br>Click{' '}
            <Link
              href={env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL}
              className="hover:text-blue-500 hover:underline"
            >
              here
            </Link>{' '}
            (to break our hearts)
          </p>
        </div>
      )}
      <Button
        className={cn(
          'w-full text-white transition-colors',
          isCurrentPlan || isLoading
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700'
        )}
        onClick={() => {
          router.push(`/subscription/confirm?plan=${planName}`)
        }}
        disabled={isCurrentPlan || isLoading}
      >
        {isLoading ? (
          <LoadingDots />
        ) : (
          <>{isCurrentPlan ? <p>You are on this tier!</p> : <>Upgrade</>}</>
        )}
      </Button>
    </div>
  )
}
