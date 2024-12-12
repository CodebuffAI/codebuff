'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { BackgroundBeams } from '@/components/ui/background-beams'
import Link from 'next/link'
import { CREDITS_USAGE_LIMITS } from 'common/constants'
import { env } from '@/env.mjs'
import { useSession } from 'next-auth/react'
import { Icons } from '@/components/icons'
import { useRouter } from 'next/navigation'
import { handleCreateCheckoutSession } from '@/lib/stripe'

const PricingPage = () => {
  const [isPending, setIsPending] = useState(false)
  const session = useSession()

  const pricingPlans = [
    {
      name: 'Free',
      price: '$0/month',
      credits: CREDITS_USAGE_LIMITS.FREE,
      features: [
        'No overage allowed',
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
          <Link href={'https://www.npmjs.com/package/codebuff'}>
            Get Started
          </Link>
        </Button>
      ),
    },
    {
      name: 'Pro',
      price: '$49/month',
      credits: CREDITS_USAGE_LIMITS.PAID,
      features: [
        'Overage allowed ($0.99 per 100 credits)',
        'Priority support over email and Discord',
      ],
      cardFooterChildren: (
        <div className="w-full flex flex-col items-center text-center justify-center space-y-2">
          {session?.data?.user?.subscription_active &&
            (session?.data?.user?.stripe_price_id ? (
              <p className="text-xs">
                Need to cancel?<br></br>Click{' '}
                <Link
                  href={env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL}
                  className="hover:text-blue-500 hover:underline"
                >
                  here
                </Link>{' '}
                (to break our hearts)
              </p>
            ) : (
              <p className="text-xs">
                Your subscription won&apos;t renew. Manage it{' '}
                <Link
                  href={env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL}
                  className="hover:text-blue-500 hover:underline"
                >
                  here
                </Link>
                .
              </p>
            ))}
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            onClick={() => handleCreateCheckoutSession(setIsPending)}
            disabled={isPending || session.data?.user?.subscription_active}
          >
            {session?.data?.user?.subscription_active ? (
              <p>You are on the pro tier!</p>
            ) : (
              <>
                {isPending && (
                  <Icons.loader className="mr-2 size-4 animate-spin" />
                )}
                Upgrade
              </>
            )}
          </Button>
        </div>
      ),
    },
    {
      name: 'Pro Plus',
      price: '$249/month',
      credits: CREDITS_USAGE_LIMITS.PRO_PLUS,
      features: [
        'Overage allowed ($0.90 per 100 credits)',
        'Priority support over email and Discord',
      ],
      cardFooterChildren: (
        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          asChild
        >
          <Link href={'mailto:support@codebuff.com'}>Contact Support</Link>
        </Button>
      ),
    },

    {
      name: 'Team',
      price: '$99/seat/month',
      credits: '$0.90 per 100',
      features: [
        'Custom credit limits per member',
        'Custom account limits',
        'Priority support over email, Discord, and Slack',
      ],
      cardFooterChildren: (
        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          asChild
        >
          <Link href={'mailto:founders@codebuff.com'}>Contact Sales</Link>
        </Button>
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
          Unlock the full potential of Codebuff with our flexible, credits-based
          pricing options.
        </p>
        <p className="text-lg mt-12 text-gray-600 max-w-3xl mx-auto">
          <i>An intense 1-hour work session typically uses 500 credits.</i>
        </p>

        <div className="grid md:grid-cols-4 gap-8 mt-12">
          {pricingPlans.map((plan, index) => (
            <Card key={index} className="bg-gray-900 text-white flex flex-col">
              <CardHeader className="min-h-[180px] flex flex-col">
                <h3 className="text-2xl font-bold">{plan.name}</h3>
                <p className="text-4xl font-bold mt-2">{plan.price}</p>
                {plan.credits && (
                  <p className="text-lg mt-2">
                    {plan.credits.toLocaleString()} credits
                  </p>
                )}
              </CardHeader>
              <CardContent className="flex-grow flex flex-col justify-between">
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

        <p className="text-lg mt-12 text-gray-600 max-w-3xl mx-auto">
          <i>
            For enterprise inquiries, please reach out to{' '}
            <Link href={'mailto:founders@codebuff.com'} className="underline">
              founders@codebuff.com
            </Link>
          </i>
        </p>
      </main>
    </div>
  )
}

export default PricingPage
