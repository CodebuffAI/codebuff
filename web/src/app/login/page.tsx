'use client'

import { BackgroundBeams } from '@/components/ui/background-beams'
import { useSearchParams } from 'next/navigation'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import CardWithBeams from '@/components/card-with-beams'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'

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
            Please generate a new code and reach out to support@codebuff.com if
            the problem persists.
          </p>
        ),
      })
    }
  }

  // TODO: handle case where token has expired
  return (
    <main className="container mx-auto flex flex-col items-center relative z-10">
      <div className="w-full sm:w-1/2 md:w-1/3">
        {authCode ? (
          <Card>
            <CardHeader>
              <CardTitle className="mb-2">Login</CardTitle>
              <CardDescription>
                Continue to sign in to the Codebuff CLI.
                {/* If you just logged into Codebuff from the command line, please
                  select an OAuth provider below to continue. */}
              </CardDescription>
              {/* <CardDescription>
                  (Otherwise, you can just close this window. Phishing attack
                  averted, phew!)
                </CardDescription> */}
            </CardHeader>
            <SignInCardFooter />
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Login</CardTitle>
              <CardDescription>
                Increased rate limits, priority support, and more!
              </CardDescription>
            </CardHeader>
            <SignInCardFooter />
          </Card>
        )}
      </div>
    </main>
  )
}

export default Home
