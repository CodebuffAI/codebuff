'use client'

import { BackgroundBeams } from '@/components/ui/background-beams'
import { SignInButton } from '@/components/navbar/sign-in-button'
import { useSearchParams } from 'next/navigation'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import CardWithBeams from '@/components/card-with-beams'

const Home = () => {
  const searchParams = useSearchParams()
  const authCode = searchParams.get('auth_code')

  if (authCode) {
    const [_fingerprintId, expiresAt, _receivedfingerprintHash] =
      authCode.split('.')

    // Check for token expiration
    if (expiresAt < Date.now().toString()) {
      return CardWithBeams({
        title: 'Uh-oh, spaghettio!',
        description: 'Auth code expired.',
        content: (
          <p>
            Please generate a new code and reach out to support@manicode.ai if
            the problem persists.
          </p>
        ),
      })
    }
  }

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
                />
                <SignInButton
                  providerDomain="google.com"
                  providerName="google"
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
                />
                <SignInButton
                  providerDomain="google.com"
                  providerName="google"
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
