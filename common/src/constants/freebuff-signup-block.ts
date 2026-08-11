/**
 * Signup-refusal reasons and their user-facing copy.
 *
 * Lives in `common`, not in `packages/auth`, because the login pages are client
 * components: importing this from the auth barrel would drag `db`, `stripe` and
 * the server env schema into the browser bundle. The decision logic stays in
 * `@codebuff/auth/signup-gate`; only the vocabulary is shared.
 */

/** Why a signup was refused. Also the `?error=` code on the login redirect. */
export type SignupBlockReason =
  | 'mailbox_already_registered'
  | 'privacy_egress'
  | 'untrusted_client_ip'
  | 'ip_signup_velocity'
  | 'prefix_signup_velocity'

/**
 * Deliberately actionable and non-accusatory.
 *
 * Someone hitting `privacy_egress` is far more likely to be a privacy-conscious
 * developer on a VPN than a reseller, and the message they get should name the
 * one thing that fixes it rather than implying they did something wrong. A
 * refused signup with no explanation is indistinguishable from the product
 * being broken, and generates a support ticket instead of a retry.
 */
export const SIGNUP_BLOCK_MESSAGES: Record<SignupBlockReason, string> = {
  mailbox_already_registered:
    'An account already exists for this email address. Try signing in instead.',
  privacy_egress:
    'Accounts cannot be created over a VPN, proxy, or hosting provider. Please turn it off and try again — you can turn it back on afterwards.',
  untrusted_client_ip:
    'We could not verify where this request came from. Please try again, or contact support if it keeps happening.',
  ip_signup_velocity:
    'Too many accounts have been created from this network today. Please try again tomorrow, or contact support if you are on a shared connection.',
  prefix_signup_velocity:
    'Too many accounts have been created from this network today. Please try again tomorrow, or contact support if you are on a shared connection.',
}

/** True when `code` is a reason this module has copy for. Narrows an untrusted
 *  query-string value without a cast at every call site. */
export function isSignupBlockReason(
  code: string | null | undefined,
): code is SignupBlockReason {
  return Boolean(code) && code! in SIGNUP_BLOCK_MESSAGES
}
