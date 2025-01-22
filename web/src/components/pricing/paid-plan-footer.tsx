import { Button } from '@/components/ui/button'
import { NeonGradientButton } from '@/components/ui/neon-gradient-button'
import Link from 'next/link'
import { env } from '@/env.mjs'
import { useRouter } from 'next/navigation'
import { cn, changeOrUpgrade } from '@/lib/utils'
import { UsageLimits, PLAN_CONFIGS } from 'common/constants'
import { capitalize } from 'common/util/string'
import { Icons } from '../icons'
import { useSession } from 'next-auth/react'

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
  const session = useSession()

  // If user is not logged in, show login button
  if (!session.data) {
    return (
      <div className="w-full flex flex-col items-center text-center justify-center space-y-2">
        <Button
          className="w-full text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          onClick={() => router.push('/login')}
        >
          Upgrade
        </Button>
      </div>
    )
  }

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
            'w-full text-white transition-all duration-200',
            'shadow-lg hover:shadow-xl',
            'transform hover:scale-105',
            isLoading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
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
