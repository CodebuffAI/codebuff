import type { FreebuffAccessTier } from '../constants/freebuff-models'
import type { FreebuffStandingInfo } from '../constants/freebuff-trust'

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
 * rounded session units since the current quota period began at the time the
 * response was produced — see also the standalone `rate_limited` status for
 * the reject path.
 */
export interface FreebuffSessionEntitlementBreakdown {
  /** Sessions included without earning a referral or streak reward. */
  base: number
  /** Sessions earned from the referral program for this quota period. */
  referral: number
  /** Sessions earned from the active streak reward for this quota period. */
  streak: number
  /** Sessions added by a temporary promotion, for a user who already earned
   *  their way in (a qualified referral or a bounty grant). Omitted while no
   *  promo runs, which is the default — an older client that never reads it
   *  still sums to the right `limit`, because the server sends the total. */
  promo?: number
  /**
   * Sessions added by the account's earned LEVEL
   * (`common/constants/freebuff-levels.ts`). Omitted at level 0, which is
   * where every account starts, so the field is absent for most callers and an
   * older client that never reads it still sums to the right `limit` — the
   * server always sends the total.
   *
   * Distinct from `base` on purpose. `base` is what we give you; this is what
   * you earned, and a user looking at "1 + 4" needs to be able to see which
   * half goes away if they stop engaging.
   */
  level?: number
}

export interface FreebuffSessionRateLimit {
  model: string
  /** Additive detail for `limit`; omitted by older servers. New servers emit it
   * for session quotas with `limit = base + referral + streak + promo`. */
  entitlementBreakdown?: FreebuffSessionEntitlementBreakdown
  limit: number
  /** 'pacific_day' for the daily pools (premium/limited, and the GLM 5.2
   *  referral pool since 2026-07-29). 'pacific_week' is kept for wire compat
   *  with servers from when the GLM pool reset weekly. */
  period: 'pacific_day' | 'pacific_week'
  resetTimeZone: string
  resetAt: string
  /** Deprecated wire field kept for older clients. Session usage now follows
   * the explicit Pacific day/week period and `resetAt`. */
  windowHours: number
  recentCount: number
}

export type FreebuffSessionRateLimitByModel = Record<
  string,
  FreebuffSessionRateLimit
>

/** Timing needed by multi-session clients to show the active session window. */
export interface FreebuffActiveSessionInfo {
  model: string
  admittedAt: string
  expiresAt: string
}

/** Live per-user Freebuff Desktop sessions, counted server-side across every
 * Desktop process. Holder identities stay client-local; these totals make the
 * picker honest when another project or device is using capacity. */
export interface FreebuffDesktopSessionCounts {
  premium: number
  unlimited: number
  /** Earliest capacity-release time. Premium rows include their drain grace;
   * unlimited rows release at normal expiry. */
  nextExpiryAt?: string
}

/**
 * Referral status surfaced to the CLI model-selector so it can render an
 * "invite friends" banner. The reward depends on the session's access tier:
 *
 *   - full tier    → unlock daily GLM 5.2 sessions (`weeklySessionsRemaining`
 *     and `resetAt` carry the live balance / next reset; the field name
 *     predates the weekly→daily cadence change and is kept for wire compat).
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
  /** Qualified-referral count for the tier's reward: full tier = GLM sessions
   *  per day (uncapped since 2026-07-30); limited tier = daily-session bonus
   *  earned, still capped at REFERRAL_CLI_DAILY_SESSION_BONUS_CAP, which the
   *  CLI knows locally. */
  qualifiedCount: number
  /** GLM sessions still available in the current reset window (entitlement −
   *  used, ≥ 0). Daily since 2026-07-29; the "weekly" name is kept for wire
   *  compat. Full tier only; omitted for the limited-tier daily-bonus
   *  variant. */
  weeklySessionsRemaining?: number
  /** ISO timestamp of the next GLM pool reset. Full tier only; omitted for
   *  the limited-tier daily-bonus variant. */
  resetAt?: string
  /** Whether the current user has a GitHub account linked. Referrals only
   *  qualify with a connected, sufficiently-old GitHub, so the CLI prompts
   *  Google-only users to connect one. */
  githubLinked: boolean
}

