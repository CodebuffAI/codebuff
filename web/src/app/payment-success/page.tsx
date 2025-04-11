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
import { Card, CardContent } from '@/components/ui/card'
import { AutoTopupSection } from '@/components/auto-topup/auto-topup-section'

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

function PaymentSuccessContent() {
  const { data: session } = useSession()
  const { data: currentPlan, isLoading } = useUserPlan(session?.user?.stripe_customer_id)
  const searchParams = useSearchParams()
  const isCreditPurchase = searchParams.get('purchase') === 'credits'

  if (isLoading) {
    return (
      <div className="space-y-8">
        <PaymentSuccessCardSkeleton />
        {isCreditPurchase && <AutoTopupCardSkeleton />}
      </div>
    )
  }

  if (isCreditPurchase) {
    return (
      <div className="space-y-8">
        {CardWithBeams({
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
        })}
        
        <Card className="w-full max-w-2xl mx-auto">
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Enable Auto Top-up</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Never run out of credits. We'll automatically top up your account when your balance gets low.
              </p>
              <AutoTopupSection />
            </div>
          </CardContent>
        </Card>
      </div>
    )
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

const PaymentSuccessPage = () => {
  return (
    <>
      <Suspense>
        <SearchParamsHandler />
      </Suspense>
      <Suspense fallback={<div>Loading...</div>}>
        <PaymentSuccessContent />
      </Suspense>
    </>
  )
}

export default PaymentSuccessPage
