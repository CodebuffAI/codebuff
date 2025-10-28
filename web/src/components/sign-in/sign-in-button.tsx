'use client'

import { sleep } from '@codebuff/common/util/promise'
import { usePathname, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import posthog from 'posthog-js'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { useTransition } from 'react'

import { toast } from '../ui/use-toast'

import type { OAuthProviderType } from 'next-auth/providers/oauth-types'

import { Icons } from '@/components/icons'
import { Button } from '@/components/ui/button'

export const SignInButton = ({
  providerName,
  providerDomain,
  onClick, // Additional handler for analytics/tracking
}: {
  providerName: OAuthProviderType
  providerDomain: string
  onClick?: () => void
}) => {
  const [isPending, startTransition] = useTransition()
  const pathname = usePathname()
  const searchParams = useSearchParams() ?? new URLSearchParams()

  const handleSignIn = () => {
    onClick?.()

    startTransition(async () => {
      // Include search params in callback URL to preserve context
      const searchParamsString = searchParams.toString()
      let callbackUrl =
        pathname + (searchParamsString ? `?${searchParamsString}` : '')

      console.log('🔵 SignInButton: Starting sign-in process', {
        pathname,
        searchParams: Object.fromEntries(searchParams.entries()),
        initialCallbackUrl: callbackUrl,
      })

      if (pathname === '/login') {
        const authCode = searchParams.get('auth_code')
        const referralCode = searchParams.get('referral_code')

        console.log('🔵 SignInButton: Login page detected', {
          authCode: !!authCode,
          referralCode,
        })

        if (authCode) {
          // Logging in from CLI
          callbackUrl = `/onboard?${searchParams.toString()}`
          console.log(
            '🔵 SignInButton: CLI flow detected, callback:',
            callbackUrl,
          )
        } else if (referralCode) {
          // Store referral code and use absolute URL for better preservation
          localStorage.setItem('referral_code', referralCode)
          callbackUrl = `${window.location.origin}/onboard?referral_code=${referralCode}`
          console.log(
            '🔵 SignInButton: Referral flow detected, absolute callback:',
            callbackUrl,
          )
        } else {
          // Regular web login
          callbackUrl = '/'
          console.log(
            '🔵 SignInButton: Regular web login, callback:',
            callbackUrl,
          )
        }
      } else {
        // For non-login pages, store referral_code if present
        const referralCode = searchParams.get('referral_code')
        if (referralCode) {
          localStorage.setItem('referral_code', referralCode)
          console.log(
            '🔵 SignInButton: Stored referral code in localStorage:',
            referralCode,
          )
        }
      }

      posthog.capture(AnalyticsEvent.AUTH_LOGIN_STARTED, {
        provider: providerName,
        callbackUrl: callbackUrl,
      })

      try {
        console.log('🔵 SignInButton: Calling signIn with:', {
          providerName,
          callbackUrl,
        })

        // Referral code already stored in localStorage above for fallback

        const result = await signIn(providerName, { callbackUrl })
        console.log('🔵 SignInButton: signIn result:', result)
      } catch (error) {
        console.error('🔵 SignInButton: signIn failed:', error)
        toast({
          title: 'Sign in failed',
          description:
            'Please try again or contact support if the problem persists.',
        })
        return
      }

      await sleep(10000).then(() => {
        toast({
          title: 'Uh-oh this is taking a while...',
          description: 'Would you mind you trying again?',
        })
      })
    })
  }

  return (
    <Button
      onClick={handleSignIn}
      disabled={isPending}
      className="flex items-center gap-2"
    >
      {isPending && <Icons.loader className="mr-2 size-4 animate-spin" />}
      <img
        src={`https://s2.googleusercontent.com/s2/favicons?domain=${providerDomain}`}
        className="rounded-full"
        alt={`${providerName} logo`}
      />
      Continue with{' '}
      {providerName === 'github'
        ? 'GitHub'
        : providerName.charAt(0).toUpperCase() + providerName.slice(1)}
    </Button>
  )
}
