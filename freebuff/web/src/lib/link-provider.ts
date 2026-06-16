import { LINK_INTENT_COOKIE } from '@codebuff/auth/constants'
import { signIn } from 'next-auth/react'

// Begin linking an additional OAuth provider to the CURRENT signed-in user.
// Sets a short-lived `link_intent` cookie (its value is where to return) which
// the server-side signIn callback reads to refuse forking a brand-new account
// when the provider's email matches no existing user. See packages/auth.
const LINK_INTENT_TTL_SECONDS = 600

export function startProviderLink(provider: string, returnPath: string): void {
  if (typeof document !== 'undefined') {
    document.cookie = `${LINK_INTENT_COOKIE}=${encodeURIComponent(
      returnPath,
    )}; path=/; max-age=${LINK_INTENT_TTL_SECONDS}; samesite=lax`
  }
  void signIn(provider, { callbackUrl: returnPath })
}

// Clear the link-intent cookie once the user has returned from a link attempt,
// so a later unrelated sign-in in the same browser isn't treated as a link.
export function clearLinkIntent(): void {
  if (typeof document !== 'undefined') {
    document.cookie = `${LINK_INTENT_COOKIE}=; path=/; max-age=0; samesite=lax`
  }
}
