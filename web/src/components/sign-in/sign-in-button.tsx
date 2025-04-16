'use client'

import { sleep } from 'common/util/promise'
import { OAuthProviderType } from 'next-auth/providers/oauth-types'
import { signIn } from 'next-auth/react'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { useTransition } from 'react'

import { toast } from '../ui/use-toast'

import { Icons } from '@/components/icons'
import { Button } from '@/components/ui/button'

export const SignInButton = ({
  providerName,
  providerDomain,
}: {
  providerName: OAuthProviderType
  providerDomain: string
}) => {
  const [isPending, startTransition] = useTransition()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleSignIn = () => {
    startTransition(async () => {
      let callbackUrl = pathname

      if (pathname === '/login') {
        const authCode = searchParams.get('auth_code')
        if (authCode) {
          // Logging in from CLI
          callbackUrl = `/onboard?${searchParams.toString()}`
        } else {
          // Logging in from website
          const referralCode = searchParams.get('referral_code')
          if (referralCode) {
            // Store referral code in localStorage to be handled after successful sign in
            localStorage.setItem('referral_code', referralCode)
          }
          callbackUrl = '/'
        }
      }

      posthog.capture('auth.login_started', {
        provider: providerName,
        callbackUrl: callbackUrl,
      })
      await signIn(providerName, { callbackUrl })
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
      />
      Continue with{' '}
      {providerName === 'github'
        ? 'GitHub'
        : providerName.charAt(0).toUpperCase() + providerName.slice(1)}
    </Button>
  )
}
