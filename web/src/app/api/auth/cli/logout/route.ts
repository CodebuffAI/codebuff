import db from '@codebuff/internal/db'


import { createLogoutDb, postLogout } from './_post'

import type { NextRequest } from 'next/server'

import { logger } from '@/util/logger'

export async function POST(req: NextRequest) {
  return postLogout({
    req,
    db: createLogoutDb(db),
    logger,
  })
}
