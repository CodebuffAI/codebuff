'use client'

import { Suspense } from 'react'
import Loading from './loading'
import { PlanName } from 'common/src/types/plan'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { BackgroundBeams } from '@/components/ui/background-beams'
import Link from 'next/link'
import { PLAN_CONFIGS, CREDITS_USAGE_LIMITS } from 'common/constants'
import { useSession } from 'next-auth/react'
import { useUserPlan } from '@/hooks/use-user-plan'
import { PricingCardFooter } from '@/components/pricing/pricing-card-footer'
import { CurrentPlanBadge } from '@/components/pricing/current-plan-badge'

const PricingCards = () => {
  const session = useSession()
  const {
    data: currentPlan,
    isLoading,
    isPending,
  } = useUserPlan(session.data?.user?.stripe_price_id)

  const pricingPlans = [
    ...Object.values(PLAN_CONFIGS)
      .filter((value) => value.planName !== 'ANON')
      .map((config) => ({
        name: config.displayName as PlanName,
        price: config.monthlyPrice ? `$${config.monthlyPrice}/month` : 'Custom',
        credits: config.limit,
        features: [
          config.overageRate
            ? `Overage allowed ($${config.overageRate.toFixed(2)} per 100 credits)`
            : 'No overage allowed',
          config.displayName === 'Free' ? (
            <Link
              key="community-support"
              href="https://discord.gg/mcWTGjgTj3"
              className="hover:underline"
              target="_blank"
            >
              Community support
            </Link>
          ) : (
            'Priority support over email and Discord'
          ),
        ],
        cardFooterChildren:
          config.displayName === 'Free' ? (
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              asChild
            >
              <Link href={'https://www.npmjs.com/package/codebuff'}>
                Get Started
              </Link>
            </Button>
          ) : (
            <PricingCardFooter
              planName={config.displayName as PlanName}
              currentPlan={currentPlan}
              isLoading={isLoading || isPending}
            />
          ),
      })),
    {
      name: 'Team' as PlanName,
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
    <div className="grid md:grid-cols-4 gap-8">
      {pricingPlans.map((plan, index) => (
        <Card
          key={index}
          className="bg-gray-900 text-white flex flex-col relative"
        >
          <CardHeader className="min-h-[200px] flex flex-col">
            <h3 className="text-2xl font-bold relative">
              {plan.name}
              <CurrentPlanBadge
                planName={plan.name}
                subscriptionId={session?.data?.user?.stripe_price_id}
              />
            </h3>
            <div className="mt-4 space-y-2">
              <p className="text-3xl font-bold">{plan.price}</p>
              {plan.credits && (
                <p className="text-lg text-gray-300">
                  {plan.credits.toLocaleString()} credits
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col justify-between pt-6">
            <ul className="space-y-3 text-gray-300">
              {plan.features.map((feature, idx) => (
                <li key={idx}>{feature}</li>
              ))}
            </ul>
          </CardContent>
          <CardFooter className="w-full justify-center pt-6">
            {plan.cardFooterChildren}
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

const PricingPage = () => {
  return (
    <div className="overflow-hidden">
      <BackgroundBeams />

      <main className="container mx-auto px-4 py-20 text-center relative z-10">
        <div className="p-4">
          <h1 className="text-5xl md:text-7xl font-bold mb-6">
            Choose Your Plan
          </h1>
          <p className="text-xl md:text-2xl mb-12 text-gray-500 max-w-3xl mx-auto">
            Explore our flexible, credits-based pricing options.
          </p>
          <p className="text-lg mt-12 text-gray-600 max-w-3xl mx-auto">
            <i>An intense 1-hour work session typically uses 500 credits.</i>
          </p>
        </div>

        <PricingCards />

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