/**
 * A live GLM 5.2 promotion, as advertised to every surface.
 *
 * One block drives the CLI banner, the desktop footer, the web picker, the Earn
 * page and the landing eyebrow, so their copy cannot disagree about the size of
 * the promo or when it ends. Present ONLY while the promo is running: absent
 * means every surface renders exactly what it rendered before promos existed,
 * which is what makes closing one an env change rather than a release.
 */
export interface FreebuffGlmPromo {
  /** Sessions per Pacific day an earned user may run while this runs. */
  dailySessions: number
  /** ISO timestamp the promo closes. Surfaces count down to it rather than
   *  hardcoding a date, so the copy can never outlive the server's window. */
  endsAt: string
}

/** Pull the promo block off whichever session status carries it. Same loose
 *  parameter type as `getReferralInfo`, for the same reason. */
export const getGlmPromo = (
  session: { status: string } | null | undefined,
): FreebuffGlmPromo | undefined =>
  session && 'glmPromo' in session
    ? ((session as { glmPromo?: FreebuffGlmPromo }).glmPromo ?? undefined)
    : undefined

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

/**
 * A capacity-limited model the server is offering RIGHT NOW, beyond whatever
 * the client's own catalog contains.
 *
 * The server is the only thing that knows whether the wave's shared pool still
 * has sessions in it, so it — not the client — decides whether the row exists
 * at all. The field is optional and clients must render nothing when it is
 * absent or empty: that is what makes an exhausted, disabled or not-yet-shipped
 * offer invisible instead of a broken-looking greyed-out row.
 *
 * `remaining`/`total` describe the GLOBAL pool shared by every user, while
 * `userRemaining` describes the caller's own daily ceiling. A row is joinable
 * only while both are non-zero, and the client must treat `userRemaining === 0`
 * as "not now" rather than hiding the row — the user has already had their
 * session and the reset time explains when they get another.
 *
 * The ceiling itself is not on the wire: it is fixed by construction
 * (FREEBUFF_LIMITED_OFFER_SESSION_LIMIT, which no streak or referral can
 * raise), so a client that ever needs "N of M used" reads the shared constant
 * rather than a field the server has to keep consistent.
 */
export interface FreebuffLimitedModelOffer {
  /** Model id; always a member of SUPPORTED_FREEBUFF_MODELS, so the client can
   *  resolve its display name from the shared catalog. */
  model: string
  /** Sessions left in the shared global pool for the current wave. Always > 0
   *  — an exhausted offer is omitted rather than sent as zero. */
  remaining: number
  /** Pool size for the current wave, for "N of M left" copy. */
  total: number
  /** Sessions this user may still start today. May be 0. */
  userRemaining: number
  /** ISO timestamp at which `userRemaining` refills. */
  userResetAt: string
}

/** Pull the limited-model offers off whichever session status carries them.
 *  Loose parameter type for the same reason as `getRateLimitsByModel`. Always
 *  returns an array so callers can map without a presence check. */
export const getLimitedModelOffers = (
  session: { status: string } | null | undefined,
): FreebuffLimitedModelOffer[] =>
  session && 'limitedModelOffers' in session
    ? ((session as { limitedModelOffers?: FreebuffLimitedModelOffer[] })
        .limitedModelOffers ?? [])
    : []

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
  /**
   * Deliberately not consulted: the provider is switched off, or its balance
   * is exhausted and the breaker is open.
   *
   * Distinct from `failed` on purpose. `failed` means "we asked and got
   * nothing", which is a signal about the IP's luck and is worth a risk-score
   * floor. `skipped` means "we chose not to ask", which says nothing about the
   * IP at all — scoring it would penalise every request in the world the
   * moment we turn a vendor off. What it does instead is leave the escalation
   * UNRESOLVED when no other provider answered, which the spend ceiling reads
   * as `unverified_egress`.
   */
  | 'skipped'

