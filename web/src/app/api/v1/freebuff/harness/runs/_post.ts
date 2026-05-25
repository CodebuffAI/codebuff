import { after, NextResponse } from 'next/server'

import { runVlyFreebuffAgent } from '@/server/vly-harness/run-vly-freebuff-agent'
import { vlyHarnessRunRequestSchema } from '@/server/vly-harness/types'
import { extractApiKeyFromHeader } from '@/util/auth'

import type { NextRequest } from 'next/server'

export async function postVlyFreebuffHarnessRun(req: NextRequest) {
  const codebuffApiKey = extractApiKeyFromHeader(req)
  if (!codebuffApiKey) {
    return NextResponse.json(
      { error: 'Codebuff API key is required' },
      { status: 401 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = vlyHarnessRunRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.format() },
      { status: 400 },
    )
  }

  const runId = parsed.data.runId ?? crypto.randomUUID()

  after(() => {
    void runVlyFreebuffAgent({
      request: { ...parsed.data, runId },
      codebuffApiKey,
      callbackSecret: process.env.FREEBUFF_TO_VLY_CALLBACK_SECRET,
    }).catch((error) => {
      console.error('[vly-freebuff-harness] run failed', error)
    })
  })

  return NextResponse.json({ success: true, runId }, { status: 202 })
}
