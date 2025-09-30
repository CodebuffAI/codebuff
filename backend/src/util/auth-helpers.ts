import type { Request } from 'express'

/**
 * Extract auth token from x-codebuff-api-key header or authorization header
 */
export function extractAuthTokenFromHeader(req: Request): string | undefined {
  const token = req.headers['x-codebuff-api-key']
  if (typeof token === 'string' && token) {
    return token
  }

  const authorization = req.headers['authorization']
  if (!authorization) {
    return undefined
  }
  if (!authorization.startsWith('Bearer ')) {
    return undefined
  }
  return authorization.slice('Bearer '.length)
}