export type FreebuffScamalyticsStatus =
  | 'not_checked'
  | 'clean'
  | 'suspicious'
  | 'failed'
  /** Deliberately not consulted — switched off, or balance exhausted and the
   *  breaker is open. Same meaning and same reasoning as the Spur variant. */
  | 'skipped'

export type FreebuffPrivacyDecision =
  | 'allowed_clean'
  | 'ipinfo_suspicious_spur_clean'
  | 'corroborated_block'
  | 'cloudflare_tor_block'
  | 'spur_failed_limited'
  /** ipinfo flagged the egress and no second opinion was obtainable at all —
   *  every provider disabled, exhausted, or erroring. Carries the restricted
   *  spend ceiling so a vendor outage cannot widen anyone's budget. */
  | 'unverified_egress_limited'
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

export type FreebuffSessionServerResponse = (
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
      /** Capacity-limited models the picker may additionally offer right now.
       *  Only sent on the pre-join response, which is the only state that
       *  renders a picker. Absent whenever the pool is spent or the offer is
       *  off — see FreebuffLimitedModelOffer. */
      limitedModelOffers?: FreebuffLimitedModelOffer[]
      /**
       * The account's Access Level and the limits it currently selects.
       *
       * Sent on the pre-join response only, which is the state that renders a
       * picker and therefore the one place a client can explain the numbers
       * next to the models they apply to. Absent when the feature is off, so
       * a client renders it only when there is something true to render.
       */
      standing?: FreebuffStandingInfo
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
      /** Too many DISTINCT users already hold an active free session on this
       *  egress IP. Admission-only: existing sessions on the IP keep running,
       *  and the request succeeds once one of them ends, so unlike
       *  `rate_limited` this is not tied to a quota reset. Sent as 429 so
       *  older CLIs that don't know the status still back off rather than
       *  tight-poll a 200 they can't parse. */
      status: 'ip_capped'
      accessTier?: FreebuffAccessTier
      model: string
      /** Distinct users currently active on the IP (excluding the caller). */
      activeUsersForIp: number
      /** The configured ceiling (FREEBUFF_IP_USER_CAP). */
      limit: number
      retryAfterMs: number
    }
  | {
      /** User has used up their shared free-session quota for the current
       * Pacific day or week. Returned from POST /session before a session is
       * started. `retryAfterMs` is the time until that period resets. Terminal
       * for the CLI's current poll session; the user can exit and return later. */
      status: 'rate_limited'
      accessTier?: FreebuffAccessTier
      /** The freebuff model the user tried to join. */
      model: string
      /** Max session units permitted per period (e.g. the configured daily
       * premium allowance, or the user's weekly GLM referral plus streak
       * entitlement). */
      limit: number
      /** Additive detail for `limit`; absent on older servers. */
      entitlementBreakdown?: FreebuffSessionEntitlementBreakdown
      period: 'pacific_day' | 'pacific_week'
      resetTimeZone: string
      resetAt: string
      /** Deprecated wire field kept for older clients. */
      windowHours: number
      /** Session units since the current Pacific period began — will be ≥ limit. */
      recentCount: number
      /** Milliseconds from now until the next Pacific period reset. */
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
      /**
       * Present only when a PEAK-HOURS reduction is what the account ran into,
       * so a client can say "your limit is temporarily lower, back to normal
       * at ..." instead of the flat "you are out for the day" — which would be
       * wrong, because the fuller allowance returns in hours, not at midnight.
       *
       * The windows are UTC hour pairs rather than preformatted text on
       * purpose: only the client knows the reader's timezone, and
       * `formatDeepSeekPeakWindowsLocal` turns these into local ranges.
       */
      peak?: {
        /** Ceiling before the reduction, and the reduced one now in force. */
        baseUsd: number
        multiplier: number
        /** ISO instant the current peak window closes. */
        endsAt: string
        /** Half-open [startHourUtc, endHourUtc) pairs. */
        windowsUtc: Array<[number, number]>
      }
    }
  | {
      /** Freebuff Desktop multi-session only: the user already holds an active
       *  premium-bucket session and tried to admit a second one. Only one
       *  premium-bucket model (DeepSeek V4 Pro / MiMo 2.5 Pro / Kimi / MiniMax
       *  M3 / GLM 5.2) may run at a time per user; on the full tier up to three
       *  unlimited-model sessions (DeepSeek V4 Flash, MiMo 2.5) may run. On
       *  the LIMITED tier every model occupies the slot — one freebuff tab at
       *  a time. The desktop client surfaces this and steers the tab to an
       *  unlimited model (or closes the holding tab). Never returned to
       *  CLI/web, which run one
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
) & {
  /** Multi-session Desktop responses only. Counts live, unexpired rows across
   * all Desktop processes for this user. */
  desktopSessionCounts?: FreebuffDesktopSessionCounts
}

