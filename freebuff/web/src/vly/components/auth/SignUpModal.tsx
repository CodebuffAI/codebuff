'use client'

import { SignInModal } from './SignInModal'

interface SignUpModalProps {
  isOpen?: boolean
  onClose?: () => void
  onSwitchToSignIn?: () => void
}

export function SignUpModal(props: SignUpModalProps) {
  return <SignInModal isOpen={props.isOpen} onClose={props.onClose} />
}
