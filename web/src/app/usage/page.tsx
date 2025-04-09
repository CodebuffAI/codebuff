import { getServerSession } from 'next-auth'
import { authOptions } from '../api/auth/[...nextauth]/auth-options'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { calculateCurrentBalance } from 'common/src/billing/balance-calculator'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import { UsageDisplay } from './usage-display'
import { AutoTopupSettings } from './auto-topup-settings'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { env } from '@/env.mjs'
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query'

const SignInCard = () => (
  <Card className="w-full max-w-md mx-auto mt-10">
    <CardHeader>
      <CardTitle>Sign in to view usage</CardTitle>
    </CardHeader>
    <CardContent>
      <p>Please sign in to view your usage statistics and manage settings.</p>
    </CardContent>
    <SignInCardFooter />
  </Card>
)

const ManagePlanCard = () => (
  <Card className="w-full max-w-2xl mx-auto mb-8">
    <CardHeader>
      <CardTitle className="text-2xl font-bold">Manage Your Plan &amp; Credits</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground mb-4">
        Need more credits or want to manage your subscription?
      </p>
    </CardContent>
    <CardFooter className="flex flex-col sm:flex-row gap-4">
      <Button asChild className="w-full sm:w-auto">
        <Link href="/pricing">Upgrade Plan</Link>
      </Button>
      <Button variant="outline" asChild className="w-full sm:w-auto">
        <Link href={env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL} target="_blank">
          Manage Billing / Top Up
        </Link>
      </Button>
    </CardFooter>
  </Card>
)

const UsagePage = async () => {
  const session = await getServerSession(authOptions)
  const queryClient = new QueryClient()

  if (!session?.user?.id) {
    return <SignInCard />
  }

  const userId = session.user.id

  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        usage: true,
        next_quota_reset: true,
        auto_topup_enabled: true,
        auto_topup_threshold: true,
        auto_topup_target_balance: true,
      },
    })

    if (!user) {
      throw new Error('User not found')
    }

    const initialAutoTopupSettings = {
      auto_topup_enabled: user.auto_topup_enabled,
      auto_topup_threshold: user.auto_topup_threshold,
      auto_topup_target_balance: user.auto_topup_target_balance,
    }

    const balance = await calculateCurrentBalance(userId)

    const usageData = {
      usageThisCycle: user.usage,
      balance: balance,
      nextQuotaReset: user.next_quota_reset,
    }

    return (
       <HydrationBoundary state={dehydrate(queryClient)}>
          <div className="space-y-8">
            <ManagePlanCard />
            <UsageDisplay {...usageData} />
            <AutoTopupSettings initialSettings={initialAutoTopupSettings} />
          </div>
       </HydrationBoundary>
    )
  } catch (error) {
    console.error('Error fetching usage data:', error)
    return (
      <Card className="w-full max-w-2xl mx-auto mt-8">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-red-600">
            Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>Could not load usage data. Please try again later.</p>
        </CardContent>
      </Card>
    )
  }
}

export default UsagePage
