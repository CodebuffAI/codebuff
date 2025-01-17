'use client'

import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { BackgroundBeams } from '@/components/ui/background-beams'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  ZapIcon,
  RocketIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  HeartIcon,
  MessageSquareIcon,
  CheckCircle2Icon,
  SparklesIcon,
} from 'lucide-react'
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
          price: `$${config.monthlyPrice}/month`,
          credits: config.limit,
          features: [
            config.overageRate ? (
              <>
                Overage allowed
                <br />
                {`($${config.overageRate.toFixed(2)} per 100 credits)`}
              </>
            ) : (
              'No overage allowed'
            ),
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
              <FreePlanButton
                currentPlan={effectiveCurrentPlan}
                userEmail={session.data?.user?.email}
              />
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
          className="w-full text-white transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          asChild
        >
          <Link href={'mailto:founders@codebuff.com'}>Contact Sales</Link>
        </Button>
      ),
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8 container mx-auto px-4 md:px-6">
      {pricingPlans.map((plan, index) => (
        <Card
          key={index}
          className={cn(
            'bg-gradient-to-br from-gray-900 to-gray-800 text-white flex flex-col relative',
            'border-gray-800 hover:border-gray-700/50 transition-all duration-300',
            'shadow-lg hover:shadow-xl hover:shadow-blue-900/20',
            'transform hover:-translate-y-1'
          )}
        >
          <CardHeader className="min-h-[200px] flex flex-col">
            <h3 className="text-2xl font-bold relative flex items-center gap-3">
              {plan.displayName}
              {currentPlan === plan.name && (
                <div className="absolute -right-8 -top-8 transform rotate-12">
                  <div className="relative">
                    <div className="relative bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-1 text-xs font-medium text-white ring-2 ring-blue-500/50 text-white text-xs px-3 py-2 rounded-lg shadow-lg transform hover:rotate-0 transition-transform duration-200">
                      Current Plan
                    </div>
                  </div>
                </div>
              )}
            </h3>
            <div className="mt-4 space-y-3">
              <p className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                {plan.price}
              </p>
              {plan.credits && (
                <div className="flex items-center justify-center gap-2">
                  <SparklesIcon className="h-5 w-5 text-yellow-500" />
                  <p className="text-lg text-gray-300">
                    {plan.credits.toLocaleString()} credits
                  </p>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col justify-between pt-6">
            <ul className="space-y-4 text-gray-300 text-left">
              {plan.features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <CheckCircle2Icon className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className="text-sm">{feature}</span>
                </li>
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
    <div className="overflow-hidden min-h-screen">
      <BackgroundBeams />

      <main className="container mx-auto px-4 py-20 text-center relative z-10">
        <div className="p-8 space-y-8">
          <h1 className="text-5xl md:text-7xl font-bold mb-12 bg-clip-text text-transparent bg-gradient-to-br from-blue-600 via-blue-800 to-purple-700 dark:from-blue-400 dark:via-blue-600 dark:to-purple-500">
            Choose Your Plan
          </h1>
        </div>{' '}
        <div className="relative">
          {/* Add subtle gradient behind cards */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-purple-500/5 to-blue-500/5 dark:from-blue-900/10 dark:via-purple-900/10 dark:to-blue-900/10 blur-3xl -z-10" />

          <PricingCards />

          <div className="mt-24 space-y-12">
            {/* Key benefits */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="flex flex-col items-center space-y-2 p-6 rounded-xl bg-gray-900/30 border border-gray-800">
                <ZapIcon className="h-8 w-8 text-yellow-500 mb-2" />
                <h3 className="font-semibold text-lg">Efficient</h3>
                <p className="text-sm text-muted-foreground text-center">
                  500 credits = 1 hour coding
                </p>
              </div>
              <div className="flex flex-col items-center space-y-2 p-6 rounded-xl bg-gray-900/30 border border-gray-800">
                <SparklesIcon className="h-8 w-8 text-purple-500 mb-2" />
                <h3 className="font-semibold text-lg">Context-Aware</h3>
                <p className="text-sm text-muted-foreground text-center">
                  Understands your entire codebase
                </p>
              </div>
              <div className="flex flex-col items-center space-y-2 p-6 rounded-xl bg-gray-900/30 border border-gray-800">
                <RefreshCwIcon className="h-8 w-8 text-green-500 mb-2" />
                <h3 className="font-semibold text-lg">Monthly Reset</h3>
                <p className="text-sm text-muted-foreground text-center">
                  Credits reset every month
                </p>
              </div>
            </div>

            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Need something custom?{' '}
              <Link
                href={'mailto:founders@codebuff.com'}
                className="text-blue-500 hover:text-blue-400 underline decoration-blue-500/30 hover:decoration-blue-400"
              >
                Contact our team
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

export default PricingPage