/**
 * The session gate on `/api/v1/chat/completions`, as a wire contract.
 *
 * A rejection is identified by its `error` code paired with its HTTP status,
 * never by its `message` — the prose is written for whoever is sitting in front
 * of the client and is free to be rewritten. BOTH halves are required to match:
 * 409/410 are ordinary provider outcomes on their own, and the codes are
 * generic enough that an upstream error body can echo one, so a status-only or
 * code-only test lets an unrelated failure impersonate the gate.
 *
 * `endsTheSession` marks the codes that mean the caller's row is GONE. Every
 * one of them has the same recovery — forget the dead window and re-admit on
 * the same instance id — which is why clients collapse them into one state
 * rather than handling four. `false` is a refusal the session survives.
 *
 * Lives here because three surfaces need it and it drifted into three copies:
 * the server that emits it (chat/completions), the CLI that matches it, and
 * Desktop, which classifies it out of the SDK's relayed `AgentOutput`. See
 * docs/freebuff-session-admission.md.
 */
export const FREEBUFF_GATE_CODES = {
  waiting_room_required: { status: 428, endsTheSession: true },
  session_expired: { status: 410, endsTheSession: true },
  session_superseded: { status: 409, endsTheSession: true },
  session_model_mismatch: { status: 409, endsTheSession: true },
  /** The ACCOUNT is over its concurrent-tab budget; this tab's row is fine. */
  session_limit_reached: { status: 409, endsTheSession: false },
  /** Transient admission race — the row was caught mid-admit. */
  waiting_room_queued: { status: 429, endsTheSession: false },
} as const satisfies Record<string, { status: number; endsTheSession: boolean }>

export type FreebuffGateCode = keyof typeof FREEBUFF_GATE_CODES

/** The gate rejection this error output describes, or null for anything else.
 *  `output` is any shape carrying the relayed `error`/`statusCode` pair.
 *
 *  `Object.hasOwn`, not `in`: the code is whatever an upstream error body put in
 *  its `error` field, so `in` would accept inherited names like `toString` —
 *  and since their `.status` is undefined, an output carrying no `statusCode`
 *  would then satisfy the status check too and be classified as a gate
 *  rejection. */
export function getFreebuffGateCode(output: {
  error?: string | undefined
  statusCode?: number | undefined
}): FreebuffGateCode | null {
  const code = output.error
  if (!code || !Object.hasOwn(FREEBUFF_GATE_CODES, code)) return null
  const gate = FREEBUFF_GATE_CODES[code as FreebuffGateCode]
  return gate.status === output.statusCode ? (code as FreebuffGateCode) : null
}
