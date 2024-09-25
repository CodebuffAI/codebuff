'use client'

import { useState, useTransition } from 'react'
import { signIn } from 'next-auth/react'

import { Icons } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { OAuthProviderType } from 'next-auth/providers/oauth-types'
import { sleep } from 'common/util/helpers'
import { toast } from '../ui/use-toast'

export const SignInButton = ({
  providerName,
  providerDomain,
}: {
  providerName: OAuthProviderType
  providerDomain: string
}) => {
  const [isPending, startTransition] = useTransition()

  const handleSignIn = () => {
    startTransition(async () => {
      await signIn(providerName)
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
      {providerName.charAt(0).toUpperCase() + providerName.slice(1)}
    </Button>
  )
}
