import { env } from '@codebuff/internal/env'

/**
 * Freebuff Web runs the Codebuff SDK from Convex using a dedicated service
 * account. Calls for that account are metered for observability, but are not
 * deducted from the normal user credit ledger.
 */
export function isFreebuffWebServiceUser(
  userId: string,
  configuredUserId = env.FREEBUFF_WEB_SERVICE_USER_ID,
): boolean {
  return configuredUserId !== undefined && userId === configuredUserId
}
