'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useTransition } from 'react'

import { Icons } from '../icons'
import { Button } from '../ui/button'

import type { OAuthProviderType } from 'next-auth/providers/oauth-types'

export function SignInButton({
  providerName,
  providerDomain,
}: {
  providerName: OAuthProviderType
  providerDomain: string
}) {
  const [isPending, startTransition] = useTransition()
  const pathname = usePathname()
  const searchParams = useSearchParams() ?? new URLSearchParams()

  const handleSignIn = () => {
    startTransition(async () => {
      const searchParamsString = searchParams.toString()
      let callbackUrl =
        pathname + (searchParamsString ? `?${searchParamsString}` : '')

      if (pathname === '/login') {
        const authCode = searchParams.get('auth_code')
        const referralCode = searchParams.get('referral_code')

        if (authCode) {
          callbackUrl = `/onboard?${searchParams.toString()}`
        } else if (referralCode) {
          localStorage.setItem('referral_code', referralCode)
          callbackUrl = `${window.location.origin}/onboard?referral_code=${referralCode}`
        } else {
          callbackUrl = '/'
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
      className="flex items-center gap-2 w-full bg-zinc-900 border border-zinc-700 text-white hover:border-acid-matrix/60 hover:shadow-[0_0_20px_rgba(124,255,63,0.15)] transition-all duration-300"
    >
      {isPending ? (
        <Icons.loader className="mr-2 size-4 animate-spin" />
      ) : (
        <img
          src={`https://s2.googleusercontent.com/s2/favicons?domain=${providerDomain}`}
          className="rounded-full"
          alt={`${providerName} logo`}
        />
      )}
      Continue with {displayName}
    </Button>
  )
}
