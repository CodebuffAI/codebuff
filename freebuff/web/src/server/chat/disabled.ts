import { NextResponse } from 'next/server'

/**
 * Kill switch for the chat product on the 512 MB web instance. While true,
 * /chat shows an unavailable notice and the chat API routes return 503 before
 * importing any of the heavy modules. Re-enabled after replacing geoip-lite
 * (~110 MB eager data load) with geoip-country (~25 MB) and fixing
 * abort/error cleanup of agent-runtime per-run state.
 */
export const CHAT_DISABLED = false

export const CHAT_DISABLED_MESSAGE =
  'Chat is temporarily unavailable for maintenance. Please check back soon.'

export function chatDisabledResponse(): NextResponse {
  return NextResponse.json(
    { error: 'chat_disabled', message: CHAT_DISABLED_MESSAGE },
    { status: 503 },
  )
}
