'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { BackgroundBeams } from '@/components/ui/background-beams'
import Link from 'next/link'
import { CREDITS_USAGE_LIMITS } from 'common/constants'
import { loadStripe } from '@stripe/stripe-js'
import { env } from '@/env.mjs'
import Stripe from 'stripe'
import { useSession } from 'next-auth/react'
import { Icons } from '@/components/icons'
import { useRouter } from 'next/navigation'

const PricingPage = () => {
  const [isPending, setIsPending] = useState(false)
  const session = useSession()
  const router = useRouter()

  const handleCreateCheckoutSession = async () => {
    setIsPending(true)

    if (session.status !== 'authenticated') {
      router.push('/login')
      return
    }

    const res = await fetch('/api/stripe/checkout-session')
    const checkoutSession: Stripe.Response<Stripe.Checkout.Session> = await res
      .json()
      .then(
        ({ session }) => session as Stripe.Response<Stripe.Checkout.Session>
      )
    const stripe = await loadStripe(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
    if (!stripe) {
      throw new Error('Stripe not loaded')
    }

    await stripe.redirectToCheckout({
      sessionId: checkoutSession.id,
    })
  }

  const pricingPlans = [
    {
      name: 'Free',
      price: '$0/month',
      credits: CREDITS_USAGE_LIMITS.FREE,
      features: [
        <Link
          key="community-support"
          href="https://discord.gg/mcWTGjgTj3"
          className="hover:underline"
          target="_blank"
        >
          Community support
        </Link>,
      ],
      cardFooterChildren: (
        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          asChild
        >
          <Link href={'https://www.npmjs.com/package/manicode'}>
            Get Started
          </Link>
        </Button>
      ),
    },
    {
      name: 'Pro',
      price: '$99/month',
      credits: CREDITS_USAGE_LIMITS.PAID,
      features: [
        '$0.90 per 100 credits afterwards',
        'Priority support over email or Discord',
      ],
      cardFooterChildren: (
        <div className="w-full flex flex-col items-center text-center justify-center space-y-2">
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            onClick={() => handleCreateCheckoutSession()}
            disabled={isPending || session.data?.user?.subscription_active}
          >
            {session?.data?.user?.subscription_active ? (
              <p>You are on the pro tier!</p>
            ) : (
              <>
                {isPending && (
                  <Icons.loader className="mr-2 size-4 animate-spin" />
                )}
                Upgrade to pro
              </>
            )}
          </Button>
          {session?.data?.user?.subscription_active && (
            <p className="text-xs">
              Need to cancel? Click{' '}
              <Link
                href={env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL}
                className="hover:text-blue-500 hover:underline"
              >
                here
              </Link>{' '}
              (to break our hearts)
            </p>
          )}
        </div>
      ),
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      credits: 'Custom',
      features: [
        'Team collaboration',
        '24/7 support',
        'Custom features',
        'Custom integrations',
      ],
      cardFooterChildren: (
        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          asChild
        >
          <Link href={'mailto:founders@manicode.ai'}>Contact Sales</Link>
        </Button>
      ),
    },
  ]

  return (
    <div className="overflow-hidden">
      <BackgroundBeams />

      <div className="max-w-6xl mx-auto">
        <main className="container mx-auto px-4 py-20 text-center relative z-10">
          <h1 className="text-5xl md:text-7xl font-bold mb-6">
            Choose Your Plan
          </h1>
          <p className="text-xl md:text-2xl mb-12 text-gray-500 max-w-3xl mx-auto">
            Unlock the full potential of AI-powered coding with our flexible,
            credits-based pricing options.
          </p>
          <p className="text-lg mt-12 text-gray-600 max-w-3xl mx-auto">
            <i>A multi-hour work session typically uses 500 credits.</i>
          </p>

          <div className="grid md:grid-cols-3 gap-8 mt-12">
            {pricingPlans.map((plan, index) => (
              <Card
                key={index}
                className="bg-gray-900 text-white flex flex-col"
              >
                <CardHeader>
                  <h3 className="text-2xl font-bold">{plan.name}</h3>
                  <p className="text-4xl font-bold mt-2">{plan.price}</p>
                  <p className="text-lg mt-2">{plan.credits} credits/month</p>
                </CardHeader>
                <CardContent className="flex-grow">
                  <ul className="mt-4 space-y-2">
                    {plan.features.map((feature, idx) => (
                      <li key={idx}>{feature}</li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="w-full justify-center">
                  {plan.cardFooterChildren}
                </CardFooter>
              </Card>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}

export default PricingPage
