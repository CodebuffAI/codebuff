'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import CardWithBeams from '@/components/card-with-beams'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'

function LoginContent() {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="mb-2">{authCode ? 'Login' : 'Login'}</CardTitle>
        <CardDescription>
          {authCode
            ? 'Continue to sign in to the Codebuff CLI.'
            : 'Increased rate limits, priority support, and more!'}
        </CardDescription>
      </CardHeader>
      <SignInCardFooter />
    </Card>
  )
}

const Home = () => {
  return (
    <main className="container mx-auto flex flex-col items-center relative z-10">
      <div className="w-full sm:w-1/2 md:w-1/3">
        <Suspense>
          <LoginContent />
        </Suspense>
      </div>
    </main>
  )
}

export default Home
