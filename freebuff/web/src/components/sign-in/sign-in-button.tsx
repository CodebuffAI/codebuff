'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useEffect, useState, useTransition } from 'react'

import { Icons } from '../icons'
import { Button } from '../ui/button'

import {
  getCliAuthOnboardPath,
  isCliAuthCodeCandidate,
} from '@/lib/cli-auth-code-shape'
import { rememberLastProvider, readLastProvider } from '@/lib/last-provider'

import type { OAuthProviderType } from 'next-auth/providers/oauth-types'

export function SignInButton({
  providerName,
  providerDomain,
}: {
  providerName: OAuthProviderType
  providerDomain: string
}) {
  const [isPending, startTransition] = useTransition()
  const [isLastUsed, setIsLastUsed] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams() ?? new URLSearchParams()

  useEffect(() => {
    setIsLastUsed(readLastProvider() === providerName)
  }, [providerName])

  const handleSignIn = () => {
    rememberLastProvider(providerName)
    startTransition(async () => {
      const searchParamsString = searchParams.toString()
      let callbackUrl =
        pathname + (searchParamsString ? `?${searchParamsString}` : '')

      const referrer = searchParams.get('referrer')
      if (referrer) {
        localStorage.setItem('freebuff_referrer', referrer)
      }

      if (pathname === '/login') {
        const authCode = searchParams.get('auth_code')

        if (authCode && isCliAuthCodeCandidate(authCode)) {
          callbackUrl = getCliAuthOnboardPath(searchParams, authCode)
        } else {
          callbackUrl = searchParams.get('callbackUrl') || '/'
        }
      }

      await signIn(providerName, { callbackUrl })
    })
  }

  const displayName =
    providerName === 'github'
      ? 'GitHub'
      : providerName.charAt(0).toUpperCase() + providerName.slice(1)

  return (
    <Button
      onClick={handleSignIn}
      disabled={isPending}
      className="flex items-center gap-2 w-full bg-zinc-900 border border-zinc-700 text-white hover:bg-zinc-800 hover:border-acid-matrix/60 hover:shadow-[0_0_20px_rgba(124,255,63,0.15)] transition-all duration-300"
    >
      {isPending ? (
        <Icons.loader className="mr-2 size-4 animate-spin" />
      ) : (
        <img
          src={`https://s2.googleusercontent.com/s2/favicons?domain=${providerDomain}&sz=64`}
          width={16}
          height={16}
          className="size-4 rounded-full"
          alt={`${providerName} logo`}
        />
      )}
      Continue with {displayName}
      {isLastUsed && (
        <span className="ml-auto rounded-full border border-acid-matrix/50 bg-acid-matrix/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-acid-matrix">
          Last used
        </span>
      )}
    </Button>
  )
}
