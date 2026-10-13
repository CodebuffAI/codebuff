/**
 * The wire contract between the freebuff-jobs worker's `support.ingest_email`
 * cron and freebuff-web's `POST /api/admin/support-email-ingest`: ingest the
 * support mail Resend received in one half-open window, `[windowStart,
 * windowEnd)`. The worker owns the schedule (one window per cron tick, so no
 * cursor table); freebuff-web owns the work, because `RESEND_API_KEY` and the
 * `feedback.received` logger live there.
 *
 * Plain types and a hand-written parser, as `./support-jobs.ts`: a Next route
 * and a leaf-only package both read this.
 */

/** A window longer than this is refused: one call is one cron tick's worth. */
export const SUPPORT_EMAIL_INGEST_MAX_WINDOW_MS = 24 * 60 * 60 * 1000

export type SupportEmailIngestRequest = {
  /** ISO 8601, inclusive. */
  windowStart: string
  /** ISO 8601, exclusive. */
  windowEnd: string
}

export type SupportEmailIngestResponse = {
  ran: true
  /** Received messages listed in the window (any domain). */
  inWindow: number
  /** Logged as `feedback.received` with `source: 'support_email'`. */
  ingested: number
  /** Ours, but sent by our own people (see `isStaffAddress`). */
  staff: number
  /** Addressed to another domain on the same Resend team. */
  foreign: number
  /** Detail fetches that failed; their messages are not logged. */
  failed: number
}

export function parseSupportEmailIngestRequest(
  value: unknown,
): { windowStart: Date; windowEnd: Date } | null {
  if (typeof value !== 'object' || value === null) return null
  const { windowStart, windowEnd } = value as Record<string, unknown>
  if (typeof windowStart !== 'string' || typeof windowEnd !== 'string') {
    return null
  }
  const start = new Date(windowStart)
  const end = new Date(windowEnd)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  const span = end.getTime() - start.getTime()
  if (span <= 0 || span > SUPPORT_EMAIL_INGEST_MAX_WINDOW_MS) return null
  return { windowStart: start, windowEnd: end }
}
