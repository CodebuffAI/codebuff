'use client'

import { useSession } from 'next-auth/react'
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react'
import { ReactNode, useCallback, useEffect, useMemo, useRef } from 'react'

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

  // Convex's `ConvexProviderWithAuth` keys its internal auth effects on the
  // IDENTITY of `fetchAccessToken`. If that identity changes while the user is
  // authenticated, Convex tears down auth (`client.clearAuth()`) and resets its
  // internal `isConvexAuthenticated` back to `null` — which makes
  // `useConvexAuth().isLoading` flip back to `true`. On a client-side navigation
  // into a project, NextAuth's `useSession` re-renders (and can briefly re-enter
  // `loading`) as the session re-resolves; if `fetchAccessToken` were recreated
  // on every `status` change, that auth teardown would race the project query
  // and strand the page on the loading screen until a hard refresh
  // re-initialized the Convex client.
  //
  // Fix: keep `fetchAccessToken` STABLE (created once) and read the live auth
  // status from a ref. This eliminates the teardown/reset churn entirely while
  // still returning `null` when unauthenticated and honoring `forceRefreshToken`.
  const statusRef = useRef(status)
  useEffect(() => {
    statusRef.current = status
  }, [status])

  const fetchAccessToken = useCallback(
    async (_args: { forceRefreshToken: boolean }) => {
      if (statusRef.current !== 'authenticated') {
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
    },
    [],
  )

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
