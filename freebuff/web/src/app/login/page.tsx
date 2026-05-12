'use server'

import { env } from '@codebuff/common/env'
import { headers } from 'next/headers'

import {
  getCliAuthCodeHashPrefix,
  isAuthCodeExpired,
  isCliAuthCodeCandidate,
  parseAuthCode,
} from '@/app/onboard/_helpers'
import { BackgroundBeams } from '@/components/background-beams'
import { HeroGrid } from '@/components/hero-grid'
import { LoginCard } from '@/components/login/login-card'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { logger } from '@/util/logger'

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const rawAuthCode = resolvedSearchParams?.auth_code
  const authCode = Array.isArray(rawAuthCode) ? rawAuthCode[0] : rawAuthCode
  const searchParamKeys = Object.keys(resolvedSearchParams).sort()

  if (authCode) {
    if (!isCliAuthCodeCandidate(authCode)) {
      const headerStore = await headers()
      logger.warn(
        {
          authCodeLength: authCode.length,
          authCodeTrimmedLength: authCode.trim().length,
          authCodeHashPrefix: getCliAuthCodeHashPrefix(authCode),
          authCodeParamCount: Array.isArray(rawAuthCode)
            ? rawAuthCode.length
            : 1,
          searchParamKeys,
          searchParamCount: searchParamKeys.length,
          hasCallbackUrlParam: searchParamKeys.includes('callbackUrl'),
          hasCodeParam: searchParamKeys.includes('code'),
          hasRedirectParam: searchParamKeys.includes('redirect'),
          dotCount: authCode.match(/\./g)?.length ?? 0,
          hyphenCount: authCode.match(/-/g)?.length ?? 0,
          requestHost: headerStore.get('host') ?? '',
          forwardedHost: headerStore.get('x-forwarded-host') ?? '',
          forwardedProto: headerStore.get('x-forwarded-proto') ?? '',
          originHeader: headerStore.get('origin') ?? '',
          referer: headerStore.get('referer') ?? '',
          userAgent: headerStore.get('user-agent') ?? '',
          referrerParam:
            typeof resolvedSearchParams.referrer === 'string'
              ? resolvedSearchParams.referrer
              : '',
          utmSource:
            typeof resolvedSearchParams.utm_source === 'string'
              ? resolvedSearchParams.utm_source
              : '',
          utmMedium:
            typeof resolvedSearchParams.utm_medium === 'string'
              ? resolvedSearchParams.utm_medium
              : '',
          utmCampaign:
            typeof resolvedSearchParams.utm_campaign === 'string'
              ? resolvedSearchParams.utm_campaign
              : '',
          utmContent:
            typeof resolvedSearchParams.utm_content === 'string'
              ? resolvedSearchParams.utm_content
              : '',
        },
        'Freebuff login received non-CLI-shaped auth_code',
      )
    }

    const { expiresAt } = parseAuthCode(authCode)

    if (expiresAt && isAuthCodeExpired(expiresAt)) {
      return (
        <div className="relative min-h-screen overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-dark-forest-green via-black/95 to-black" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(124,255,63,0.12),transparent_50%)]" />
          <HeroGrid />
          <BackgroundBeams />
          <main className="relative z-10 container mx-auto flex flex-col items-center justify-center min-h-screen py-20">
            <div className="w-full sm:w-1/2 md:w-1/3">
              <Card className="border-zinc-800/80 bg-zinc-950/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white">
                    Auth code expired
                  </CardTitle>
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
            </div>
          </main>
        </div>
      )
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-dark-forest-green via-black/95 to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(124,255,63,0.12),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_80%,rgba(124,255,63,0.06),transparent_50%)]" />
      <HeroGrid />
      <BackgroundBeams />
      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen py-20">
        <LoginCard authCode={authCode} />
      </main>
    </div>
  )
}
