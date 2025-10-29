'use server'

import { env } from '@codebuff/common/env'

import { LoginCard } from '@/components/login/login-card'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'

// Server component that handles the auth code expiration check
export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const authCode = searchParams?.auth_code as string | undefined

  if (authCode) {
    const [_fingerprintId, expiresAt, _receivedfingerprintHash] =
      authCode.split('.')

    // Check for token expiration on the server side
    if (parseInt(expiresAt) < Date.now()) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Uh-oh, spaghettio!</CardTitle>
            <CardDescription>Auth code expired.</CardDescription>
          </CardHeader>
          <CardContent>
            <p>
              Please try starting Codebuff in your terminal again. If the
              problem persists, reach out to {env.NEXT_PUBLIC_SUPPORT_EMAIL}.
            </p>
          </CardContent>
        </Card>
      )
    }
  }

  return <LoginCard authCode={authCode} />
}
