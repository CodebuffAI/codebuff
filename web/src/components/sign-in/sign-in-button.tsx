'use client'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { sleep } from '@codebuff/common/util/promise'
import { usePathname, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import posthog from 'posthog-js'
import { useEffect, useState, useTransition } from 'react'

import { toast } from '../ui/use-toast'

import type { OAuthProviderType } from 'next-auth/providers/oauth-types'

import { Icons } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { rememberLastProvider, readLastProvider } from '@/lib/last-provider'

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
  const [isLastUsed, setIsLastUsed] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams() ?? new URLSearchParams()

  useEffect(() => {
    setIsLastUsed(readLastProvider() === providerName)
  }, [providerName])

  const handleSignIn = () => {
    onClick?.()
    rememberLastProvider(providerName)

    startTransition(async () => {
      const searchParamsString = searchParams.toString()
      let callbackUrl =
        pathname + (searchParamsString ? `?${searchParamsString}` : '')

      if (pathname === '/login') {
        const authCode = searchParams.get('auth_code')
        if (authCode) {
          callbackUrl = `/onboard?${searchParams.toString()}`
        } else {
          callbackUrl = '/'
        }
      }

      posthog.capture(AnalyticsEvent.AUTH_LOGIN_STARTED, {
        provider: providerName,
        callbackUrl: callbackUrl,
      })

      try {
        await signIn(providerName, { callbackUrl })
      } catch (error) {
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
        src={`https://s2.googleusercontent.com/s2/favicons?domain=${providerDomain}&sz=64`}
        width={16}
        height={16}
        className="size-4 rounded-full"
        alt={`${providerName} logo`}
      />
      Continue with{' '}
      {providerName === 'github'
        ? 'GitHub'
        : providerName.charAt(0).toUpperCase() + providerName.slice(1)}
      {isLastUsed && (
        <span className="ml-auto rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Last used
        </span>
      )}
    </Button>
  )
}
