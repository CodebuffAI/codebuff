/**
 * Wire-level shapes returned by `/api/v1/freebuff/session`. Source of truth
 * for the CLI (which deserializes these) and the server (which serializes
 * them) — keep both in sync by importing this module from either side.
 *
 * The CLI uses these shapes directly; there are no client-only states.
 */
export type FreebuffSessionServerResponse =
  | {
      /** Waiting room is globally off; free-mode requests flow through
       *  unchanged. Client should treat this as "admitted forever". */
      status: 'disabled'
    }
  | {
      /** User has no session row. CLI must POST to (re-)queue. Also returned
       *  when `getSessionState` notices the user has been swept past the
       *  grace window. */
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
      /** Session is over. While `instanceId` is present we're inside the
       *  server-side grace window — chat requests still go through so the
       *  agent can finish, but the CLI must not accept new prompts. Once
       *  `instanceId` is absent the session is fully gone and the user must
       *  rejoin via POST.
       *
       *  Server-supplied form (in-grace) carries the timing fields; the
       *  client may also synthesize a no-grace `{ status: 'ended' }` when a
       *  poll reveals the row was swept. Both render the same UI. */
      status: 'ended'
      instanceId?: string
      admittedAt?: string
      expiresAt?: string
      gracePeriodEndsAt?: string
      gracePeriodRemainingMs?: number
    }
  | {
      /** Another CLI on the same account rotated our instance id. Polling
       *  stops and the UI shows a "close the other CLI" screen. The server
       *  returns this from GET /session when the caller's instance id
       *  doesn't match the stored one; the chat-completions gate also
       *  surfaces it as a 409 for fast in-flight feedback. */
      status: 'superseded'
    }
