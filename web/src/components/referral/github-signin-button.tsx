'use client'

import { signIn } from 'next-auth/react'
import { useTransition } from 'react'
import posthog from 'posthog-js'

import { Button } from '@/components/ui/button'
import { Icons } from '@/components/icons'
import { toast } from '@/components/ui/use-toast'
import { sleep } from '@codebuff/common/util/promise'

interface GitHubSignInButtonProps {
  referralCode: string
  referrerName?: string
}

export const GitHubSignInButton = ({
  referralCode,
  referrerName,
}: GitHubSignInButtonProps) => {
  const [isPending, startTransition] = useTransition()

  const handleSignIn = () => {
    startTransition(async () => {
      // Store referral code in localStorage for fallback
      localStorage.setItem('referral_code', referralCode)
      if (referrerName) {
        localStorage.setItem('referrer_name', referrerName)
      }

      // Create callback URL that includes referral information
      const callbackUrl = `${window.location.origin}/onboard?referral_code=${referralCode}${referrerName ? `&referrer=${encodeURIComponent(referrerName)}` : ''}`

      console.log('🔵 GitHubSignInButton: Starting GitHub sign-in', {
        referralCode,
        referrerName,
        callbackUrl,
      })

      posthog.capture('auth.referral_github_login_started', {
        referralCode,
        referrerName,
        callbackUrl,
      })

      try {
        const result = await signIn('github', { callbackUrl })
        console.log('🔵 GitHubSignInButton: signIn result:', result)
      } catch (error) {
        console.error('🔵 GitHubSignInButton: signIn failed:', error)
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
          description: 'Would you mind trying again?',
        })
      })
    })
  }

  return (
    <Button
      onClick={handleSignIn}
      disabled={isPending}
      size="lg"
      className="flex items-center gap-2"
    >
      {isPending && <Icons.loader className="mr-2 size-4 animate-spin" />}
      <img
        src="https://s2.googleusercontent.com/s2/favicons?domain=github.com"
        className="rounded-full w-4 h-4"
        alt="GitHub logo"
      />
      Login with GitHub
    </Button>
  )
}
