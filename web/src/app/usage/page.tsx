import { getServerSession } from 'next-auth'
import { authOptions } from '../api/auth/[...nextauth]/auth-options'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import {
  calculateCurrentBalance,
  CreditBalance,
  GRANT_PRIORITIES,
} from 'common/src/billing/balance-calculator'
import { GrantType } from 'common/src/db/schema'
import { cn } from '@/lib/utils'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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

interface UsageDisplayProps {
  usageThisCycle: number
  balance: CreditBalance
  nextQuotaReset: Date | null
}

const grantTypeColors: Record<GrantType, string> = {
  free: 'bg-green-500',
  referral: 'bg-blue-500',
  rollover: 'bg-purple-500',
  purchase: 'bg-yellow-500',
  admin: 'bg-pink-500',
}
const usedColor = 'bg-gray-400 dark:bg-gray-600'

const getGrantTypeDisplayName = (type: GrantType): string => {
  switch (type) {
    case 'free':
      return 'Free'
    case 'referral':
      return 'Referral'
    case 'rollover':
      return 'Rollover'
    case 'purchase':
      return 'Purchased'
    case 'admin':
      return 'Admin Grant'
    default:
      return type
  }
}

const UsageDisplay = ({
  usageThisCycle,
  balance,
  nextQuotaReset,
}: UsageDisplayProps) => {
  const { totalRemaining, breakdown } = balance
  const totalAvailable = totalRemaining + usageThisCycle

  const sortedGrantTypes = (Object.keys(breakdown) as GrantType[]).sort(
    (a, b) => GRANT_PRIORITIES[a] - GRANT_PRIORITIES[b]
  )

  const calculatePercentage = (amount: number) =>
    totalAvailable > 0 ? (amount / totalAvailable) * 100 : 0

  const usagePercentage = calculatePercentage(usageThisCycle)

  return (
    <Card className="w-full max-w-2xl mx-auto mt-8">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Usage Statistics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground text-left">
            Current Cycle Credit Status
          </p>
          <TooltipProvider>
            <div className="h-4 w-full flex rounded-full overflow-hidden bg-secondary">
              {usagePercentage > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn('h-full', usedColor)}
                      style={{ width: `${usagePercentage}%` }}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Used: {usageThisCycle.toLocaleString()}</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {sortedGrantTypes.map((type) => {
                const amount = breakdown[type]
                if (!amount || amount <= 0) return null
                const percentage = calculatePercentage(amount)
                const colorClass = grantTypeColors[type] || 'bg-gray-300'
                const displayName = getGrantTypeDisplayName(type)

                return (
                  <Tooltip key={type}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn('h-full', colorClass)}
                        style={{ width: `${percentage}%` }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {displayName}: {amount.toLocaleString()}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </TooltipProvider>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <span
                className={cn('w-3 h-3 rounded-full inline-block', usedColor)}
              ></span>
              <span>Used</span>
            </div>
            {sortedGrantTypes.map((type) => {
              const amount = breakdown[type]
              if (!amount || amount <= 0) return null
              const colorClass = grantTypeColors[type] || 'bg-gray-300'
              const displayName = getGrantTypeDisplayName(type)
              return (
                <div key={type} className="flex items-center gap-1">
                  <span
                    className={cn(
                      'w-3 h-3 rounded-full inline-block',
                      colorClass
                    )}
                  ></span>
                  <span>{displayName}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="flex justify-between items-center p-4 rounded-lg bg-card/50">
            <span className="font-medium">Total Remaining Credits</span>
            <span className="text-xl font-bold">
              {totalRemaining.toLocaleString('en-US')}
            </span>
          </div>

          <div className="flex justify-between items-center p-4 rounded-lg bg-card/50">
            <span className="font-medium">Credits Used (This Cycle)</span>
            <span className="text-xl">
              {usageThisCycle.toLocaleString('en-US')}
            </span>
          </div>

          {nextQuotaReset && (
            <div className="flex justify-between items-center p-4 rounded-lg bg-card/50">
              <span className="font-medium">Next Cycle Starts</span>
              <span>{nextQuotaReset.toLocaleDateString()}</span>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground pt-4">
          Note: Credits are consumed starting with Free, then Referral,
          Rollover, Purchased, and finally Admin grants. Billing for usage
          beyond granted credits is handled by Stripe according to your plan.
        </p>
      </CardContent>
    </Card>
  )
}

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
