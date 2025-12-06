/**
 * Utilities for parsing and normalizing agent identifiers
 */

/**
 * Extracts the simple agent ID from a potentially qualified ID.
 * Handles formats like:
 * - "my-agent" -> "my-agent"
 * - "publisher/my-agent" -> "my-agent"
 * - "publisher/my-agent@1.0.0" -> "my-agent"
 */
export function getSimpleAgentId(qualifiedId: string): string {
  return qualifiedId.split('/').pop()?.split('@')[0] ?? qualifiedId
}
