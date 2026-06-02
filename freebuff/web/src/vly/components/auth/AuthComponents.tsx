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
