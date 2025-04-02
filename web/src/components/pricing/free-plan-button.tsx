import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { env } from '@/env.mjs'
import { UsageLimits } from 'common/constants'
import { DecorativeBlocks, BlockColor } from '@/components/ui/decorative-blocks'
import { motion } from 'framer-motion'

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
    <DecorativeBlocks colors={[BlockColor.TerminalYellow]} placement="bottom-left">
      <motion.div
        whileHover={{ scale: 1.02, x: 2, y: -2 }}
        whileTap={{ scale: 0.98, x: 0, y: 0 }}
      >
        <Button
          className={cn(
            'w-full text-base font-medium px-8 py-4 h-auto',
            'transition-all duration-300 relative group overflow-hidden',
            'border border-white/50 bg-white text-black hover:bg-white'
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
      </motion.div>
    </DecorativeBlocks>
  )
}
