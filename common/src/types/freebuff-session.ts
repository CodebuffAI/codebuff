import type { FreebuffAccessTier } from '../constants/freebuff-models'

/**
 * Wire-level shapes returned by `/api/v1/freebuff/session`. Source of truth
 * for the CLI (which deserializes these) and the server (which serializes
 * them) — keep both in sync by importing this module from either side.
 *
 * The CLI uses these shapes directly; there are no client-only states.
 */

/**
 * Usage counter surfaced to the CLI so the UI can render
 * "N of M sessions used" alongside active state. Present when the
 * joined model consumes Freebuff sessions. `recentCount` is the
 * rounded session units since the last midnight Pacific reset at the time
 * the response was produced — see also the standalone `rate_limited` status
 * for the reject path.
 */
export interface FreebuffSessionRateLimit {
  model: string
  limit: number
  /** 'pacific_day' for the daily premium/limited pools; 'pacific_week' for the
   *  GLM 5.2 referral pool, which resets weekly. */
  period: 'pacific_day' | 'pacific_week'
  resetTimeZone: string
  resetAt: string
  /** Deprecated wire field kept for older clients. Session usage now resets
   *  at midnight Pacific time rather than using a rolling window. */
  windowHours: number
  recentCount: number
}

export type FreebuffSessionRateLimitByModel = Record<
  string,
  FreebuffSessionRateLimit
>

/**
 * Referral status surfaced to the CLI model-selector so it can render an
 * "invite friends" banner. The reward depends on the session's access tier:
 *
 *   - full tier    → unlock weekly GLM 5.2 sessions (`weeklySessionsRemaining`
 *     and `resetAt` carry the live balance / next reset).
 *   - limited tier → earn a daily free-session bonus (+1/day per qualified
 *     referral, capped); the GLM-only fields are omitted, and `qualifiedCount`
 *     carries the bonus sessions/day already earned (capped).
 *
 * Present on the pre-join (`none`) response. The CLI branches on the session's
 * `accessTier` to pick the right copy; both variants share the share code,
 * inviter name, and GitHub-linked flag.
 */
export interface FreebuffReferralInfo {
  /** The user's referral code (`user.referral_code`), used to build the share
   *  link. */
  code: string
  /** The inviter's display name (`user.name`), used to personalize the invite
   *  landing page ("X invited you to try Freebuff!"). Null when the user has no
   *  name set. */
  referrerName: string | null
  /** Capped qualified-referral count for the tier's reward: full tier = weekly
   *  GLM session entitlement; limited tier = daily-session bonus earned. The
   *  CLI knows the relevant cap constant locally. */
  qualifiedCount: number
  /** GLM sessions still available this week (entitlement − used, ≥ 0). Full
   *  tier only; omitted for the limited-tier daily-bonus variant. */
  weeklySessionsRemaining?: number
  /** ISO timestamp of the next weekly reset. Full tier only; omitted for the
   *  limited-tier daily-bonus variant. */
  resetAt?: string
  /** Whether the current user has a GitHub account linked. Referrals only
   *  qualify with a connected, sufficiently-old GitHub, so the CLI prompts
   *  Google-only users to connect one. */
  githubLinked: boolean
}

/** Pull the referral block off whichever session status carries it. Loose
 *  parameter type for the same reason as `getRateLimitsByModel`. */
export const getReferralInfo = (
  session: { status: string } | null | undefined,
): FreebuffReferralInfo | undefined =>
  session && 'referral' in session
    ? (session as { referral?: FreebuffReferralInfo }).referral
    : undefined

/** Pull the per-model shared session-quota snapshot off whichever statuses
 *  carry it (active, ended, none). Returns undefined for terminal /
 *  pre-join states that have no quota field. The parameter is intentionally
 *  loose so the CLI can pass its `FreebuffSessionResponse` (which adds the
 *  client-only `takeover_prompt` variant) without a discriminated-union
 *  ceremony at every call site. */
export const getRateLimitsByModel = (
  session: { status: string } | null | undefined,
): FreebuffSessionRateLimitByModel | undefined =>
  session && 'rateLimitsByModel' in session
    ? (session as { rateLimitsByModel?: FreebuffSessionRateLimitByModel })
        .rateLimitsByModel
    : undefined

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

export type FreebuffSpurStatus =
  | 'not_checked'
  | 'clean'
  | 'suspicious'
  | 'failed'

export type FreebuffScamalyticsStatus =
  | 'not_checked'
  | 'clean'
  | 'suspicious'
  | 'failed'

export type FreebuffPrivacyDecision =
  | 'allowed_clean'
  | 'ipinfo_suspicious_spur_clean'
  | 'corroborated_block'
  | 'cloudflare_tor_block'
  | 'spur_failed_limited'
  | 'scamalytics_failed_limited'
  | 'scamalytics_suspicious_limited'
  | 'ipinfo_failed_limited'
  | 'limited_other'

export type FreebuffPrivacyProviderDecision =
  | 'not_checked'
  | 'cloudflare_tor'
  | 'ipinfo_clean'
  | 'ipinfo_failed'
  | 'ipinfo_only'
  | 'spur_failed'
  | 'scamalytics_failed'
  | 'scamalytics_only'
  | 'corroborated_soft'
  | 'corroborated_hard'

export interface FreebuffLimitedModeReason {
  /** Present for limited access so the model picker can explain why the
   *  reduced model set is shown without re-running geo/IP logic locally. */
  countryCode?: string | null
  countryBlockReason?: FreebuffCountryBlockReason | null
  ipPrivacySignals?: FreebuffIpPrivacySignal[] | null
}

