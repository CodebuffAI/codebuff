// Dependency-free constants shared between the server-side auth factory and the
// apps' client-side link helpers. Keep this module import-free so it is safe to
// pull into client bundles (importing the package index would drag in
// next-auth/drizzle/stripe).

/**
 * Cookie set client-side by an explicit "Link account" button (its value is the
 * path to return to) and read server-side in the signIn callback to refuse
 * forking a brand-new account. Producer (apps' link-provider.ts) and consumer
 * (create-auth-options.ts) must agree on this exact name.
 */
export const LINK_INTENT_COOKIE = 'link_intent'

/**
 * Error code appended to the return path when an explicit link is refused
 * because it would fork a brand-new account (no existing user owns the
 * provider's verified email). The connections UIs map this to a message.
 */
export const LINK_NO_MATCH_ERROR = 'link_no_match'

/**
 * Email domains refused at sign-in (before any user row is created). Used to
 * shut down abuse rings that register en masse from a throwaway / typo-squat
 * domain. Entries must be the bare lowercased registrable domain (no `@`).
 *
 * - `gkmaill.com`: typo-squat of gmail; a single operator stood up ~55
 *   auto-generated Google accounts from 2 IPs to farm free agent runs (2026-06).
 */
export const BLOCKED_EMAIL_DOMAINS: readonly string[] = ['gkmaill.com']
