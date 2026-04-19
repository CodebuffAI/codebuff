/**
 * Public shapes returned by the server at /api/v1/freebuff/session.
 * Mirrors web/src/server/free-session/types.ts but duplicated here so the CLI
 * doesn't need a cross-package import for a 20-line type.
 */
export type FreebuffSessionServerResponse =
  | { status: 'disabled' }
  | { status: 'none'; message?: string }
  | {
      status: 'queued'
      instanceId: string
      position: number
      queueDepth: number
      estimatedWaitMs: number
      queuedAt: string
    }
  | {
      status: 'active'
      instanceId: string
      admittedAt: string
      expiresAt: string
      remainingMs: number
    }
  | {
      /** Session is past `expiresAt` but still inside the server-side grace
       *  window. The CLI must stop accepting new prompts but may finish any
       *  in-flight agent run. Hard cutoff at `gracePeriodEndsAt`; past that
       *  the chat gate rejects with `session_expired`. */
      status: 'draining'
      instanceId: string
      admittedAt: string
      expiresAt: string
      gracePeriodEndsAt: string
      gracePeriodRemainingMs: number
    }

/**
 * Client-only terminal state set when the server reports `session_superseded`
 * on a chat request. Polling stops; UI tells the user to close the other CLI.
 */
export type FreebuffSessionResponse =
  | FreebuffSessionServerResponse
  | { status: 'superseded' }
  /**
   * Client-only fallback set when we lose the seat via a path that doesn't
   * pass through `draining` — e.g. the chat gate returns 410 session_expired
   * past the hard cutoff, or a poll goes straight from `active` to `none`.
   * Same UX as `draining` (hidden input + Enter-to-rejoin banner) but with
   * no grace countdown to display.
   */
  | { status: 'ended' }

export type FreebuffSessionStatus = FreebuffSessionResponse['status']
