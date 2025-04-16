'use client'

import React from 'react'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { CreditBalance } from 'common/src/billing/balance-calculator'
import { GrantType } from 'common/db/schema'
import { GRANT_PRIORITIES } from 'common/src/constants/grant-priorities'
import { pluralize } from 'common/util/string'
import {
  ChevronDown,
  ChevronRight,
  Gift,
  Users,
  CreditCard,
  Star,
} from 'lucide-react'

interface UsageDisplayProps {
  usageThisCycle: number
  balance: CreditBalance
  nextQuotaReset: Date | null
}

const grantTypeInfo: Record<
  GrantType,
  {
    bg: string
    text: string
    gradient: string
    icon: React.ReactNode
    label: string
    description: string
  }
> = {
  free: {
    bg: 'bg-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
    gradient: 'from-blue-500/70 to-blue-600/70',
    icon: <Gift className="h-3 w-3" />,
    label: 'Monthly Free',
    description: 'Your monthly allowance',
  },
  referral: {
    bg: 'bg-green-500',
    text: 'text-green-600 dark:text-green-400',
    gradient: 'from-green-500/70 to-green-600/70',
    icon: <Users className="h-3 w-3" />,
    label: 'Referral Bonus',
    description: 'Earned by inviting others to Codebuff',
  },
  purchase: {
    bg: 'bg-yellow-500',
    text: 'text-yellow-600 dark:text-yellow-400',
    gradient: 'from-yellow-500/70 to-yellow-600/70',
    icon: <CreditCard className="h-3 w-3" />,
    label: 'Purchased',
    description: 'Credits you bought',
  },
  admin: {
    bg: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    gradient: 'from-red-500/70 to-red-600/70',
    icon: <Star className="h-3 w-3" />,
    label: 'Special Grant',
    description: 'Special credits from Codebuff',
  },
}

interface CreditLeafProps {
  type: GrantType
  amount: number
  used: number
  renewalDate?: Date | null
  expiryDate?: Date | null
  isLast?: boolean
}

