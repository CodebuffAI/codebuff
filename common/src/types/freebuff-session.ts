/**
 * Wire-level shapes returned by `/api/v1/freebuff/session`. Source of truth
 * for the CLI (which deserializes these) and the server (which serializes
 * them) — keep both in sync by importing this module from either side.
 *
 * The CLI layers additional client-only states (`superseded`, `ended`) on
 * top of these — see `cli/src/types/freebuff-session.ts`.
 */
export type FreebuffSessionServerResponse =
  | {
      /** Waiting room is globally off; free-mode requests flow through
       *  unchanged. Client should treat this as "admitted forever". */
      status: 'disabled'
    }
  | {
      /** User has no session row. CLI must POST to re-queue. */
      status: 'none'
      message?: string
    }
  | {
      status: 'queued'
      instanceId: string
      /** 1-indexed position in the FIFO queue. */
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
