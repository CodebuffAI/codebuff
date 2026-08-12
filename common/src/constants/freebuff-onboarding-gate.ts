/**
 * Who the onboarding requirement applies to.
 *
 * The requirement is blocking: an account that owes answers cannot use free
 * mode on any surface. That makes "who does it apply to" the single most
 * dangerous decision in the feature, because getting it wrong locks out real
 * people who did nothing.
 *
 * So it is scoped by a CUTOVER INSTANT. Only accounts created at or after it
 * are ever required, and the ~203,000 accounts that predate the feature are
 * permanently exempt — they never saw the questions and must never be stopped
 * by them.
 *
 * The polarity is deliberate and load-bearing: **an unset or unparseable
 * cutover requires NOBODY.** Absence of config disables the gate rather than
 * enabling it universally. This repo has already paid for the opposite
 * convention once — a deleted env var silently activating a default is
 * documented in db-capacity-and-scaling.md §10.6 — and here that mistake would
 * present as every existing user being locked out at once.
 */

export type OnboardingRequirementInput = {
  /** When the account was created. Null/unknown is treated as pre-existing. */
  accountCreatedAt: Date | null | undefined
  /** Parsed `FREEBUFF_ONBOARDING_REQUIRED_AFTER`. Null disables the gate. */
  requiredAfter: Date | null
  /** Whether the user has answered every question. */
  complete: boolean
}

export type OnboardingRequirement =
  | { required: false; reason: 'gate_disabled' | 'pre_existing_account' | 'already_complete' | 'unknown_account_age' }
  | { required: true }

export function evaluateOnboardingRequirement(
  input: OnboardingRequirementInput,
): OnboardingRequirement {
  // No cutover configured — nobody is required. See the polarity note above.
  if (!input.requiredAfter) return { required: false, reason: 'gate_disabled' }

  // An account whose age we cannot read is treated as pre-existing. This is the
  // opposite of the trust-tier convention, where unknown age means `new`, and
  // the asymmetry is intentional: there, unknown costs a user some headroom;
  // here, unknown would cost them access entirely. When the failure is a
  // lockout, the safe default is to let them through.
  if (!input.accountCreatedAt) {
    return { required: false, reason: 'unknown_account_age' }
  }

  if (input.accountCreatedAt.getTime() < input.requiredAfter.getTime()) {
    return { required: false, reason: 'pre_existing_account' }
  }

  if (input.complete) return { required: false, reason: 'already_complete' }

  return { required: true }
}

/**
 * Parse the cutover instant.
 *
 * Returns null for anything unusable — unset, empty, or unparseable — so a
 * typo disables the gate instead of applying it to everyone.
 */
export function parseOnboardingCutover(
  raw: string | null | undefined,
): Date | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Error code surfaced to non-web clients (CLI, desktop, cloud) when a user
 *  owes answers. Distinct from every rate-limit code so clients can render a
 *  "finish setup" prompt rather than a retry countdown. */
export const ONBOARDING_REQUIRED_ERROR = 'onboarding_required'

export const ONBOARDING_REQUIRED_MESSAGE =
  'Finish setting up your account at freebuff.com to continue — it takes about 20 seconds.'
