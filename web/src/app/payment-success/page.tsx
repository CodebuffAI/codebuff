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
import Link from 'next/link'
import { Button } from '@/components/ui/button'

function SearchParamsHandler() {
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

    if (session?.user) {
      posthog.capture('subscription.payment_completed', {
        plan: currentPlan,
      })
    }
  }, [session, currentPlan, searchParams, pathname, router])

  return null
}

const PaymentSuccessPage = () => {
  const { data: session } = useSession()
  const { data: currentPlan } = useUserPlan(session?.user?.stripe_customer_id)
  const searchParams = useSearchParams()
  const isCreditPurchase = searchParams.get('purchase') === 'credits' // Check for credit purchase flag

  if (isCreditPurchase) {
    return CardWithBeams({
      title: 'Purchase Successful!',
      description: `Your credits have been added to your account.`,
      content: (
        <div className="flex flex-col items-center space-y-4">
          <Image
            src="/much-credits.jpg"
            alt="Successful credit purchase"
            width={600}
            height={600}
          />
          <Button asChild>
            <Link href="/usage">View Usage</Link>
          </Button>
        </div>
      ),
    });
  }

  if (!session?.user) {
    return CardWithBeams({
      title: 'You&apos;re not logged in.',
      description: 'How can you pay but not be logged in?!',
      content: (
        <p>
          Err this is awkward... Please reach out to support at{' '}
          <a href="mailto:support@codebuff.com">support@codebuff.com</a> for
          help finishing your upgrade.
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

  return (
    <>
      <Suspense>
        <SearchParamsHandler />
      </Suspense>
      {CardWithBeams({
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
      })}
    </>
  )
}

export default PaymentSuccessPage
