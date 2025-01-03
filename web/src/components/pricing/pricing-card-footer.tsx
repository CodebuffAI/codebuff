import { Button } from '@/components/ui/button'
import { NeonGradientButton } from '@/components/ui/neon-gradient-button'
import { LoadingDots } from '@/components/ui/loading-dots'
import Link from 'next/link'
import { env } from '@/env.mjs'
import { useRouter } from 'next/navigation'
import { cn, changeOrUpgrade } from '@/lib/utils'
import { UsageLimits, PLAN_CONFIGS } from 'common/constants'
import { capitalize } from 'common/util/string'

type PricingCardFooterProps = {
  planName: UsageLimits
  currentPlan: UsageLimits | undefined
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
      {isCurrentPlan ? (
        <NeonGradientButton
          className="w-full cursor-not-allowed"
          disabled={true}
          neonColors={{
            firstColor: '#FFD700', // Gold
            secondColor: '#FFA500', // Orange
          }}
        >
          You are on this tier!
        </NeonGradientButton>
      ) : (
        <Button
          className={cn(
            'w-full text-white transition-colors',
            isLoading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          )}
          onClick={() => {
            router.push(
              `/subscription/confirm?plan=${PLAN_CONFIGS[planName].planName}`
            )
          }}
          disabled={isLoading}
        >
          {isLoading ? (
            <LoadingDots />
          ) : (
            <p>{capitalize(changeOrUpgrade(currentPlan, planName))}</p>
          )}
        </Button>
      )}
    </div>
  )
}
