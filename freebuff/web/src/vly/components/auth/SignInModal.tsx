'use client'

import { signIn } from 'next-auth/react'
import { Button } from '@/vly/components/ui/button'

interface SignInModalProps {
  isOpen?: boolean
  onClose?: () => void
  onSwitchToSignUp?: () => void
}

export function SignInModal({ isOpen, onClose }: SignInModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-950">Sign in</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Continue with the shared Freebuff GitHub login.
        </p>
        <div className="mt-6 flex gap-3">
          <Button
            onClick={() => signIn('github', { callbackUrl: '/web' })}
            className="flex-1"
          >
            Continue with GitHub
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
