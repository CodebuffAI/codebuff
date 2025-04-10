'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

const renewableGrantTypes: GrantType[] = ['free', 'referral']

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

export const UsageDisplay = ({
  usageThisCycle,
  balance,
  nextQuotaReset,
}: UsageDisplayProps) => {
  const [isOpen, setIsOpen] = React.useState(false)

  const { totalRemaining, breakdown } = balance
  const totalAvailable = totalRemaining + usageThisCycle

  const sortedGrantTypes = (Object.keys(breakdown) as GrantType[]).sort(
    (a, b) => GRANT_PRIORITIES[a] - GRANT_PRIORITIES[b]
  )

  const calculatePercentage = (amount: number) =>
    totalAvailable > 0 ? (amount / totalAvailable) * 100 : 0

  const usagePercentage = calculatePercentage(usageThisCycle)

  return (
    <Card className="w-full max-w-2xl mx-auto -mt-8">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Usage Statistics</CardTitle>
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
          <div className="space-y-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
            <p className="text-xs text-muted-foreground">
              Credits are used in order of the types shown above
            </p>
          </div>
        </div>

        <div className="grid gap-4">
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
                  const amount = breakdown[type]
                  if (!amount || amount <= 0) return null
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
                            'w-2 h-2 rounded-full inline-block',
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

          <div className="flex justify-between items-center rounded-lg bg-card/50">
            <div className="flex items-center gap-2">
              <span className="font-medium">Credits Used</span>
              <span
                className={cn('w-3 h-3 rounded-full inline-block', usedColor)}
              ></span>
            </div>
            <span className="text-xl">
              {usageThisCycle.toLocaleString('en-US')}
            </span>
          </div>

          {nextQuotaReset && (
            <div className="flex justify-between items-center rounded-lg bg-card/50">
              <span className="font-medium">Next Cycle Starts</span>
              <div className="text-right">
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
        </div>
      </CardContent>
    </Card>
  )
}
