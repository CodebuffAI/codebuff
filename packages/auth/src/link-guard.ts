import { LINK_NO_MATCH_ERROR } from './constants'

const GOOGLE_PROVIDER = 'google'

// Pure decision helpers for the sign-in security gates, split from all I/O so
// they're trivially unit-testable (mirrors the pure/IO split in
// packages/billing referral-qualification.ts). create-auth-options.ts does the
// DB/cookie reads and delegates the decisions here.

/** Append `?error=<code>` (or `&error=`) to a return path. */
export function appendErrorParam(returnPath: string, code: string): string {
  const sep = returnPath.includes('?') ? '&' : '?'
  return `${returnPath}${sep}error=${code}`
}

/**
 * Reject a Google sign-in unless the email is *explicitly* verified. We treat
 * anything other than a literal `true` (false, missing, malformed) as unsafe,
 * because `allowDangerousEmailAccountLinking` would otherwise auto-link an
 * unverified email onto a matching existing account. Non-Google providers are
 * never rejected here (GitHub returns only provider-verified emails).
 */
export function isUnverifiedGoogleEmail(params: {
  provider: string
  emailVerified: unknown
}): boolean {
  return params.provider === GOOGLE_PROVIDER && params.emailVerified !== true
}

/**
 * Pure fork-guard decision for an explicit "Link account" attempt. Returns
 * `true` to allow the sign-in, or a redirect path (string) to abort with an
 * error.
 *
 * - account already linked → returning user, allow.
 * - no linked account but some user owns this verified email → NextAuth will
 *   auto-link to that user, allow.
 * - otherwise NextAuth would create a brand-new user and silently switch the
 *   session to it (forking the account) → block.
 */
export function decideExplicitLink(params: {
  accountExists: boolean
  emailUserExists: boolean
  returnPath: string
}): true | string {
  const { accountExists, emailUserExists, returnPath } = params
  if (accountExists) return true
  if (emailUserExists) return true
  return appendErrorParam(returnPath, LINK_NO_MATCH_ERROR)
}
