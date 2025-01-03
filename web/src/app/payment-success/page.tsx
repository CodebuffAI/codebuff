'use client'

import CardWithBeams from '@/components/card-with-beams'
import Image from 'next/image'
import { trackUpgrade } from '@/lib/trackConversions'
import { useEffect } from 'react'
import { CREDITS_USAGE_LIMITS, PLAN_CONFIGS } from 'common/constants'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useUserPlan } from '@/hooks/use-user-plan'
import { getSession } from 'next-auth/react'

'use client'

const PaymentSuccessPage = async () => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const session = await getSession()
  const { data: currentPlan } = useUserPlan(session?.user?.stripe_customer_id)

  useEffect(() => {
    const params = trackUpgrade(true)
    const newParams = new URLSearchParams(searchParams)
    params.forEach((value, key) => newParams.set(key, value))
    router.replace(`${pathname}?${newParams}`)
  }, [])

  const planConfig = currentPlan ? PLAN_CONFIGS[currentPlan as keyof typeof PLAN_CONFIGS] : null
  const credits = planConfig ? CREDITS_USAGE_LIMITS[planConfig.planName as keyof typeof CREDITS_USAGE_LIMITS] : 0

  return CardWithBeams({
    title: 'Upgrade successful!',
    description: `Welcome to ${currentPlan || 'your new plan'}! Your monthly credits have been increased to ${credits.toLocaleString()}.`,
    content: (
      <div className="flex flex-col space-y-2">
        <Image
          src="/much-credits.jpg"
          alt="Successful upgrade"
          width={600}
          height={600}
        />
      </div>
    ),
  })
}

export default PaymentSuccessPage
