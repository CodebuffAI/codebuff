'use client'

import { useSession } from 'next-auth/react'
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react'
import { ReactNode, useCallback, useMemo } from 'react'

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

/** Browser environment hints forwarded to the token route, where they feed
 *  the geo/VPN check as downgrade-only signals (a US IP with a non-US clock
 *  triggers deeper provider checks). Spoofing them cannot grant access. */
function buildClientHintHeaders(): Record<string, string> {
  try {
    const headers: Record<string, string> = {}
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timezone) headers['x-fb-timezone'] = timezone
    headers['x-fb-tz-offset'] = String(new Date().getTimezoneOffset())
    const languages = (navigator.languages ?? []).slice(0, 3).join(',')
    if (languages) headers['x-fb-languages'] = languages
    return headers
  } catch {
    return {}
  }
}

function useFreebuffConvexAuth() {
  const { status } = useSession()

  const fetchAccessToken = useCallback(async () => {
    if (status !== 'authenticated') {
      return null
    }

    const response = await fetch('/api/web/convex-token', {
      credentials: 'include',
      headers: buildClientHintHeaders(),
    })

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as { token?: string }
    return data.token ?? null
  }, [status])

  return useMemo(
    () => ({
      isLoading: status === 'loading',
      isAuthenticated: status === 'authenticated',
      fetchAccessToken,
    }),
    [fetchAccessToken, status],
  )
}

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode
}) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useFreebuffConvexAuth}>
      {children}
    </ConvexProviderWithAuth>
  )
}
