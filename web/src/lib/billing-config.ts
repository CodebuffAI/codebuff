/**
 * Organization billing feature flag.
 * Set to true to re-enable org billing features across:
 * - API routes: /api/orgs/[orgId]/billing/*, /api/orgs/[orgId]/credits
 * - Stripe webhook: org-related event processing
 *
 * Search for "BILLING_DISABLED" to find related UI changes that also need restoration.
 */
export const ORG_BILLING_ENABLED = false
