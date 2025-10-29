import type { Request } from 'express'

/**
 * Extract auth token from x-codebuff-api-key header
 */
export function extractAuthTokenFromHeader(req: Request): string | undefined {
  const token = req.headers['x-codebuff-api-key'] as string | undefined
  // Trim any whitespace that might be present
  return token?.trim()
}
