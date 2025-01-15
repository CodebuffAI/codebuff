import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { env } from '@/env.mjs'
import { UsageLimits } from 'common/constants'

type FreePlanButtonProps = {
  currentPlan: UsageLimits | undefined
  userEmail: string | undefined | null
}

export const FreePlanButton = ({
  currentPlan,
  userEmail,
}: FreePlanButtonProps) => {
  const router = useRouter()
  const isFreeTier =
    currentPlan === UsageLimits.FREE || currentPlan === UsageLimits.ANON

  return (
    <Button
      className={cn(
        'w-full text-white transition-all duration-200',
        'shadow-lg hover:shadow-xl',
        'transform hover:scale-105',
        'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
      )}
      onClick={() => {
        if (isFreeTier) {
          router.push('https://www.npmjs.com/package/codebuff')
        } else {
          // For downgrades to free plan, send to cancellation portal
          router.push(
            `${env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL}?prefilled_email=${encodeURIComponent(userEmail ?? '')}`
          )
        }
      }}
    >
      {isFreeTier ? 'Get Started' : 'Downgrade'}
    </Button>
  )
}
