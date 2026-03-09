'use client'

import { useSearchParams } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { Suspense } from 'react'

import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'

export function LoginCard({ authCode }: { authCode?: string | null }) {
  const { data: session } = useSession()
  const searchParams = useSearchParams() ?? new URLSearchParams()

  const handleContinueAsUser = () => {
    const referralCode = searchParams.get('referral_code')
    let callbackUrl = '/'

    if (authCode) {
      callbackUrl = `/onboard?${searchParams.toString()}`
    } else if (referralCode) {
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
                  ? 'Continue to sign in to Freebuff.'
                  : 'Sign in to get started with Freebuff.'}
              </CardDescription>
            </CardHeader>

            {session?.user ? (
              <>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="relative h-12 w-12 rounded-full overflow-hidden bg-secondary">
                      {session.user.image ? (
                        <img
                          src={session.user.image}
                          alt={session.user.name || ''}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-lg font-medium">
                          {session.user.name?.charAt(0) ||
                            session.user.email?.charAt(0) ||
                            'U'}
                        </div>
                      )}
                    </div>
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
              <SignInCardFooter />
            )}
          </Card>
        </Suspense>
      </div>
    </main>
  )
}
