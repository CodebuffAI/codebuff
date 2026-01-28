'use client'

import { env } from '@codebuff/common/env'
import { loadStripe } from '@stripe/stripe-js'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useState } from 'react'

import { UsageDisplay } from './usage-display'

import { CreditManagementSection } from '@/components/credits/CreditManagementSection'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CreditConfetti } from '@/components/ui/credit-confetti'
import { toast } from '@/components/ui/use-toast'

const ManageCreditsCard = ({ isLoading = false }: { isLoading?: boolean }) => {
  const { data: session } = useSession()
  const email = encodeURIComponent(session?.user?.email || '')
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
            billingPortalUrl={`${env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL}?prefilled_email=${email}`}
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

  return (
    <div className="space-y-6">
      {' '}
      <div className="space-y-1 mb-6">
        <p className="text-muted-foreground">
          Track your credit usage and purchase additional credits as needed.
        </p>
      </div>
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
