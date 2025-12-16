import { getDependencies } from './_get'

import type { NextRequest } from 'next/server'

import { logger } from '@/util/logger'

interface RouteParams {
  params: Promise<{
    publisherId: string
    agentId: string
    version: string
  }>
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  return getDependencies({
    params,
    logger,
  })
}
