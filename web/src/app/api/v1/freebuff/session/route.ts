import {
  deleteFreebuffSession,
  getFreebuffSession,
  postFreebuffSession,
} from './_handlers'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger } from '@/util/logger'

import type { NextRequest } from 'next/server'

const freebuffSessionDeps = {
  getUserInfoFromApiKey,
  logger,
}

export async function GET(req: NextRequest) {
  return getFreebuffSession(req, freebuffSessionDeps)
}

export async function POST(req: NextRequest) {
  return postFreebuffSession(req, freebuffSessionDeps)
}

export async function DELETE(req: NextRequest) {
  return deleteFreebuffSession(req, { getUserInfoFromApiKey, logger })
}
