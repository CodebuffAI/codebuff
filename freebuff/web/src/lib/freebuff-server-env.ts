import { env } from '@codebuff/internal/env'

export function getFreebuffServerAppUrl() {
  return env.NEXT_PUBLIC_FREEBUFF_APP_URL ?? env.NEXT_PUBLIC_CODEBUFF_APP_URL
}

export function getFreebuffNextAuthUrl() {
  return env.NEXTAUTH_FREEBUFF_URL ?? getFreebuffServerAppUrl()
}
