'use client'
import { useState, useEffect } from 'react'
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

const PricingPage = () => {
  const [isPending, setIsPending] = useState(false)
  const session = useSession()

  const handleCreateCheckoutSession = async () => {
    setIsPending(true)

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
      price: '$0',
      credits: CREDITS_USAGE_LIMITS.FREE,
      features: ['Community support'],
      buttonText: (
        <Link href={'https://www.npmjs.com/package/manicode'}>Get Started</Link>
      ),
    },
    {
      name: 'Pro',
      price: '$99/month',
      credits: CREDITS_USAGE_LIMITS.PAID,
      features: ['Priority support', 'Custom integrations'],
      buttonAction: () => handleCreateCheckoutSession(),
      buttonText: session?.data?.user?.subscription_active ? (
        <p>You are on the pro tier!</p>
      ) : (
        <>
          {isPending && <Icons.loader className="mr-2 size-4 animate-spin" />}
          Upgrade to pro
        </>
      ),
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      credits: 'Custom',
      features: [
        'Dedicated AI model',
        'Team collaboration',
        '24/7 support',
        'Custom features',
      ],
      buttonText: (
        <Link href={'mailto:founders@manicode.ai'}>Contact Sales</Link>
      ),
    },
  ]

  return (
    <div className="overflow-hidden">
      <BackgroundBeams />

      <main className="container mx-auto px-4 py-20 text-center relative z-10">
        <h1 className="text-5xl md:text-7xl font-bold mb-6">
          Choose Your Plan
        </h1>
        <p className="text-xl md:text-2xl mb-12 text-gray-500 max-w-3xl mx-auto">
          Unlock the full potential of AI-powered coding with our flexible,
          credits-based pricing options.
        </p>

        <div className="grid md:grid-cols-3 gap-8 mt-12">
          {pricingPlans.map((plan, index) => (
            <Card key={index} className="bg-gray-900 text-white">
              <CardHeader>
                <h3 className="text-2xl font-bold">{plan.name}</h3>
                <p className="text-4xl font-bold mt-2">{plan.price}</p>
                <p className="text-lg mt-2">{plan.credits} credits/month</p>
              </CardHeader>
              <CardContent>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((feature, idx) => (
                    <li key={idx}>{feature}</li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {
                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    onClick={plan.buttonAction}
                    disabled={
                      isPending ||
                      (plan.name === 'Pro' &&
                        session.data?.user?.subscription_active)
                    }
                    asChild={!plan.buttonAction}
                  >
                    {plan.buttonText}
                  </Button>
                }
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>
    </div>
  )
}

export default PricingPage
