'use client'

import { useSession } from 'next-auth/react'
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react'
import { ReactNode, useCallback, useMemo } from 'react'

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

function useFreebuffConvexAuth() {
  const { status } = useSession()

  const fetchAccessToken = useCallback(async () => {
    if (status !== 'authenticated') {
      return null
    }

    const response = await fetch('/api/web/convex-token', {
      credentials: 'include',
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
