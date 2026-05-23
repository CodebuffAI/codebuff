import db from '@codebuff/internal/db'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger, loggerWithContext } from '@/util/logger'

import { postComposioTools } from './_post'

import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  return postComposioTools({
    req,
    getUserInfoFromApiKey,
    db,
    logger,
    loggerWithContext,
  })
}
