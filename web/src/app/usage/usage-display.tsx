'use client'

import React from 'react'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { CreditBalance } from 'common/src/billing/balance-calculator'
import { GrantType } from 'common/src/db/schema'
import { GRANT_PRIORITIES } from 'common/src/constants/grant-priorities'
import { GrantTypeValues } from 'common/src/types/grant'
import { pluralize } from 'common/util/string'

interface UsageDisplayProps {
  usageThisCycle: number
  balance: CreditBalance
  nextQuotaReset: Date | null
}

const usedColor = 'bg-gray-400 dark:bg-gray-600'

const grantTypeColors: Record<GrantType, string> = {
  free: 'bg-blue-500',
  referral: 'bg-green-500',
  purchase: 'bg-yellow-500',
  admin: 'bg-red-500',
}

const renewableGrantTypes: GrantType[] = ['free', 'referral']

const getGrantTypeDisplayName = (type: GrantType): string => {
  switch (type) {
    case 'free':
      return 'Free'
    case 'referral':
      return 'Referral'
    case 'purchase':
      return 'Purchased'
    case 'admin':
      return 'Bonus'
    default:
      return type
  }
}

export const UsageDisplaySkeleton = () => (
  <Card className="w-full max-w-2xl mx-auto -mt-8">
    <CardHeader>
      <Skeleton className="h-8 w-1/2" />
    </CardHeader>
    <CardContent className="space-y-6">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full rounded-full" />
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-18" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </CardContent>
  </Card>
)

export const UsageDisplay = ({
  usageThisCycle,
  balance,
  nextQuotaReset,
}: UsageDisplayProps) => {
  const [isOpen, setIsOpen] = React.useState(false)

  const { totalRemaining, breakdown } = balance
  const totalAvailable = totalRemaining + usageThisCycle

  const sortedGrantTypes = GrantTypeValues.sort(
    (a, b) => GRANT_PRIORITIES[a] - GRANT_PRIORITIES[b]
  )

  const calculatePercentage = (amount: number) =>
    totalAvailable > 0 ? (amount / totalAvailable) * 100 : 0

  const usagePercentage = calculatePercentage(usageThisCycle)

  return (
    <Card className="w-full max-w-2xl mx-auto -mt-8">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Usage Statistics</CardTitle>
        {balance.netBalance < 0 && (
          <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md">
            <p className="text-red-500 font-medium">
              Please purchase at least{' '}
              {pluralize(
                Math.abs(balance.netBalance),
                'credit'
              ).toLocaleString()}{' '}
              to continue using Codebuff.
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between items-baseline">
            <p className="text-sm text-muted-foreground">
              Current Cycle Credit Status
            </p>
          </div>
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
                const amount = breakdown[type] || 0
                const percentage = calculatePercentage(amount)
                const colorClass = grantTypeColors[type]
                const displayName = getGrantTypeDisplayName(type)
                return percentage > 0 ? (
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
                ) : null
              })}
            </div>
          </TooltipProvider>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {usagePercentage > 0 && (
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      'w-3 h-3 rounded-full inline-block',
                      usedColor
                    )}
                  ></span>
                  <span>Used</span>
                </div>
              )}
              {sortedGrantTypes.map((type) => {
                const colorClass = grantTypeColors[type]
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
            <p className="text-xs text-muted-foreground">
              Credits are used in order of the types shown above
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="flex justify-between items-center rounded-lg bg-card/50">
            <div className="flex items-center gap-2">
              <span
                className={cn('w-3 h-3 rounded-full inline-block', usedColor)}
              ></span>
              <span className="font-medium">Credits Used</span>
            </div>
            <span className="text-xl">
              {usageThisCycle.toLocaleString('en-US')}
            </span>
          </div>

          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <div className="flex justify-between items-center gap-6 rounded-lg bg-card/50 cursor-pointer hover:bg-card/70">
                <div className="flex items-center gap-2">
                  <span className="p-0 font-medium">Remaining Credits</span>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex items-center gap-6">
                  <span className="text-xl font-bold">
                    {totalRemaining.toLocaleString('en-US')}
                  </span>
                </div>
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="space-y-2 py-2">
                {sortedGrantTypes.map((type) => {
                  const amount = breakdown[type] || 0
                  const displayName = getGrantTypeDisplayName(type)
                  const isRenewable = renewableGrantTypes.includes(type)
                  return (
                    <div
                      key={type}
                      className="flex justify-between items-center py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'w-3 h-3 rounded-full inline-block',
                            grantTypeColors[type]
                          )}
                        />
                        <span>{displayName}</span>
                        {isRenewable && (
                          <span className="text-muted-foreground">
                            (renews monthly)
                          </span>
                        )}
                      </div>
                      <span>{amount.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {nextQuotaReset && (
            <div className="flex justify-between items-center rounded-lg bg-card/50">
              <span className="font-medium">Next Cycle Starts</span>
              <div className="flex flex-col items-end">
                <div>{nextQuotaReset.toLocaleDateString()}</div>
                <div className="text-sm text-muted-foreground">
                  {nextQuotaReset.toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          )}

          {balance.totalDebt > 0 && (
            <div className="flex justify-between items-center rounded-lg text-xl">
              <span className="font-medium text-red-500">Negative Balance</span>
              <span className="text-xl text-red-500">
                -{balance.totalDebt.toLocaleString('en-US')}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
