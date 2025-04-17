'use client'

import { useEffect, Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from '@/components/ui/use-toast'
import { trackUpgrade } from '@/lib/trackConversions'
import { useUserPlan } from '@/hooks/use-user-plan'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import Image from 'next/image'
import { AutoTopupSettings } from '@/components/auto-topup/AutoTopupSettings'
import { Sparkles } from 'lucide-react'
import { NeonGradientButton } from '@/components/ui/neon-gradient-button'
import { useAutoTopup } from '@/hooks/use-auto-topup'
import { AUTO_TOPUP_CONSTANTS } from '@/components/auto-topup/constants'

function SearchParamsHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const success = searchParams.get('success')
  const canceled = searchParams.get('canceled')

  useEffect(() => {
    if (success) {
      trackUpgrade(true)
      toast({
        title: 'Success!',
        description: 'Your payment was successful.',
      })
    }
    if (canceled) {
      toast({
        title: 'Payment canceled',
        description: 'Your payment was canceled.',
        variant: 'destructive',
      })
      router.push('/pricing')
    }
  }, [success, canceled, router])

  return null
}

function PaymentSuccessContent() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const isCreditPurchase = searchParams.get('purchase') === 'credits'
  const credits = searchParams.get('amt')
  const router = useRouter()

  const {
    handleToggleAutoTopup,
    handleThresholdChange,
    handleTopUpAmountChange,
    isEnabled: isAutoTopupEnabled,
  } = useAutoTopup()

  const { data: currentPlan, isLoading: isPlanLoading } = useUserPlan(
    isCreditPurchase ? null : session?.user?.stripe_customer_id
  )

  const enableMinimumAutoTopup = async () => {
    const { MIN_THRESHOLD_CREDITS, MIN_TOPUP_DOLLARS } = AUTO_TOPUP_CONSTANTS

    // Enable auto top-up with minimum values
    await handleToggleAutoTopup(true)
    handleThresholdChange(MIN_THRESHOLD_CREDITS)
    handleTopUpAmountChange(MIN_TOPUP_DOLLARS)
  }

  if (!isCreditPurchase && isPlanLoading) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center space-y-4">
            <Skeleton className="h-[600px] w-[600px]" />
            <Skeleton className="h-10 w-32" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      <SearchParamsHandler />

      {isCreditPurchase ? (
        <Card className="w-full max-w-2xl mx-auto relative">
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {credits
                    ? `${Number(credits).toLocaleString()} Credits Added!`
                    : 'Payment Successful!'}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Never run out of credits by enabling auto top-up
              </p>
              <AutoTopupSettings />

              <div className="flex justify-center">
                <Image
                  src="/much-credits.jpg"
                  alt="Much credits, very wow"
                  width={400}
                  height={400}
                  className="rounded-lg"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end pb-6">
            {isAutoTopupEnabled ? (
              <Link href="/usage">
                <NeonGradientButton
                  neonColors={{
                    firstColor: '#4F46E5',
                    secondColor: '#06B6D4',
                  }}
                >
                  View Usage
                </NeonGradientButton>
              </Link>
            ) : (
              <NeonGradientButton
                onClick={enableMinimumAutoTopup}
                neonColors={{
                  firstColor: '#4F46E5',
                  secondColor: '#06B6D4',
                }}
              >
                Enable Auto Top-up
              </NeonGradientButton>
            )}
          </CardFooter>
        </Card>
      ) : (
        <Card className="w-full max-w-2xl mx-auto">
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Welcome to {currentPlan}!
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Your subscription has been activated. You can now enjoy all the
                features of your new plan.
              </p>
              <div className="flex justify-center">
                <Link href="/usage">
                  <Button>View Usage</Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense>
      <PaymentSuccessContent />
    </Suspense>
  )
}
