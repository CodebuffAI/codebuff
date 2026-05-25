import { env } from '@codebuff/common/env'

export function getFreebuffAppUrl() {
  return env.NEXT_PUBLIC_FREEBUFF_APP_URL ?? env.NEXT_PUBLIC_CODEBUFF_APP_URL
}
