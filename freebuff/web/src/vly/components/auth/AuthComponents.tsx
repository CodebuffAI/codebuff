'use client'

import React from 'react'
import { useSession } from 'next-auth/react'

import { Button } from '@/vly/components/ui/button'

/**
 * Where to send the user after they authenticate. On the product surfaces we
 * return them to the exact page they were on; on marketing/landing pages we
 * drop them into the web app. Kept in one place so every sign-in entry point
 * routes through the real `/login` page (Google + GitHub) instead of forcing a
 * single OAuth provider.
 */
function resolveDefaultCallbackUrl(): string {
  if (typeof window === 'undefined') return '/web'
  const { pathname, search } = window.location
  if (pathname.startsWith('/web') || pathname.startsWith('/cloud')) {
    return `${pathname}${search}`
  }
  return '/web'
}

/** Navigate to the shared login page, preserving the post-auth destination. */
function goToLogin(callbackUrl?: string) {
  if (typeof window === 'undefined') return
  const target = callbackUrl ?? resolveDefaultCallbackUrl()
  window.location.href = `/login?callbackUrl=${encodeURIComponent(target)}`
}

interface AuthVisibilityProps {
  children: React.ReactNode
}

export function SignedIn({ children }: AuthVisibilityProps) {
  const { status } = useSession()
  if (status === 'loading') return null
  return status === 'authenticated' ? <>{children}</> : null
}

export function SignedOut({ children }: AuthVisibilityProps) {
  const { status } = useSession()
  if (status === 'loading') return null
  return status !== 'authenticated' ? <>{children}</> : null
}

interface SignInButtonProps {
  children?: React.ReactNode
  mode?: 'modal' | 'redirect'
  className?: string
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  asChild?: boolean
  /** Post-auth destination; defaults to the current surface (web/cloud) or /web. */
  callbackUrl?: string
}

export function SignInButton({
  children,
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  callbackUrl,
}: SignInButtonProps) {
  // Route through the real login page (Google + GitHub) rather than forcing a
  // single provider, matching the Chat sign-in flow (/login?callbackUrl=…).
  const handleClick = () => goToLogin(callbackUrl)

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: handleClick,
    })
  }

  return (
    <Button
      className={className}
      variant={variant}
      size={size}
      onClick={handleClick}
    >
      {children || 'Sign in'}
    </Button>
  )
}

export function SignUpButton(props: SignInButtonProps) {
  return <SignInButton {...props} />
}

/**
 * Gate an action behind authentication. On public pages (e.g. `/web`,
 * community) interactive controls stay visible for logged-out visitors but
 * route them through the sign-in wall, returning to the current page after.
 *
 * Usage:
 *   const { isAuthed, requireAuth } = useRequireAuth()
 *   <button onClick={() => requireAuth(() => doThing())} />
 *   // or inside a handler: if (!requireAuth()) return
 */
export function useRequireAuth() {
  const { status } = useSession()
  const isAuthed = status === 'authenticated'

  const requireAuth = React.useCallback(
    (action?: () => void) => {
      if (isAuthed) {
        action?.()
        return true
      }
      const callbackUrl =
        typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search}`
          : '/web'
      goToLogin(callbackUrl)
      return false
    },
    [isAuthed],
  )

  return { isAuthed, requireAuth }
}
