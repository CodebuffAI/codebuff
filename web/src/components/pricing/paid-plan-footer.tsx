import { Button } from '@/components/ui/button'
import { NeonGradientButton } from '@/components/ui/neon-gradient-button'
import Link from 'next/link'
import { env } from '@/env.mjs'
import { useRouter } from 'next/navigation'
import { cn, changeOrUpgrade } from '@/lib/utils'
import { UsageLimits, PLAN_CONFIGS } from 'common/constants'
import { capitalize } from 'common/util/string'
import { Icons } from '../icons'

type PaidPlanFooterProps = {
  planName: UsageLimits
  currentPlan: UsageLimits | undefined
  isLoading?: boolean
}

export const PaidPlanFooter = ({
  planName,
  currentPlan,
  isLoading,
}: PaidPlanFooterProps) => {
  const isCurrentPlan = currentPlan === planName
  const router = useRouter()

  return (
    <div className="w-full flex flex-col items-center text-center justify-center space-y-2">
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
            <Icons.loader className="mr-2 size-4 animate-spin" />
          ) : (
            <p>{capitalize(changeOrUpgrade(currentPlan, planName))}</p>
          )}
        </Button>
      )}
    </div>
  )
}
