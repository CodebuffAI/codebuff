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
import { DecorativeBlocks, BlockColor } from '@/components/ui/decorative-blocks'
import { motion } from 'framer-motion'

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
        <DecorativeBlocks colors={[BlockColor.TerminalYellow]} placement="bottom-left">
          <motion.div
            whileHover={{ scale: 1.02, x: 2, y: -2 }}
            whileTap={{ scale: 0.98, x: 0, y: 0 }}
          >
            <Button
              className="w-full text-base font-medium px-8 py-4 h-auto border border-white/50 bg-white text-black hover:bg-white transition-all duration-300 relative group overflow-hidden"
              onClick={() => router.push('/login')}
            >
              Upgrade
            </Button>
          </motion.div>
        </DecorativeBlocks>
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
        <DecorativeBlocks colors={[BlockColor.TerminalYellow]} placement="bottom-left">
          <motion.div
            whileHover={{ scale: 1.02, x: 2, y: -2 }}
            whileTap={{ scale: 0.98, x: 0, y: 0 }}
          >
            <Button
              className={cn(
                'w-full text-base font-medium px-8 py-4 h-auto',
                'transition-all duration-300 relative group overflow-hidden',
                isLoading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'border border-white/50 bg-white text-black hover:bg-white'
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
          </motion.div>
        </DecorativeBlocks>
      )}
    </div>
  )
}
