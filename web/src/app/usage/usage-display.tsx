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
    icon: <Gift className="h-4 w-4" />,
    label: 'Monthly Free',
    description: 'Your monthly allowance',
  },
  referral: {
    bg: 'bg-green-500',
    text: 'text-green-600 dark:text-green-400',
    gradient: 'from-green-500/70 to-green-600/70',
    icon: <Users className="h-4 w-4" />,
    label: 'Referral Bonus',
    description: 'Earned by referring others',
  },
  purchase: {
    bg: 'bg-yellow-500',
    text: 'text-yellow-600 dark:text-yellow-400',
    gradient: 'from-yellow-500/70 to-yellow-600/70',
    icon: <CreditCard className="h-4 w-4" />,
    label: 'Purchased',
    description: 'Credits you bought',
  },
  admin: {
    bg: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    gradient: 'from-red-500/70 to-red-600/70',
    icon: <Star className="h-4 w-4" />,
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
  isRenewable?: boolean
}

const CreditLeaf = ({
  type,
  amount,
  used,
  renewalDate,
  expiryDate,
  isLast = false,
  isRenewable = false,
}: CreditLeafProps) => {
  const remainingAmount = amount - used

  return (
    <div className="group relative pl-6">
      <div
        className={cn(
          'absolute left-0 w-px bg-border/20',
          isLast ? 'top-0 h-[calc(50%+2px)]' : 'top-0 bottom-0'
        )}
      />
      <div className="absolute left-0 top-1/2 w-4 h-px bg-border/30" />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 px-3 hover:bg-accent/5 rounded-md transition-colors">
        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 flex-shrink-0">
              {grantTypeInfo[type].icon}
            </div>
            <span className="font-medium text-sm">
              {grantTypeInfo[type].label}
            </span>
          </div>
          <span className="text-xs text-muted-foreground pl-7">
            {grantTypeInfo[type].description}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1 sm:mt-0 pl-7 sm:pl-0">
          <span className="font-medium text-sm">
            {remainingAmount.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">left</span>
          {isRenewable && (
            <>
              <span className="text-xs text-muted-foreground mx-0.5">•</span>
              <span className="text-xs text-muted-foreground">
                {amount.toLocaleString()} total
              </span>
            </>
          )}
        </div>
      </div>
    </div>
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
  const leftAmount = totalAmount - usedAmount
  const isRenewable = title === 'Renewable Credits'

  return (
    <div className="space-y-1 border rounded-lg p-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex flex-col sm:flex-row items-start sm:items-center py-2 px-4 hover:bg-accent/5 rounded-md transition-colors"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="text-muted-foreground">
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-left">{title}</span>
            {isRenewable && nextQuotaReset && (
              <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                Renews {nextQuotaReset.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center justify-end gap-1 mt-1 sm:mt-0 pl-7 sm:pl-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {leftAmount.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">left</span>
            {isRenewable && (
              <>
                <span className="text-xs text-muted-foreground mx-0.5">•</span>
                <span className="text-xs text-muted-foreground">
                  {totalAmount.toLocaleString()} total
                </span>
              </>
            )}
          </div>
        </div>
      </button>

      {isOpen && <div className="space-y-0.5 mt-1">{children}</div>}
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
  const nonExpiringTypes: GrantType[] = ['admin', 'purchase']

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

  // Format date for display
  const formattedRenewalDate = nextQuotaReset 
    ? nextQuotaReset.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null

  return (
    <Card className="w-full max-w-2xl mx-auto -mt-8">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-bold mb-3">Credit Balance</CardTitle>
        
        <div className="text-sm text-muted-foreground mb-3">
          We'll use your renewable credits before non-renewable ones
        </div>
        
        {totalDebt > 500 && (
          <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-md">
            <p className="text-red-500 font-medium">
              Please add more than{' '}
              {pluralize(totalDebt, 'credit').toLocaleString()} to continue
              using Codebuff.
            </p>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Credit Categories with expandable details */}
        <div className="space-y-1">
          <CreditBranch
            title="Renewable Credits"
            totalAmount={expiringTotal}
            usedAmount={expiringUsed}
            nextQuotaReset={nextQuotaReset}
          >
            {expiringTypes.map((type) => {
              const currentBalance = breakdown[type] || 0
              const principal = principals?.[type] || currentBalance
              const used = usedCredits[type]
              
              return (
                <CreditLeaf
                  key={type}
                  type={type}
                  amount={principal}
                  used={used}
                  isRenewable={true}
                />
              )
            })}
          </CreditBranch>
        </div>
        
        <CreditBranch
          title="Non-renewable Credits"
          totalAmount={nonExpiringTotal}
          usedAmount={nonExpiringUsed}
        >
          {nonExpiringTypes.map((type) => {
            const currentBalance = breakdown[type] || 0
            const principal = principals?.[type] || currentBalance
            const used = usedCredits[type]
            
            return (
              <CreditLeaf
                key={type}
                type={type}
                amount={principal}
                used={used}
                isRenewable={false}
              />
            )
          })}
        </CreditBranch>

        {/* Total remaining */}
        <div className="pt-4 mt-2 border-t">
          <div className="flex justify-between items-center md:px-6">
            <span className="text-xl font-medium">Total Left</span>
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
    <CardHeader className="pb-4">
      <div className="h-7 w-32 bg-muted rounded animate-pulse mb-3" />
      <div className="h-5 w-64 bg-muted/70 rounded animate-pulse mb-3" />
      <div className="h-10 w-full bg-blue-100/50 dark:bg-blue-900/20 rounded-md animate-pulse mb-3" />
    </CardHeader>
    
    <CardContent className="space-y-4">
      {/* Credit Category Branches */}
      <div className="space-y-1 border rounded-lg p-2 animate-pulse">
        <div className="h-12 bg-muted rounded-md" />
      </div>
      
      <div className="space-y-1 border rounded-lg p-2 animate-pulse">
        <div className="h-12 bg-muted rounded-md" />
      </div>
      
      {/* Summary section skeleton */}
      <div className="pt-4 mt-2 border-t space-y-3">
        <div className="flex justify-between items-center">
          <div className="h-5 w-32 bg-muted/70 rounded animate-pulse" />
          <div className="h-5 w-20 bg-muted/70 rounded animate-pulse" />
        </div>
        
        <div className="flex justify-between items-center">
          <div className="h-7 w-24 bg-muted rounded animate-pulse" />
          <div className="h-7 w-28 bg-muted rounded animate-pulse" />
        </div>
      </div>
    </CardContent>
  </Card>
)
