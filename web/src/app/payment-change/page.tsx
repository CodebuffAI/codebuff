'use client'

import Image from 'next/image'
import { useEffect, Suspense } from 'react'
import posthog from 'posthog-js'
import { PLAN_CONFIGS } from 'common/constants'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import CardWithBeams from '@/components/card-with-beams'
import { trackUpgrade } from '@/lib/trackConversions'
import { useUserPlan } from '@/hooks/use-user-plan'
import { capitalize } from 'common/util/string'

function PaymentChangeContent() {
  const { data: session } = useSession()
  const { data: currentPlan } = useUserPlan(session?.user?.stripe_customer_id)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const modification = searchParams.get('modification') || 'change'

  useEffect(() => {
    const params = trackUpgrade(true)
    const newParams = new URLSearchParams(searchParams)
    params.forEach((value, key) => newParams.set(key, value))
    router.replace(`${pathname}?${newParams}`)

    if (session?.user) {
      posthog.capture('subscription.plan_changed', {
        plan: currentPlan,
        modification,
      })
    }
  }, [session, currentPlan, modification, searchParams, pathname, router])

  if (!session?.user) {
    return CardWithBeams({
      title: "You're not logged in.",
      description: 'How can you change your plan but not be logged in?!',
      content: (
        <p>
          Err this is awkward... Please reach out to support at{' '}
          <a href="mailto:support@codebuff.com">support@codebuff.com</a> for
          help finishing your {modification}.
        </p>
      ),
    })
  }

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
    title: `${capitalize(modification)} successful!`,
    description: `Your plan has been ${modification}d to ${planDisplayName}. You now have ${credits.toLocaleString()} monthly credits.`,
    content: (
      <div className="flex flex-col space-y-2">
        <Image
          src="/plan-change.png"
          alt="Successful plan change"
          width={600}
          height={600}
        />
      </div>
    ),
  })
}

const PaymentChangePage = () => {
  return (
    <Suspense>
      <PaymentChangeContent />
    </Suspense>
  )
}

export default PaymentChangePage
