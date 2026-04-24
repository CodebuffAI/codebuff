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
      /** Snapshot of every model's queue depth so the CLI can render live
       *  "N ahead" hints on the pre-join model picker without first
       *  committing the user to a queue. Present on GET responses; not
       *  returned from POST (POST never produces `none`). */
      queueDepthByModel?: Record<string, number>
    }
  | {
      status: 'queued'
      instanceId: string
      /** Model the user is queued for. Each model has its own queue. */
      model: string
      /** 1-indexed position in the queue for `model`. */
      position: number
      queueDepth: number
      /** Current depth of every model's queue, so the CLI can show a live
       *  "N ahead" hint on each row of the model selector. Models with no
       *  queued rows at snapshot time may be absent; the CLI should treat a
       *  missing entry as 0. */
      queueDepthByModel: Record<string, number>
      estimatedWaitMs: number
      queuedAt: string
    }
  | {
      status: 'active'
      instanceId: string
      /** Model the active session is bound to — cannot change mid-session. */
      model: string
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
  | {
      /** Request originated from a country outside the free-mode allowlist.
       *  Returned before queue admission so users don't wait through the
       *  room only to be rejected on their first chat request. Terminal —
       *  CLI stops polling and shows a "not available in your country"
       *  screen. `countryCode` is the resolved country for display. */
      status: 'country_blocked'
      countryCode: string
    }
  | {
      /** User has an active session bound to a different model. Returned
       *  from POST /session when they pick a new model without ending their
       *  current session first. The CLI shows a confirmation prompt: "End
       *  your active GLM session to switch?" → on confirm, DELETE then
       *  re-POST with the new model. */
      status: 'model_locked'
      currentModel: string
      requestedModel: string
    }
  | {
      /** Requested model is valid but not selectable right now. */
      status: 'model_unavailable'
      requestedModel: string
      availableHours: string
    }
  | {
      /** Account is banned. Returned from every endpoint so banned bots can't
       *  join the queue at all (otherwise they inflate `queueDepth` until the
       *  15s admission tick's `evictBanned` sweeps them). Terminal — CLI
       *  stops polling and shows a banned message. */
      status: 'banned'
    }
