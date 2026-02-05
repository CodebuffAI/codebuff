'use client'

import { env } from '@codebuff/common/env'
import { loadStripe } from '@stripe/stripe-js'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Loader2 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useState } from 'react'

import { SubscriptionSection } from './subscription-section'
import { UsageDisplay } from './usage-display'

import { CreditManagementSection } from '@/components/credits/CreditManagementSection'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CreditConfetti } from '@/components/ui/credit-confetti'
import { toast } from '@/components/ui/use-toast'

const ManageCreditsCard = ({ isLoading = false }: { isLoading?: boolean }) => {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const [showConfetti, setShowConfetti] = useState(false)
  const [purchasedAmount, setPurchasedAmount] = useState(0)

  const buyCreditsMutation = useMutation({
    mutationFn: async (credits: number) => {
      setPurchasedAmount(credits)
      const response = await fetch('/api/stripe/buy-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits }),
      })
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Failed to initiate purchase' }))
        throw new Error(errorData.error || 'Failed to initiate purchase')
      }
      return response.json()
    },
    onSuccess: async (data) => {
      if (data.sessionId) {
        const stripePromise = loadStripe(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
        const stripe = await stripePromise
        if (!stripe) {
          toast({
            title: 'Error',
            description: 'Stripe.js failed to load.',
            variant: 'destructive',
          })
          return
        }
        const { error } = await stripe.redirectToCheckout({
          sessionId: data.sessionId,
        })
        if (error) {
          console.error('Stripe redirect error:', error)
          toast({
            title: 'Error',
            description: error.message || 'Failed to redirect to Stripe.',
            variant: 'destructive',
          })
        }
      } else {
        setShowConfetti(true)
        queryClient.invalidateQueries({ queryKey: ['usageData'] })
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Purchase Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-8">
          {showConfetti && <CreditConfetti amount={purchasedAmount} />}
          <CreditManagementSection
            onPurchase={(credits) => buyCreditsMutation.mutate(credits)}
            isPurchasePending={buyCreditsMutation.isPending}
            showAutoTopup={true}
            isLoading={isLoading}
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function UsageSection() {
  const { data: session, status } = useSession()

  const {
    data: usageData,
    isLoading: isLoadingUsage,
    isError: isUsageError,
  } = useQuery({
    queryKey: ['usageData', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) throw new Error('User not logged in')
      const response = await fetch('/api/user/usage')
      if (!response.ok) throw new Error('Failed to fetch usage data')
      const data = await response.json()
      return {
        usageThisCycle: data.usageThisCycle,
        balance: data.balance,
        nextQuotaReset: data.nextQuotaReset
          ? new Date(data.nextQuotaReset)
          : null,
      }
    },
    enabled: status === 'authenticated',
  })

  const isUsageOrProfileLoading =
    isLoadingUsage || (status === 'authenticated' && !usageData)

  const email = session?.user?.email || ''
  const fallbackPortalUrl = email
    ? `${env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL}?prefilled_email=${encodeURIComponent(email)}`
    : env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL

  const billingPortalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/user/billing-portal', {
        method: 'POST',
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to open billing portal' }))
        throw new Error(error.error || 'Failed to open billing portal')
      }
      const data = await res.json()
      return data.url as string
    },
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    onError: () => {
      // Fall back to the prefilled email portal URL on error
      window.open(fallbackPortalUrl, '_blank', 'noopener,noreferrer')
      toast({
        title: 'Note',
        description: 'Opened billing portal - you may need to sign in.',
      })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <p className="text-muted-foreground">
          Track your credit usage and purchase additional credits as needed.
        </p>
        {status === 'authenticated' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => billingPortalMutation.mutate()}
            disabled={billingPortalMutation.isPending}
            className="flex-shrink-0"
          >
            {billingPortalMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opening...
              </>
            ) : (
              <>
                Billing Portal
                <ExternalLink className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        )}
      </div>
      {status === 'authenticated' && <SubscriptionSection />}
      {isUsageError && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">
              Error Loading Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              Could not load your usage data. Please try refreshing the page.
            </p>
          </CardContent>
        </Card>
      )}
      {status === 'authenticated' && !isUsageError && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <UsageDisplay
            {...(usageData || {
              usageThisCycle: 0,
              balance: {
                totalRemaining: 0,
                breakdown: {},
                totalDebt: 0,
                netBalance: 0,
                principals: {},
              },
              nextQuotaReset: null,
            })}
            isLoading={isUsageOrProfileLoading}
          />
          <ManageCreditsCard isLoading={isUsageOrProfileLoading} />
        </div>
      )}
    </div>
  )
}
