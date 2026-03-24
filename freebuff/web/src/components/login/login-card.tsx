'use client'

import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { Suspense } from 'react'

import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
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
    <div className="container mx-auto flex flex-col items-center">
      <div className="w-full max-w-sm">
        <Suspense>
          {/* Logo + brand */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  boxShadow: '0 0 40px 10px rgba(124, 255, 63, 0.15), 0 0 80px 20px rgba(124, 255, 63, 0.08)',
                }}
              />
              <Image
                src="/logo-icon.png"
                alt="Freebuff"
                width={48}
                height={48}
                className="relative rounded-sm"
              />
            </div>
            <span className="text-2xl tracking-widest font-serif text-white">
              freebuff
            </span>
          </div>

          <Card className="border-zinc-800/80 bg-zinc-950/80 backdrop-blur-sm gradient-border-shine">
            <CardHeader className="text-center">
              <CardDescription className="text-white text-base">
                {authCode
                  ? 'Continue to sign in to Freebuff.'
                  : 'Sign in to get started with Freebuff.'}
              </CardDescription>
            </CardHeader>

            {session?.user ? (
              <>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-3 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
                    <div className="relative h-10 w-10 rounded-full overflow-hidden bg-secondary flex-shrink-0">
                      {session.user.image ? (
                        <img
                          src={session.user.image}
                          alt={session.user.name || ''}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-sm font-medium text-acid-matrix">
                          {session.user.name?.charAt(0) ||
                            session.user.email?.charAt(0) ||
                            'U'}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{session.user.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {session.user.email}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Continue with this account or sign in with another.
                  </p>
                </CardContent>
                <CardFooter className="flex flex-col space-y-2">
                  <Button
                    onClick={handleContinueAsUser}
                    className="w-full bg-acid-matrix/90 text-black font-medium hover:bg-acid-matrix hover:shadow-[0_0_20px_rgba(124,255,63,0.3)] transition-all duration-300"
                  >
                    Continue as {session.user.name || session.user.email}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleUseAnotherAccount}
                    className="w-full border-zinc-700 hover:border-acid-matrix/40 hover:text-acid-matrix transition-all duration-300"
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
    </div>
  )
}