export type FreebuffSessionServerResponse =
  | ({
      /** User has no session row. CLI must POST to start a session. Also
       *  returned when `getSessionState` notices the user has been swept past
       *  the grace window. */
      status: 'none'
      accessTier?: FreebuffAccessTier
      message?: string
      /** Current quota snapshots for free models, keyed by model id. Lets
       *  the picker show today's session usage before the user commits
       *  to a model. */
      rateLimitsByModel?: FreebuffSessionRateLimitByModel
      /** Referral status for the "invite friends" banner. Full tier advertises
       *  GLM 5.2; limited tier advertises a daily free-session bonus. */
      referral?: FreebuffReferralInfo
    } & FreebuffLimitedModeReason)
  | ({
      status: 'active'
      accessTier: FreebuffAccessTier
      instanceId: string
      /** Model the active session is bound to — cannot change mid-session. */
      model: string
      admittedAt: string
      expiresAt: string
      remainingMs: number
      /** Shared free-session quota for this model. */
      rateLimit?: FreebuffSessionRateLimit
      rateLimitsByModel?: FreebuffSessionRateLimitByModel
      /** Included for Web/Cloud picker reads that request full quota details. */
      referral?: FreebuffReferralInfo
    } & FreebuffLimitedModeReason)
  | ({
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
      accessTier?: FreebuffAccessTier
      instanceId?: string
      admittedAt?: string
      expiresAt?: string
      gracePeriodEndsAt?: string
      gracePeriodRemainingMs?: number
      /** Snapshot of the user's free-session quota at the moment the
       *  session ended. Lets the post-session banner show "N of M sessions
       *  used today" without an extra round-trip. */
      rateLimitsByModel?: FreebuffSessionRateLimitByModel
      /** Included for Web/Cloud picker reads that request full quota details. */
      referral?: FreebuffReferralInfo
    } & FreebuffLimitedModeReason)
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
       *  Returned before a session is started so users aren't rejected on
       *  their first chat request. Terminal —
       *  CLI stops polling and shows a "not available in your country"
       *  screen. `countryCode` is the resolved country, or UNKNOWN. */
      status: 'country_blocked'
      message?: string
      countryCode: string
      countryBlockReason?: FreebuffCountryBlockReason
      ipPrivacySignals?: FreebuffIpPrivacySignal[]
    }
  | {
      /** User has an active session bound to a different model. Returned
       *  from POST /session when they pick a new model without ending their
       *  current session first. The CLI shows a confirmation prompt: "End
       *  your active DeepSeek session to switch?" → on confirm, DELETE then
       *  re-POST with the new model. */
      status: 'model_locked'
      accessTier?: FreebuffAccessTier
      currentModel: string
      requestedModel: string
    }
  | {
      /** Requested model is valid but not selectable right now. */
      status: 'model_unavailable'
      accessTier?: FreebuffAccessTier
      requestedModel: string
      availableHours: string
    }
  | {
      /** Account is banned. Returned from every endpoint so banned bots can't
       *  start a session at all. Terminal — CLI stops polling and shows a
       *  banned message. */
      status: 'banned'
    }
  | {
      /** User has used up their shared free-session quota for the current
       *  Pacific day. Returned from POST /session before a session is started.
       *  `retryAfterMs` is the time until the next midnight Pacific
       *  reset. Terminal for the CLI's current poll session; the user can exit
       *  and come back later. */
      status: 'rate_limited'
      /** Desktop multi-session only: set to 'concurrent_sessions' when the
       *  reject is the per-user concurrent-tab backstop rather than a
       *  daily/weekly session pool — clients should say "close a tab", not
       *  "daily limit". Absent on quota rejects. */
      reason?: 'concurrent_sessions'
      accessTier?: FreebuffAccessTier
      /** The freebuff model the user tried to join. */
      model: string
      /** Max session units permitted per period (e.g. 5/day premium, or the
       *  user's weekly GLM referral entitlement). */
      limit: number
      period: 'pacific_day' | 'pacific_week'
      resetTimeZone: string
      resetAt: string
      /** Deprecated wire field kept for older clients. */
      windowHours: number
      /** Session units since today's Pacific reset — will be ≥ limit. */
      recentCount: number
      /** Milliseconds from now until the next Pacific midnight reset. */
      retryAfterMs: number
    }
  | {
      /** The user has reached today's cross-model Freebuff provider-spend
       *  budget. This only blocks a fresh session admission: sessions already
       *  running, including a reconnect to the same live session, continue. */
      status: 'spend_limited'
      accessTier?: FreebuffAccessTier
      message: string
      resetAt: string
      retryAfterMs: number
    }
  | {
      /** Freebuff Desktop multi-session only: the user already holds an active
       *  premium-bucket session and tried to admit a second one. Only one
       *  premium-bucket model (DeepSeek V4 Pro / MiMo 2.5 Pro / Kimi / MiniMax
       *  M3 / GLM 5.2) may run at a time per user; on the full tier unlimited
       *  models (DeepSeek V4 Flash, MiMo 2.5) have no such cap. On the LIMITED
       *  tier every model occupies the slot — one freebuff tab at a time. The
       *  desktop client surfaces this and steers the tab to an unlimited model
       *  (or closes the holding tab). Never returned to CLI/web, which run one
       *  session per user. */
      status: 'premium_slot_taken'
      accessTier?: FreebuffAccessTier
      /** Model this tab tried to start. */
      requestedModel: string
      /** Model of the premium-bucket session already running. */
      currentModel: string
      /** Instance id of the existing premium-bucket session, so the client can
       *  offer "switch to / close that one". */
      currentInstanceId: string
    }
