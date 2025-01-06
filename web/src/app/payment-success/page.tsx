'use client'

import CardWithBeams from '@/components/card-with-beams'
import Image from 'next/image'
import { trackUpgrade } from '@/lib/trackConversions'
import { useEffect } from 'react'
import { PLAN_CONFIGS } from 'common/constants'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useUserPlan } from '@/hooks/use-user-plan'
import { useSession } from 'next-auth/react'

const PaymentSuccessPage = () => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const { data: currentPlan } = useUserPlan(session?.user?.stripe_customer_id)
  useEffect(() => {
    const params = trackUpgrade(true)
    const newParams = new URLSearchParams(searchParams)
    params.forEach((value, key) => newParams.set(key, value))
    router.replace(`${pathname}?${newParams}`)
  }, [])

  if (!currentPlan) {
    return CardWithBeams({
      title: 'Something went wrong',
      description:
        'We could not find your plan details. Please contact support for assistance.',
    })
  }
  const credits = PLAN_CONFIGS[currentPlan].limit
  const planDisplayName = PLAN_CONFIGS[currentPlan].displayName

  return CardWithBeams({
    title: 'Upgrade successful!',
    description: `Welcome to your new ${planDisplayName} plan! Your monthly credits have been increased to ${credits.toLocaleString()}.`,
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
