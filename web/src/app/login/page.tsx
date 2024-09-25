'use client'
import { useEffect } from 'react'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { SignInButton } from '@/components/navbar/sign-in-button'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'

const Home = () => {
  const searchParams = useSearchParams()
  const authCode = searchParams.get('auth_code')
  const { data: session } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (authCode && session) {
      fetch(`api/auth/cli`, {
        method: 'POST',
        body: JSON.stringify({
          authCode,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      }).then(async (response) => {
        if (!response.ok && response.status !== 409) {
          const json = await response.json()
          toast({
            title: 'Uh-oh, spaghettio!',
            description: json.message,
          })
          return
        }
        router.push('/onboard')
      })
    }

    if (!authCode && session) {
      // TODO: handle case where user was already logged in
      router.push('/onboard')
    }
  }, [router, authCode, session])

  // TODO: handle case where token has expired
  return (
    <div className="overflow-hidden">
      <BackgroundBeams />

      <main className="container mx-auto flex flex-col items-center relative z-10">
        <div className="w-full sm:w-1/2 md:w-1/3">
          {authCode ? (
            <Card>
              <CardHeader>
                <CardTitle>Confirm cli login</CardTitle>
                <CardDescription>
                  If you just logged into Manicode from the command line, please
                  select an OAuth provider below to continue.
                </CardDescription>
                <CardDescription>
                  (Otherwise, you can just close this window. Phishing attack
                  averted, phew!)
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex flex-col space-y-2">
                <SignInButton
                  providerDomain="github.com"
                  providerName="github"
                  onSignedIn={() => {}}
                />
                <SignInButton
                  providerDomain="google.com"
                  providerName="google"
                  onSignedIn={() => {}}
                />
              </CardFooter>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Login</CardTitle>
                <CardDescription>
                  Increased rate limits, priority support, and more!
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex flex-col space-y-2">
                <SignInButton
                  providerDomain="github.com"
                  providerName="github"
                  onSignedIn={() => {}}
                />
                <SignInButton
                  providerDomain="google.com"
                  providerName="google"
                  onSignedIn={() => {}}
                />
              </CardFooter>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}

export default Home
