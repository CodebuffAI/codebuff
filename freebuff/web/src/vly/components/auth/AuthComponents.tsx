'use client'

import React from 'react'
import { signIn, useSession } from 'next-auth/react'

import { Button } from '@/vly/components/ui/button'

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
}

export function SignInButton({
  children,
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
}: SignInButtonProps) {
  const handleClick = () => signIn('github', { callbackUrl: '/web' })

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
      signIn('github', { callbackUrl })
      return false
    },
    [isAuthed],
  )

  return { isAuthed, requireAuth }
}
