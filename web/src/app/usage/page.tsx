import { getServerSession } from 'next-auth'
import { authOptions } from '../api/auth/[...nextauth]/auth-options'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { calculateCurrentBalance } from 'common/src/billing/balance-calculator'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import { UsageDisplay } from './usage-display'

const SignInCard = () => (
  <Card>
    <CardHeader>
      <CardTitle>Sign in to view usage</CardTitle>
    </CardHeader>
    <CardContent>
      <p>Please sign in to view your usage statistics.</p>
    </CardContent>
    <SignInCardFooter />
  </Card>
)

const UsagePage = async () => {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return <SignInCard />
  }

  const userId = session.user.id

  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: { usage: true, next_quota_reset: true },
    })

    if (!user) {
      throw new Error('User not found')
    }

    const balance = await calculateCurrentBalance(userId)

    const usageData = {
      usageThisCycle: user.usage,
      balance: balance,
      nextQuotaReset: user.next_quota_reset,
    }

    return <UsageDisplay {...usageData} />
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
