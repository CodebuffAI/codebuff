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

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const authCode = resolvedSearchParams?.auth_code as string | undefined

  if (authCode) {
    const [_fingerprintId, expiresAt, _receivedFingerprintHash] =
      authCode.split('.')

    if (parseInt(expiresAt) < Date.now()) {
      return (
        <main className="container mx-auto flex flex-col items-center py-20">
          <Card>
            <CardHeader>
              <CardTitle>Auth code expired</CardTitle>
              <CardDescription>
                Please try starting Freebuff in your terminal again.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                If the problem persists, reach out to{' '}
                {env.NEXT_PUBLIC_SUPPORT_EMAIL}.
              </p>
            </CardContent>
          </Card>
        </main>
      )
    }
  }

  return (
    <main className="py-20">
      <LoginCard authCode={authCode} />
    </main>
  )
}
