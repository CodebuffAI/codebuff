'use client'

import React, { useEffect, Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from '@/components/ui/use-toast'
import { trackUpgrade } from '@/lib/trackConversions'
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

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const credits = searchParams.get('amt')
  const router = useRouter()
  const success = searchParams.get('success')
  const canceled = searchParams.get('canceled')

  const {
    handleToggleAutoTopup,
    handleThresholdChange,
    handleTopUpAmountChange,
    isEnabled: isAutoTopupEnabled,
  } = useAutoTopup()

  const enableMinimumAutoTopup = async () => {
    const { MIN_THRESHOLD_CREDITS, MIN_TOPUP_DOLLARS } = AUTO_TOPUP_CONSTANTS

    // Enable auto top-up with minimum values
    await handleToggleAutoTopup(true)
    handleThresholdChange(MIN_THRESHOLD_CREDITS)
    handleTopUpAmountChange(MIN_TOPUP_DOLLARS)
  }

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

  return (
    <div className="space-y-8">
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
