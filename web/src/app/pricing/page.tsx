'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from '@/components/ui/use-toast'
import { PaidPlanFooter } from '@/components/pricing/paid-plan-footer'
import { FreePlanButton } from '@/components/pricing/free-plan-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { UsageLimits } from 'common/src/constants'
import { PricingCardSkeleton } from '@/components/pricing/pricing-card-skeleton'

export default function PricingPage() {
  const router = useRouter()
  const { data: session, status } = useSession()

  const { data: currentPlan, isLoading } = useQuery<UsageLimits>({
    queryKey: ['currentPlan', session?.user?.id],
    queryFn: async () => {
      const response = await fetch('/api/user/plan')
      if (!response.ok) throw new Error('Failed to fetch current plan')
      const data = await response.json()
      return data.plan as UsageLimits
    },
    enabled: status === 'authenticated',
  })

  const upgradeMutation = useMutation({
    mutationFn: async (plan: UsageLimits) => {
      const response = await fetch('/api/stripe/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to upgrade plan')
      }
      return response.json()
    },
    onSuccess: (data) => {
      if (data.url) {
        router.push(data.url)
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  if (status === 'unauthenticated') {
    return (
      <div className="container mx-auto py-6 px-4 sm:py-10 sm:px-6">
        <Card className="w-full max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Sign in to upgrade</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Please sign in to view and manage your subscription.</p>
          </CardContent>
          <SignInCardFooter />
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 px-4 sm:py-10 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <PricingCardSkeleton />
          <PricingCardSkeleton />
          <PricingCardSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 px-4 sm:py-10 sm:px-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Free</CardTitle>
          </CardHeader>
          <CardContent>
            <FreePlanButton
              currentPlan={currentPlan}
              onUpgrade={() => upgradeMutation.mutate(UsageLimits.FREE)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pro</CardTitle>
          </CardHeader>
          <CardContent>
            <PaidPlanFooter
              currentPlan={currentPlan}
              planName="pro"
              onUpgrade={() => upgradeMutation.mutate(UsageLimits.PRO)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>MOAR Pro</CardTitle>
          </CardHeader>
          <CardContent>
            <PaidPlanFooter
              currentPlan={currentPlan}
              planName="moar_pro"
              onUpgrade={() => upgradeMutation.mutate(UsageLimits.MOAR_PRO)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
