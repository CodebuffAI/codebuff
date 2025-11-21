/**
 * Constants and utilities for validation error handling
 */

/**
 * Special error ID for network-related validation failures
 */
export const NETWORK_ERROR_ID = 'network_error'

/**
 * Filters out network errors from a list of validation errors.
 * Network errors are treated separately from agent validation errors
 * because they indicate connectivity issues rather than code problems.
 */
export function filterNetworkErrors(
  errors: Array<{ id: string; message: string }>,
): Array<{ id: string; message: string }> {
  return errors.filter((error) => error.id !== NETWORK_ERROR_ID)
}
