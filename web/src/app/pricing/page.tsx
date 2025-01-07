'use client'

import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { BackgroundBeams } from '@/components/ui/background-beams'
import Link from 'next/link'
import { PLAN_CONFIGS, UsageLimits } from 'common/constants'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useUserPlan } from '@/hooks/use-user-plan'
import { PaidPlanFooter } from '@/components/pricing/paid-plan-footer'
import { FreePlanButton } from '@/components/pricing/free-plan-button'

const PricingCards = () => {
  const router = useRouter()
  const session = useSession()
  // For logged-out users, we don't need to fetch the plan
  const {
    data: currentPlan,
    isLoading,
    isPending,
  } = useUserPlan(session.data?.user?.stripe_customer_id)

  // Set currentPlan to FREE for logged-out users to ensure proper button rendering
  const effectiveCurrentPlan = !session.data ? UsageLimits.ANON : currentPlan

  const pricingPlans = [
    ...Object.entries(PLAN_CONFIGS)
      .filter(([key]) => key !== UsageLimits.ANON)
      .map(
        ([key, config]): {
          name: UsageLimits
          displayName: string
          price: string
          credits: number
          features: (string | JSX.Element)[]
          cardFooterChildren: JSX.Element
        } => ({
          name: config.planName,
          displayName: config.displayName,
          price: config.monthlyPrice
            ? `$${config.monthlyPrice}/month`
            : 'Custom',
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
            config.planName === UsageLimits.FREE ? (
              <FreePlanButton currentPlan={effectiveCurrentPlan} />
            ) : (
              <PaidPlanFooter
                planName={config.planName as UsageLimits}
                currentPlan={effectiveCurrentPlan ?? UsageLimits.FREE}
                isLoading={isLoading || isPending}
              />
            ),
        })
      ),
    {
      name: 'TEAM',
      displayName: 'Team',
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
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 container mx-auto">
      {pricingPlans.map((plan, index) => (
        <Card
          key={index}
          className="bg-gray-900 text-white flex flex-col relative"
        >
          <CardHeader className="min-h-[200px] flex flex-col">
            <h3 className="text-2xl font-bold relative">
              {plan.displayName}
              {currentPlan === plan.name && (
                <div className="absolute -right-8 -top-8 transform rotate-12">
                  <div className="relative">
                    <div className="relative bg-blue-500 text-white text-xs px-3 py-2 rounded-lg shadow-lg transform hover:rotate-0 transition-transform duration-200">
                      Current Plan
                    </div>
                  </div>
                </div>
              )}
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
        <div className="p-8">
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
