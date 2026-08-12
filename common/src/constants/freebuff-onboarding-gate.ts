/**
 * Who gets shown the onboarding form.
 *
 * Nothing here is a permission check. Onboarding never refuses a request on any
 * surface — the entire mechanism is one redirect, to a form with a Skip button,
 * fired at most once per browser. What this decides is who is interrupted.
 *
 * The answer is: **anyone who has not answered, once.** New signups get it on
 * their way in; a long-standing account gets it the next time they sign in
 * through the web portal. There is deliberately no cutover date any more. One
 * existed when the form was a blocking gate, to keep existing users from being
 * locked out of a product they already used — with nothing to lock them out of,
 * a cutover only means never learning anything about the 200,000 accounts we
 * already have. The Skip button and the seen-cookie are what protect them now,
 * and they cost a single dismissible screen instead of an exemption.
 *
 * The polarity is deliberate: **an unset or `off` switch shows it to NOBODY.**
 * Absence of config disables the feature rather than enabling it universally.
 * This repo has already paid for the opposite convention once — a deleted env
 * var silently activating a default is documented in
 * db-capacity-and-scaling.md §10.6 — and here that mistake would present as
 * every user meeting a form nobody decided to launch.
 */

export type OnboardingRequirementInput = {
  /** Parsed `FREEBUFF_ONBOARDING_ENABLED`. */
  enabled: boolean
  /** Whether the user has answered every question. */
  complete: boolean
}

export type OnboardingRequirement =
  | { required: false; reason: 'gate_disabled' | 'already_complete' }
  | { required: true }

export function evaluateOnboardingRequirement(
  input: OnboardingRequirementInput,
): OnboardingRequirement {
  // Not switched on — nobody is asked. See the polarity note above.
  if (!input.enabled) return { required: false, reason: 'gate_disabled' }
  if (input.complete) return { required: false, reason: 'already_complete' }
  return { required: true }
}

/**
 * Read the on/off switch.
 *
 * Anything other than an explicit affirmative is off, so a typo, an empty
 * string or a deleted variable all fail the same safe way.
 */
export function parseOnboardingEnabled(raw: string | null | undefined): boolean {
  const trimmed = raw?.trim().toLowerCase()
  return trimmed === 'on' || trimmed === 'true' || trimmed === '1'
}

/**
 * Marks a browser that has already been shown the form.
 *
 * Onboarding is asked once, on the web — it never gates a request on any
 * surface, which is why there is no wire error code here and why the CLI and
 * desktop have nothing to render. The whole mechanism is one redirect that
 * fires at most once per browser.
 *
 * Set client-side on arrival at the form and read by the `/web` layout.
 * Deliberately not httpOnly and not authoritative: clearing it costs the user
 * one more chance to answer, which is the harmless direction to fail.
 */
export const ONBOARDING_SEEN_COOKIE = 'fb_onboarding_seen'

/** 180 days. Long enough that nobody is asked twice in any span they would
 *  remember, short enough that a much later question set gets another look. */
export const ONBOARDING_SEEN_TTL_SECONDS = 180 * 24 * 60 * 60
