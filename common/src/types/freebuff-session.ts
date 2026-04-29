/**
 * Wire-level shapes returned by `/api/v1/freebuff/session`. Source of truth
 * for the CLI (which deserializes these) and the server (which serializes
 * them) — keep both in sync by importing this module from either side.
 *
 * The CLI uses these shapes directly; there are no client-only states.
 */

/**
 * Per-model usage counter surfaced to the CLI so the waiting-room UI can
 * render "N of M sessions used" alongside queue/active state. Present when
 * the joined model has a rate limit applied (today: GLM 5.1 with 5 admits
 * per 12-hour window). `recentCount` is the number of admissions inside
 * `windowHours` at the time the response was produced — see also the
 * standalone `rate_limited` status for the reject path.
 */
export interface FreebuffSessionRateLimit {
  model: string
  limit: number
  windowHours: number
  recentCount: number
}

export type FreebuffCountryBlockReason =
  | 'country_not_allowed'
  | 'anonymized_or_unknown_country'
  | 'anonymous_network'
  | 'missing_client_ip'
  | 'unresolved_client_ip'
  | 'ip_privacy_lookup_failed'

export type FreebuffIpPrivacySignal =
  | 'anonymous'
  | 'vpn'
  | 'proxy'
  | 'tor'
  | 'relay'
  | 'res_proxy'
  | 'hosting'
  | 'service'

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
      /** Rate-limit quota for rate-limited models (GLM 5.1 today). Absent
       *  for unlimited models or when the status was produced outside the
       *  rate-limit check path (e.g. pure read via GET). */
      rateLimit?: FreebuffSessionRateLimit
    }
  | {
      status: 'active'
      instanceId: string
      /** Model the active session is bound to — cannot change mid-session. */
      model: string
      admittedAt: string
      expiresAt: string
      remainingMs: number
      /** Rate-limit quota for rate-limited models (GLM 5.1 today). Absent
       *  for unlimited models or when the status was produced outside the
       *  rate-limit check path (e.g. pure read via GET). */
      rateLimit?: FreebuffSessionRateLimit
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
      /** Request originated outside the free-mode allowlist, or from an
       *  unknown/anonymized location that cannot be trusted for free mode.
       *  Returned before queue admission so users don't wait through the
       *  room only to be rejected on their first chat request. Terminal —
       *  CLI stops polling and shows a "not available in your country"
       *  screen. `countryCode` is the resolved country, or UNKNOWN. */
      status: 'country_blocked'
      countryCode: string
      countryBlockReason?: FreebuffCountryBlockReason
      ipPrivacySignals?: FreebuffIpPrivacySignal[]
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
  | {
      /** User has used up their per-model admission quota in the rolling
       *  window (GLM 5.1: 5 one-hour sessions per 12h). Returned from POST
       *  /session before the user is placed in the queue. `retryAfterMs` is
       *  the time until the oldest admission inside the window falls off
       *  and one quota slot opens up — clients should show the user when
       *  they can try again. Terminal for the CLI's current poll session;
       *  the user can exit and come back later. */
      status: 'rate_limited'
      /** The freebuff model the user tried to join. */
      model: string
      /** Max admissions permitted per window (e.g. 5). */
      limit: number
      /** Rolling window size in hours (e.g. 20). */
      windowHours: number
      /** Admission count inside the window at check time — will be ≥ limit. */
      recentCount: number
      /** Milliseconds from now until the oldest admission in the window
       *  exits and the user regains one quota slot. */
      retryAfterMs: number
    }
