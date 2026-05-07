import { env } from '@codebuff/internal/env'

import { createLoginStatusDb } from './_db'
import { getLoginStatus } from './_get'
import { logger } from '@/util/logger'

export async function GET(req: Request) {
  return getLoginStatus({
    req,
    db: createLoginStatusDb(),
    logger,
    secret: env.NEXTAUTH_SECRET,
  })
}
