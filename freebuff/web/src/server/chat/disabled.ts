import { NextResponse } from 'next/server'

/**
 * Kill switch for the chat product while we fix its memory footprint on the
 * 512 MB web instance (geoip-lite's ~110 MB eager data load + the in-process
 * agent runtime). While true, /chat shows an unavailable notice and the chat
 * API routes return 503 before importing any of the heavy modules — flip to
 * false to re-enable.
 */
export const CHAT_DISABLED = true

export const CHAT_DISABLED_MESSAGE =
  'Chat is temporarily unavailable for maintenance. Please check back soon.'

export function chatDisabledResponse(): NextResponse {
  return NextResponse.json(
    { error: 'chat_disabled', message: CHAT_DISABLED_MESSAGE },
    { status: 503 },
  )
}
