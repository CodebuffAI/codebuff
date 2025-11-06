/**
 * Utilities for parsing JSON files that may contain JavaScript-style comments.
 */

/** Remove block and line comments from a string before JSON.parse */
export const stripJsonStyleComments = (raw: string): string =>
  raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * Safely parse JSON that may include comments. Returns null on failure.
 */
export const parseJsonWithComments = <T = unknown>(raw: string): T | null => {
  try {
    const sanitized = stripJsonStyleComments(raw)
    return JSON.parse(sanitized) as T
  } catch {
    return null
  }
}
