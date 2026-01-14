import db from '@codebuff/internal/db'

import { logger } from '@/util/logger'

import { createLogoutDb, postLogout } from './_post'

import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  return postLogout({
    req,
    db: createLogoutDb(db),
    logger,
  })
}
