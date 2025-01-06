import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { env } from '@/env.mjs'
import { UsageLimits } from 'common/constants'

type FreePlanButtonProps = {
  currentPlan: UsageLimits | undefined
}

export const FreePlanButton = ({ currentPlan }: FreePlanButtonProps) => {
  const router = useRouter()

  return (
    <Button
      className={cn(
        'w-full text-white bg-blue-600 hover:bg-blue-700 transition-colors'
      )}
      onClick={() => {
        if (currentPlan === UsageLimits.FREE) {
          router.push('https://www.npmjs.com/package/codebuff')
        } else {
          // For downgrades to free plan, send to cancellation portal
          router.push(env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL)
        }
      }}
    >
      {currentPlan === UsageLimits.FREE ? 'Get Started' : 'Downgrade'}
    </Button>
  )
}
