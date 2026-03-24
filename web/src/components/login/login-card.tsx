'use client'

import { useSearchParams } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { Suspense, useCallback, useRef, useState } from 'react'

import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { TurnstileWidget } from '@/components/turnstile-widget'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export function LoginCard({ authCode }: { authCode?: string | null }) {
  const { data: session } = useSession()
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const [turnstileVerified, setTurnstileVerified] = useState(
    !TURNSTILE_SITE_KEY,
  )
  const turnstileErrorShownRef = useRef(false)

  const handleTurnstileVerify = useCallback(async (token: string) => {
    try {
      const response = await fetch('/api/auth/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const result = await response.json()
      if (result.success) {
        setTurnstileVerified(true)
        turnstileErrorShownRef.current = false
      } else {
        toast({
          title: 'Verification failed',
          description: 'Please refresh the page and try again.',
        })
      }
    } catch {
      toast({
        title: 'Verification failed',
        description: 'Please refresh the page and try again.',
      })
    }
  }, [])

  const handleTurnstileError = useCallback((errorCode: string) => {
    console.error('Turnstile error:', errorCode)
    if (!turnstileErrorShownRef.current) {
      turnstileErrorShownRef.current = true
      toast({
        title: 'Verification error',
        description: 'Please refresh the page and try again.',
      })
    }
  }, [])

  const handleTurnstileExpired = useCallback(() => {
    setTurnstileVerified(false)
  }, [])

  const handleContinueAsUser = () => {
    const referralCode = searchParams.get('referral_code')
    let callbackUrl = '/'

    if (authCode) {
      // CLI flow
      callbackUrl = `/onboard?${searchParams.toString()}`
    } else if (referralCode) {
      // Referral flow
      callbackUrl = `/onboard?referral_code=${referralCode}`
    }

    window.location.href = callbackUrl
  }

  const handleUseAnotherAccount = () => {
    const searchParamsString = searchParams.toString()
    const referralCode = searchParams.get('referral_code')

    let callbackUrl = '/login'
    if (authCode) {
      callbackUrl = `/onboard?${searchParamsString}`
    } else if (referralCode) {
      callbackUrl = `/onboard?referral_code=${referralCode}`
      // Store referral code as fallback
      localStorage.setItem('referral_code', referralCode)
    }

    signIn('github', { callbackUrl, prompt: 'login' })
  }

  return (
    <main className="container mx-auto flex flex-col items-center relative z-10">
      <div className="w-full sm:w-1/2 md:w-1/3">
        <Suspense>
          <Card>
            <CardHeader>
              <CardTitle className="mb-2">
                {authCode ? 'Authenticate' : 'Login'}
              </CardTitle>
              <CardDescription>
                {authCode
                  ? 'Continue to sign in to the Codebuff CLI.'
                  : 'Increased rate limits, priority support, and more!'}
              </CardDescription>
            </CardHeader>

            {session?.user ? (
              <>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage
                        src={session.user.image || ''}
                        alt={session.user.name || ''}
                      />
                      <AvatarFallback>
                        {session.user.name?.charAt(0) ||
                          session.user.email?.charAt(0) ||
                          'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium">{session.user.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {session.user.email}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Do you want to use this account or sign in with another?
                  </p>
                </CardContent>
                <CardFooter className="flex flex-col space-y-2">
                  <Button onClick={handleContinueAsUser} className="w-full">
                    Continue as {session.user.name || session.user.email}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleUseAnotherAccount}
                    className="w-full"
                  >
                    Use another account
                  </Button>
                </CardFooter>
              </>
            ) : (
              <>
                {TURNSTILE_SITE_KEY && (
                  <CardContent className="flex justify-center">
                    <TurnstileWidget
                      siteKey={TURNSTILE_SITE_KEY}
                      onVerify={handleTurnstileVerify}
                      onError={handleTurnstileError}
                      onExpired={handleTurnstileExpired}
                    />
                  </CardContent>
                )}
                <SignInCardFooter disabled={!turnstileVerified} />
              </>
            )}
          </Card>
        </Suspense>
      </div>
    </main>
  )
}