const CreditLeaf = ({
  type,
  amount,
  used,
  renewalDate,
  expiryDate,
  isLast = false,
}: CreditLeafProps) => {
  const remainingAmount = amount - used
  const usedPercentage = amount > 0 ? Math.round((used / amount) * 100) : 0

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="group relative pl-6 py-1.5 rounded">
            <div
              className={cn(
                'absolute left-0 w-px bg-border/30',
                isLast ? 'top-0 h-[calc(50%+2px)]' : 'top-0 bottom-0'
              )}
            />
            <div className="absolute left-0 top-1/2 w-4 h-px bg-border/60" />

            <div className="flex items-center justify-between py-2 px-3 border rounded-md h-12">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 flex-shrink-0">
                  {grantTypeInfo[type].icon}
                </div>
                <div className="flex flex-col">
                  <span className="font-medium">
                    {grantTypeInfo[type].label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {grantTypeInfo[type].description}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1">
                  <span className="font-medium">
                    {remainingAmount.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    remaining
                  </span>
                </div>
                {used > 0 && (
                  <span className="text-xs text-muted-foreground">
                    of {amount.toLocaleString()} total
                  </span>
                )}
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="p-2 space-y-2">
            <div className="text-sm">{grantTypeInfo[type].description}</div>
            <div className="space-y-1 pt-1 border-t">
              {amount !== remainingAmount && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Total:</span>
                  <span>{amount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Available:</span>
                <span className="font-medium">
                  {remainingAmount.toLocaleString()}
                </span>
              </div>
              {used > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Used:</span>
                  <span>
                    {used.toLocaleString()} ({usedPercentage}%)
                  </span>
                </div>
              )}
              {renewalDate && (
                <div className="flex justify-between gap-4 text-xs pt-1 border-t">
                  <span>Renews:</span>
                  <span>{renewalDate.toLocaleDateString()}</span>
                </div>
              )}
              {expiryDate && (
                <div className="flex justify-between gap-4 text-xs">
                  <span>Expires:</span>
                  <span>{expiryDate.toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface CreditBranchProps {
  title: string
  totalAmount: number
  usedAmount?: number
  children: React.ReactNode
  isLast?: boolean
  nextQuotaReset?: Date | null
  isTopLevel?: boolean
}

const CreditBranch = ({
  title,
  totalAmount,
  usedAmount = 0,
  children,
  isLast = false,
  nextQuotaReset,
  isTopLevel = false,
}: CreditBranchProps) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const remainingAmount = totalAmount - usedAmount
  const usedPercentage =
    totalAmount > 0 ? Math.round((usedAmount / totalAmount) * 100) : 0

  return (
    <div className="space-y-2 relative">
      <div className="relative z-10">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center bg-card hover:bg-accent/50 py-3 px-4 rounded-lg transition-all duration-200 border-2 border-border/70 shadow-sm hover:shadow-md"
          aria-expanded={isOpen}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-2">
              <div className="text-green-400">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
              <span className="font-medium text-[15px]">{title}</span>
            </div>
            {title === 'Monthly' && nextQuotaReset && (
              <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-400/20 px-2 py-0.5 ml-0 sm:ml-2">
                Renews {nextQuotaReset.toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="flex-1 flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <span className="font-medium text-[15px]">
                {remainingAmount.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">left</span>
            </div>
            <span
              className={cn(
                'text-xs font-medium',
                usedPercentage > 80
                  ? 'text-red-400'
                  : usedPercentage > 50
                    ? 'text-yellow-400'
                    : 'text-green-400'
              )}
            >
              {usedAmount > 0
                ? `${usedPercentage}% used`
                : `${totalAmount.toLocaleString()} total`}
            </span>
          </div>
        </button>
      </div>

      {isOpen && <div className="pl-4 space-y-1.5 mt-2">{children}</div>}
    </div>
  )
}

export const UsageDisplay = ({
  usageThisCycle,
  balance,
  nextQuotaReset,
}: UsageDisplayProps) => {
  const { totalRemaining, breakdown, totalDebt, principals } = balance

  // Calculate used credits per type
  const usedCredits: Record<GrantType, number> = {
    free: 0,
    referral: 0,
    purchase: 0,
    admin: 0,
  }

  Object.entries(GRANT_PRIORITIES).forEach(([type]) => {
    const typeKey = type as GrantType
    const currentBalance = breakdown[typeKey] || 0
    const principal = principals?.[typeKey] || currentBalance
    usedCredits[typeKey] = Math.max(0, principal - currentBalance)
  })

  // Group credits by expiration type
  const expiringTypes: GrantType[] = ['free', 'referral']
  const nonExpiringTypes: GrantType[] = ['purchase', 'admin']

  const expiringTotal = expiringTypes.reduce(
    (acc, type) => acc + (principals?.[type] || breakdown[type] || 0),
    0
  )

  const expiringUsed = expiringTypes.reduce(
    (acc, type) => acc + (usedCredits[type] || 0),
    0
  )

  const nonExpiringTotal = nonExpiringTypes.reduce(
    (acc, type) => acc + (principals?.[type] || breakdown[type] || 0),
    0
  )

  const nonExpiringUsed = nonExpiringTypes.reduce(
    (acc, type) => acc + (usedCredits[type] || 0),
    0
  )

  return (
    <Card className="w-full max-w-2xl mx-auto -mt-8">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-bold mb-1">Credit Balance</CardTitle>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            Credits are consumed in order from top to bottom
          </span>
        </div>

        {totalDebt > 0 && (
          <div className="mt-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-md">
            <p className="text-red-500 font-medium">
              Please purchase {pluralize(totalDebt, 'credit').toLocaleString()}{' '}
              to continue using Codebuff.
            </p>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Monthly Credits */}
        <CreditBranch
          title="Renewable"
          totalAmount={expiringTotal}
          usedAmount={expiringUsed}
          nextQuotaReset={nextQuotaReset}
          isLast={nonExpiringTotal <= 0}
          isTopLevel={true}
        >
          {expiringTypes.map((type, index, array) => {
            const currentBalance = breakdown[type] || 0
            const principal = principals?.[type] || currentBalance
            const used = usedCredits[type]
            return principal > 0 ? (
              <CreditLeaf
                key={type}
                type={type}
                amount={principal}
                used={used}
                renewalDate={nextQuotaReset}
                isLast={
                  index === array.length - 1 ||
                  !array
                    .slice(index + 1)
                    .some((t) => (principals?.[t] || breakdown[t] || 0) > 0)
                }
              />
            ) : null
          })}
        </CreditBranch>

        {/* Non-expiring Credits */}
        {(nonExpiringTotal > 0 || nonExpiringUsed > 0) && (
          <CreditBranch
            title="Non-renewable"
            totalAmount={nonExpiringTotal}
            usedAmount={nonExpiringUsed}
            isLast={true}
            isTopLevel={true}
          >
            {nonExpiringTypes.map((type, index, array) => {
              const currentBalance = breakdown[type] || 0
              const principal = principals?.[type] || currentBalance
              const used = usedCredits[type]
              return principal > 0 ? (
                <CreditLeaf
                  key={type}
                  type={type}
                  amount={principal}
                  used={used}
                  isLast={
                    index === array.length - 1 ||
                    !array
                      .slice(index + 1)
                      .some((t) => (principals?.[t] || breakdown[t] || 0) > 0)
                  }
                />
              ) : null
            })}
          </CreditBranch>
        )}

        <div className="border-t pt-4 mt-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Total Available</span>
            <span className="text-xl font-bold">
              {totalRemaining.toLocaleString()}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export const UsageDisplaySkeleton = () => (
  <Card className="w-full max-w-2xl mx-auto -mt-8">
    <CardHeader>
      <div className="h-8 w-48 bg-muted rounded animate-pulse" />
      <div className="h-6 w-64 bg-muted rounded animate-pulse" />
    </CardHeader>
    <CardContent className="space-y-6">
      {/* Monthly Credits skeleton */}
      <div className="space-y-4">
        <div className="h-12 bg-muted rounded animate-pulse" />
        <div className="pl-4 space-y-3 relative">
          {[1, 2].map((i) => (
            <div key={i} className="relative pl-6">
              <div
                className={cn(
                  'absolute left-0 w-px bg-muted/30',
                  i === 2 ? 'top-0 h-[calc(50%+2px)]' : 'top-0 bottom-0'
                )}
              />
              <div className="absolute left-0 top-1/2 w-4 h-px bg-muted/30" />
              <div className="h-8 bg-muted/80 rounded-md animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Non-expiring Credits skeleton */}
      <div className="space-y-4">
        <div className="h-12 bg-muted rounded animate-pulse" />
        <div className="pl-4 space-y-3 relative">
          <div key={1} className="relative pl-6">
            <div className="absolute left-0 top-0 h-[calc(50%+2px)] w-px bg-muted/30" />
            <div className="absolute left-0 top-1/2 w-4 h-px bg-muted/30" />
            <div className="h-8 bg-muted/80 rounded-md animate-pulse" />
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
)
