import {
  addDaysToYmd,
  getUtcForZonedTime,
  getZonedParts,
  type ZonedDateParts,
} from '../util/zoned-time'
import {
  atlasCloudModels,
  mimoModels,
  minimaxModels,
  moonshotModels,
  openrouterModels,
} from './model-config'

/**
 * Models a freebuff user can pick between in the waiting-room model selector.
 *
 * Each model has its own queue (server keys queue position by `model`), so the
 * list here is effectively the set of separate waiting lines. Order is the
 * order shown in the UI.
 */
export interface FreebuffModelOption {
  /** Stable ID used in the wire protocol and DB. Matches the model id passed
   *  to the chat-completions endpoint. */
  id: string
  /** Short label for the selector UI. */
  displayName: string
  /** One-line description shown next to the label. */
  tagline: string
  /** Availability policy for the selector and server-side admission. */
  availability: 'always' | 'deployment_hours'
  /** Optional caveat shown in the picker (e.g. data-collection warning).
   *  Rendered in the warning/secondary color so users spot it before
   *  picking the model. */
  warning?: string
  /** Premium models carry a per-day usage limit
   *  (FREEBUFF_PREMIUM_SESSION_LIMIT). Surfaced in the UI as a "Premium"
   *  badge with the limit. Derived from FREEBUFF_PREMIUM_MODEL_IDS so the two
   *  never drift. */
  premium: boolean
  /** Whether the model accepts image input. Drives whether uploaded images
   *  are forwarded as real multimodal content vs. dropped/inlined as text. */
  multimodal: boolean
  /** Whether the model is still being trialed and may be unreliable. Surfaced
   *  in the picker as a "TEST" badge with a tooltip so users know it is not
   *  yet production-grade. */
  experimental?: boolean
}

/** Server-facing fallback copy for APIs and provider errors that can't know
 *  the caller's local timezone. The CLI should render
 *  `getFreebuffDeploymentAvailabilityLabel()` instead. */
export const FREEBUFF_DEPLOYMENT_HOURS_LABEL = '9am ET-5pm PT every day'
export const FREEBUFF_GEMINI_PRO_MODEL_ID = 'google/gemini-3.1-pro-preview'
export const FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID = 'deepseek/deepseek-v4-pro'
export const FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID = 'deepseek/deepseek-v4-flash'
/** DeepSeek V4 Flash served by Fireworks instead of DeepSeek's direct API.
 *  Used only by freebuff.com/chat, where Fireworks' faster inference is worth
 *  a slightly less capable serving stack. Not in SUPPORTED_FREEBUFF_MODELS or
 *  the free-mode allowlists — the CLI and web builder keep DeepSeek direct. */
export const FREEBUFF_DEEPSEEK_V4_FLASH_FIREWORKS_MODEL_ID =
  'fireworks/deepseek-v4-flash'
export const FREEBUFF_KIMI_MODEL_ID = moonshotModels.kimiK27Code
export const FREEBUFF_HY3_OPENROUTER_FREE_MODEL_ID =
  openrouterModels.openrouter_tencent_hy3_free
export const FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID =
  openrouterModels.openrouter_tencent_hy3
export const FREEBUFF_HY3_ATLAS_MODEL_ID = atlasCloudModels.tencentHy3
export const FREEBUFF_HY3_MODEL_ID = FREEBUFF_HY3_OPENROUTER_FREE_MODEL_ID
export const FREEBUFF_MINIMAX_M3_MODEL_ID = minimaxModels.minimaxM3
export const FREEBUFF_MIMO_V25_MODEL_ID = mimoModels.mimoV25
export const FREEBUFF_MIMO_V25_PRO_MODEL_ID = mimoModels.mimoV25Pro
/** GLM 5.2 (Z.ai), served by Fireworks serverless. Unlike the other picker
 *  models it is NOT freely available — it is unlocked by referring friends.
 *  Each qualified referral grants one 1-hour GLM session per week (capped at
 *  FREEBUFF_GLM_V52_REFERRAL_CAP). Gated by a per-user weekly session pool whose
 *  limit equals the caller's GLM referral score (see the free-session quota). */
export const FREEBUFF_GLM_V52_MODEL_ID = 'z-ai/glm-5.2'
/** UI-only rollout switch. Backend support and free-mode allowlists remain
 *  wired even when these models are hidden from the Freebuff picker. */
export const FREEBUFF_ENABLE_MIMO_MODELS_IN_UI = true
/** UI-only rollout switch for the streak indicator in the waiting room. */
export const FREEBUFF_ENABLE_STREAK_IN_UI = true
/** Local/debug switch: force the localhost free-mode country bypass into
 *  limited access so the limited Freebuff UX can be exercised without an env
 *  var. */
export const FREEBUFF_FORCE_LIMITED_MODE = false
export const FREEBUFF_PREMIUM_SESSION_LIMIT = 5
export const FREEBUFF_LIMITED_SESSION_LIMIT = 5
export const FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE = 'America/Los_Angeles'
export const FREEBUFF_PREMIUM_SESSION_PERIOD = 'pacific_day'
/** GLM 5.2 referral-reward session pool. Distinct from the premium daily pool:
 *  GLM sessions reset weekly (Pacific) and the per-user limit is the caller's
 *  GLM referral score, capped at FREEBUFF_GLM_V52_REFERRAL_CAP. */
export const FREEBUFF_WEEKLY_SESSION_PERIOD = 'pacific_week'
export const FREEBUFF_GLM_V52_SESSION_RESET_TIMEZONE =
  FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE
export const FREEBUFF_GLM_V52_SESSION_WINDOW_HOURS = 24 * 7
/** Max number of qualified referrals that count toward GLM sessions, i.e. the
 *  most 1-hour GLM sessions a user can earn per week. */
export const FREEBUFF_GLM_V52_REFERRAL_CAP = 10
/** Master kill-switch for the GLM 5.2 referral program. While true, qualified
 *  referrals grant weekly GLM sessions and the CLI advertises the perk. Flip to
 *  false to wind the program down: entitlement drops to 0 for everyone and the
 *  CLI stops showing the banner. The perk is intentionally framed as
 *  limited-time in the UI so turning this off isn't a surprise. */
export const FREEBUFF_GLM_V52_REFERRAL_ENABLED = true
/** GLM sessions are exactly one hour of wall-clock time, regardless of the
 *  global free-session length, so the "1 hour per referral per week" promise is
 *  exact. */
export const FREEBUFF_GLM_V52_SESSION_LENGTH_MS = 60 * 60 * 1000
export const FREEBUFF_LIMITED_SESSION_RESET_TIMEZONE =
  FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE
export const FREEBUFF_LIMITED_SESSION_PERIOD = FREEBUFF_PREMIUM_SESSION_PERIOD

/**
 * Streak rewards. Once a user reaches a `FREEBUFF_STREAK_REWARD_INTERVAL_DAYS`
 * (7)-day daily streak, they earn:
 *   - +1 session in their primary daily pool (premium for full-access users,
 *     limited for limited-access) **every day** the streak stays at 7+; and
 *   - for full-access users, +1 GLM 5.2 session in every Monday-to-Monday week
 *     while the current streak remains at 7+ days, on top of referrals.
 *
 * The daily premium/limited bonus is persisted after today's first use. The
 * GLM bonus is derived live from the current streak, so it refills at the weekly
 * reset and shuts off as soon as the streak breaks.
 */
export const FREEBUFF_STREAK_REWARD_INTERVAL_DAYS = 7
/** Master kill-switch for streak rewards. When false, streaks grant nothing
 *  and effective limits fall back to the base pool limits. */
export const FREEBUFF_STREAK_REWARDS_ENABLED = true
/** Sub-switch for the recurring full-access GLM 5.2 streak entitlement. Lets
 *  the perk be wound down independently of the premium/limited bonus (and of
 *  the separate referral-driven GLM program). */
export const FREEBUFF_STREAK_GLM_BONUS_ENABLED = true
/** Session-units granted per streak-reward grant, per pool. One whole session. */
export const FREEBUFF_STREAK_BONUS_SESSION_UNITS = 1

/** Which session pool a streak bonus credit applies to. `premium` and `limited`
 *  are the daily pools (full vs limited access); `glm` is the weekly GLM 5.2
 *  pool (full access only). */
export type FreebuffStreakRewardPool = 'premium' | 'limited' | 'glm'
/** Deprecated wire compatibility field. Session usage now resets at midnight
 *  Pacific time rather than using a rolling hourly window. */
export const FREEBUFF_PREMIUM_SESSION_WINDOW_HOURS = 24
export const FREEBUFF_LIMITED_SESSION_WINDOW_HOURS =
  FREEBUFF_PREMIUM_SESSION_WINDOW_HOURS
const FREEBUFF_EASTERN_TIMEZONE = 'America/New_York'
const FREEBUFF_PACIFIC_TIMEZONE = 'America/Los_Angeles'

interface LocalTimeFormatOptions {
  locale?: string
  timeZone?: string
}

/** Full-access freebuff models that benefit from spawning the gemini-thinker
 *  subagent for deeper reasoning. Covers every full-access picker model except
 *  the two limited-tier ones (DeepSeek V4 Flash, MiMo 2.5). Used by the CLI to
 *  toggle the gemini-thinker spawnable + prompts based on the user's pick, and
 *  by the server to admit gemini-thinker child requests against a parent
 *  session bound to one of these models. */
export const FREEBUFF_GEMINI_THINKER_PARENT_MODELS = new Set<string>([
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
])

export function canFreebuffModelSpawnGeminiThinker(modelId: string): boolean {
  return FREEBUFF_GEMINI_THINKER_PARENT_MODELS.has(modelId)
}

/** Single source of truth for "this model collects data for training". A model
 *  that carries this exact `warning` is both shown the caveat in the picker AND
 *  has its chat-completion traces stored in free mode (see
 *  FREEBUFF_TRACED_MODEL_IDS, which is derived from it) — the two can't drift. */
export const FREEBUFF_DATA_COLLECTION_WARNING = 'Collects data for training'

const DEEPSEEK_V4_PRO_MODEL = {
  id: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  displayName: 'DeepSeek V4 Pro',
  tagline: 'Smartest',
  availability: 'always',
  warning: FREEBUFF_DATA_COLLECTION_WARNING,
  premium: true,
  multimodal: false,
} as const satisfies FreebuffModelOption

const MIMO_V25_PRO_MODEL = {
  id: FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  displayName: 'MiMo 2.5 Pro',
  tagline: 'Smartest & Slow',
  availability: 'always',
  premium: true,
  multimodal: true,
} as const satisfies FreebuffModelOption

const KIMI_MODEL = {
  id: FREEBUFF_KIMI_MODEL_ID,
  displayName: 'Kimi K2.7 Code',
  tagline: 'Best for coding',
  availability: 'always',
  premium: true,
  multimodal: true,
} as const satisfies FreebuffModelOption

const HY3_MODEL = {
  id: FREEBUFF_HY3_MODEL_ID,
  displayName: 'HY3',
  tagline: 'Trialing its performance',
  availability: 'always',
  premium: true,
  multimodal: false,
  experimental: true,
} as const satisfies FreebuffModelOption

const HY3_ATLAS_MODEL = {
  id: FREEBUFF_HY3_ATLAS_MODEL_ID,
  displayName: 'HY3 Atlas',
  tagline: 'Direct via Atlas Cloud',
  availability: 'always',
  premium: true,
  multimodal: false,
  experimental: true,
} as const satisfies FreebuffModelOption

const MIMO_V25_MODEL = {
  id: FREEBUFF_MIMO_V25_MODEL_ID,
  displayName: 'MiMo 2.5',
  tagline: 'Multimodal',
  availability: 'always',
  premium: false,
  multimodal: true,
} as const satisfies FreebuffModelOption

const DEEPSEEK_V4_FLASH_MODEL = {
  id: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  displayName: 'DeepSeek V4 Flash',
  tagline: 'Smart & Fast',
  availability: 'always',
  warning: FREEBUFF_DATA_COLLECTION_WARNING,
  premium: false,
  multimodal: false,
} as const satisfies FreebuffModelOption

const MINIMAX_M3_MODEL = {
  id: FREEBUFF_MINIMAX_M3_MODEL_ID,
  displayName: 'MiniMax M3',
  tagline: 'Smartest & Fastest',
  availability: 'always',
  // No data-collection warning: M3 is served by Fireworks (no provider-side
  // training). Omitting the warning also keeps it out of FREEBUFF_TRACED_MODEL_IDS,
  // so we don't store its traces either.
  premium: false,
  multimodal: true,
} as const satisfies FreebuffModelOption

const GLM_V52_MODEL = {
  id: FREEBUFF_GLM_V52_MODEL_ID,
  displayName: 'GLM 5.2',
  tagline: 'Unlock by referring friends',
  availability: 'always',
  // No data-collection warning: served by Fireworks (no provider-side
  // training), and omitting it keeps GLM out of FREEBUFF_TRACED_MODEL_IDS.
  // `premium` drives the "Premium" badge styling in the picker; GLM's real
  // gate is its weekly referral-session pool, not the daily premium pool.
  premium: true,
  multimodal: false,
} as const satisfies FreebuffModelOption

export const SUPPORTED_FREEBUFF_MODELS = [
  DEEPSEEK_V4_PRO_MODEL,
  MIMO_V25_PRO_MODEL,
  KIMI_MODEL,
  MINIMAX_M3_MODEL,
  GLM_V52_MODEL,
  DEEPSEEK_V4_FLASH_MODEL,
  MIMO_V25_MODEL,
] as const satisfies readonly FreebuffModelOption[]

// GLM 5.2 is intentionally NOT in FREEBUFF_MODELS: it isn't a freely-pickable
// grid model, it's a referral reward surfaced by the separate referral banner.
// It stays in SUPPORTED_FREEBUFF_MODELS so the session/chat layers accept it as
// a valid model id once the user's weekly entitlement admits them.
// Kimi returned to the picker as K2.7 Code: the K2.6 first-token stalls that
// got Kimi hidden were provider-side; K2.7 Code is served via Infron pinned to
// Alibaba us/eu (~3s warm-cache TTFT benchmarked).
export const FREEBUFF_MODELS = [
  MINIMAX_M3_MODEL,
  DEEPSEEK_V4_PRO_MODEL,
  KIMI_MODEL,
  ...(FREEBUFF_ENABLE_MIMO_MODELS_IN_UI ? [MIMO_V25_PRO_MODEL] : []),
  DEEPSEEK_V4_FLASH_MODEL,
  ...(FREEBUFF_ENABLE_MIMO_MODELS_IN_UI ? [MIMO_V25_MODEL] : []),
] as const satisfies readonly FreebuffModelOption[]

export const FREEBUFF_PREMIUM_MODEL_IDS = [
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
] as const

/** Freebuff Web-only picker/support set. HY3 is intentionally excluded from
 *  FREEBUFF_MODELS and SUPPORTED_FREEBUFF_MODELS so CLI/Desktop freebuff
 *  surfaces do not pick it up during the initial web rollout. */
export const FREEBUFF_WEB_MODELS = [
  HY3_MODEL,
  GLM_V52_MODEL,
  ...FREEBUFF_MODELS,
] as const satisfies readonly FreebuffModelOption[]

export const FREEBUFF_WEB_GOD_ONLY_MODELS = [
  HY3_ATLAS_MODEL,
] as const satisfies readonly FreebuffModelOption[]

export const FREEBUFF_WEB_ALL_MODELS = [
  ...FREEBUFF_WEB_GOD_ONLY_MODELS,
  ...FREEBUFF_WEB_MODELS,
] as const satisfies readonly FreebuffModelOption[]

export const FREEBUFF_WEB_GOD_ONLY_MODEL_IDS = [
  FREEBUFF_HY3_ATLAS_MODEL_ID,
] as const

export const FREEBUFF_WEB_PREMIUM_MODEL_IDS = [
  ...FREEBUFF_PREMIUM_MODEL_IDS,
  FREEBUFF_HY3_MODEL_ID,
  FREEBUFF_HY3_ATLAS_MODEL_ID,
] as const

/** Models unlocked by referrals, metered by the weekly GLM session pool rather
 *  than the daily premium pool. Kept separate from FREEBUFF_PREMIUM_MODEL_IDS
 *  so GLM never falls into the shared 5/day premium quota. */
export const FREEBUFF_GLM_V52_MODEL_IDS = [FREEBUFF_GLM_V52_MODEL_ID] as const

/** Models that occupy the single per-user "premium-bucket" CONCURRENCY slot in
 *  Freebuff Desktop's multi-session mode: at most one of these may have an
 *  active session per user at a time, while unlimited-bucket models (DeepSeek V4
 *  Flash, MiMo 2.5) may run in any number of concurrent tabs. (On the LIMITED
 *  access tier the admission path puts EVERY model in the slot regardless of
 *  this list — limited users get one freebuff tab at a time; see
 *  `requestDesktopSession`.)
 *
 *  This is strictly a CONCURRENCY bucket, NOT a quota bucket. It is intentionally
 *  a SUPERSET of FREEBUFF_PREMIUM_MODEL_IDS: it also includes MiniMax M3 and GLM
 *  5.2, which are unlimited / weekly for QUOTA purposes but expensive enough that
 *  we cap them to one concurrent desktop session. Do NOT use this for the daily
 *  premium quota — that stays on isFreebuffPremiumModelId so M3/GLM never start
 *  burning the 5/day premium pool. */
export const FREEBUFF_DESKTOP_PREMIUM_BUCKET_MODEL_IDS = [
  ...FREEBUFF_PREMIUM_MODEL_IDS,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  FREEBUFF_GLM_V52_MODEL_ID,
] as const

/** True when a desktop tab running `model` under `accessTier` occupies the
 *  single per-user concurrency slot. On the full tier that's the premium
 *  bucket; on the LIMITED tier EVERY model occupies it — limited users get one
 *  freebuff tab at a time. THE shared definition of the one-tab rule: the
 *  server's admission path and the desktop's picker/soft-gate must both call
 *  this so the client can't drift from what the server enforces. */
export function occupiesFreebuffDesktopSlot(
  model: string,
  accessTier: FreebuffAccessTier | null | undefined,
): boolean {
  return (
    accessTier === 'limited' || isFreebuffDesktopPremiumBucketModelId(model)
  )
}

/** Wire headers for the free-mode session endpoints
 *  (/api/v1/freebuff/session). Shared so the server handlers and every client
 *  (CLI, desktop) agree on the exact strings instead of redefining literals. */
export const FREEBUFF_INSTANCE_HEADER = 'x-freebuff-instance-id'
export const FREEBUFF_MODEL_HEADER = 'x-freebuff-model'
/** Trusted server-to-server header. Only the Codebuff API may honor this when
 *  the request authenticates as the Freebuff Web service account; browser and
 *  normal API callers must not be able to select another user's session row. */
export const FREEBUFF_ACTING_USER_HEADER = 'x-freebuff-acting-user-id'
/** Trusted Freebuff Web/Cloud session-proxy hint. Keeps the normal CLI GET
 * response compact while letting the browser model picker request zero-usage
 * quota snapshots so it can render accurate "N of M sessions" labels. */
export const FREEBUFF_INCLUDE_UNUSED_RATE_LIMITS_HEADER =
  'x-freebuff-include-unused-rate-limits'
/** Set to '1' by Freebuff Desktop to opt into multi-session mode (concurrent
 *  per-tab sessions); absent for CLI/web, which keep one session per user. */
export const FREEBUFF_MULTI_SESSION_HEADER = 'x-freebuff-multi-session'

/** Models that accept image input. Used to decide whether uploaded images are
 *  forwarded to the model as real multimodal content. */
export const FREEBUFF_MULTIMODAL_MODEL_IDS = [
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
] as const

export const FREEBUFF_WEB_MULTIMODAL_MODEL_IDS = [
  ...FREEBUFF_MULTIMODAL_MODEL_IDS,
] as const

/** Free-mode models whose chat-completion traces we store in our own dataset
 *  (chat_completion_traces). Derived from the picker's data-collection warning
 *  so the disclosure and the storage are one fact: a model is traced in free
 *  mode iff it shows the "Collects data for training" caveat. Every other free
 *  model (incl. MiniMax M3 on Fireworks) is NOT stored; paid, non-free-mode
 *  requests are unaffected and traced as usual. */
export const FREEBUFF_TRACED_MODEL_IDS = SUPPORTED_FREEBUFF_MODELS.filter(
  (model: FreebuffModelOption) =>
    model.warning === FREEBUFF_DATA_COLLECTION_WARNING,
).map((model) => model.id)

export type FreebuffModelId = (typeof FREEBUFF_MODELS)[number]['id']
export type SupportedFreebuffModelId =
  (typeof SUPPORTED_FREEBUFF_MODELS)[number]['id']
export type FreebuffPremiumModelId = (typeof FREEBUFF_PREMIUM_MODEL_IDS)[number]
export type FreebuffWebModelId = (typeof FREEBUFF_WEB_ALL_MODELS)[number]['id']
export type FreebuffWebPremiumModelId =
  (typeof FREEBUFF_WEB_PREMIUM_MODEL_IDS)[number]

/** What new freebuff users see selected in the picker. MiniMax M3 is the
 *  strongest unlimited model (smartest & multimodal), so new users get good
 *  quality without burning the 5/day premium quota on routine messages.
 *  Callers that need a guaranteed-available id for resolution /
 *  auto-fallbacks should use FALLBACK_FREEBUFF_MODEL_ID instead. */
export const DEFAULT_FREEBUFF_MODEL_ID: FreebuffModelId =
  FREEBUFF_MINIMAX_M3_MODEL_ID

/** Always-available fallback used when the requested model can't be served
 *  right now (unknown id, deployment hours closed, etc.). Kept distinct from
 *  DEFAULT_FREEBUFF_MODEL_ID so a new user's "preferred default" can be the
 *  smartest model without auto-flipping anyone to a closed serverless model. */
export const FALLBACK_FREEBUFF_MODEL_ID: FreebuffModelId =
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID

export const LIMITED_FREEBUFF_MODEL_ID: FreebuffModelId =
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID
export const LIMITED_FREEBUFF_MODEL_IDS = [
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
] as const
export const LIMITED_FREEBUFF_MODELS = LIMITED_FREEBUFF_MODEL_IDS.map(
  (modelId) => SUPPORTED_FREEBUFF_MODELS.find((model) => model.id === modelId)!,
)

export type FreebuffAccessTier = 'full' | 'limited'

/** Access tier carried in the Freebuff Web Convex JWT. Extends the CLI tier
 *  with 'blocked' (Tor / corroborated anonymous network): the app still
 *  loads, but every agent send is rejected server-side. */
export type FreebuffWebAccessTier = FreebuffAccessTier | 'blocked'

/** Temporary project-creation cap for outer-region (limited-tier) Freebuff Web
 *  users. A new project consumes one slot; the quota resets at midnight
 *  Pacific time. */
export const FREEBUFF_WEB_LIMITED_PROJECT_DAILY_LIMIT = 3

/** Models available to limited-region Freebuff Web users. They share the
 * limited-region session pool; every other model remains geo-gated. */
export const FREEBUFF_WEB_GEO_EXEMPT_MODEL_IDS = [
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
] as const

export function isFreebuffWebGeoExemptModelId(
  id: string | null | undefined,
): boolean {
  if (!id) return false
  return FREEBUFF_WEB_GEO_EXEMPT_MODEL_IDS.some((modelId) => modelId === id)
}

/** Models a limited-tier Freebuff Web user may select. */
export const FREEBUFF_WEB_LIMITED_MODEL_IDS = [
  ...new Set<string>([
    ...FREEBUFF_WEB_GEO_EXEMPT_MODEL_IDS,
    ...LIMITED_FREEBUFF_MODEL_IDS,
  ]),
]

export function isFreebuffWebModelAllowedForLimitedTier(
  id: string | null | undefined,
): boolean {
  if (!id) return false
  return FREEBUFF_WEB_LIMITED_MODEL_IDS.some((modelId) => modelId === id)
}

/** Coerce a limited-tier Freebuff Web selection (premium ids, stale
 * localStorage values) to the allowed default (DeepSeek V4 Flash). */
export function resolveFreebuffWebModelForLimitedTier(
  id: string | null | undefined,
): string {
  return isFreebuffWebModelAllowedForLimitedTier(id)
    ? (id as string)
    : LIMITED_FREEBUFF_MODEL_ID
}

export function getFreebuffModelsForAccessTier(
  accessTier: FreebuffAccessTier | null | undefined,
): readonly FreebuffModelOption[] {
  if (accessTier === 'limited') return LIMITED_FREEBUFF_MODELS
  return FREEBUFF_MODELS
}

/** The model the picker highlights as the "recommended" hero so a new user can
 *  start with one Enter press without scanning the full list. Full access →
 *  MiniMax M3 (the smart, unlimited, multimodal default); limited → the
 *  always-available flash model. Both are unlimited, so the recommended pick
 *  never burns the daily premium quota. */
export function getRecommendedFreebuffModelId(
  accessTier: FreebuffAccessTier | null | undefined,
): SupportedFreebuffModelId {
  return accessTier === 'limited'
    ? LIMITED_FREEBUFF_MODEL_ID
    : DEFAULT_FREEBUFF_MODEL_ID
}

export function isFreebuffModelAllowedForAccessTier(
  model: string | null | undefined,
  accessTier: FreebuffAccessTier | null | undefined,
): boolean {
  if (!model) return false
  if (accessTier !== 'limited') return isSupportedFreebuffModelId(model)
  return LIMITED_FREEBUFF_MODEL_IDS.some((modelId) => modelId === model)
}

/** Session admission is shared by CLI/Desktop/Web/Cloud. The CLI picker only
 *  uses SUPPORTED_FREEBUFF_MODELS, while Web/Cloud have a small set of
 *  trial/god-only model ids. Those Web-only ids still draw from the same
 *  session pools, so the admission layer accepts the union here without
 *  changing the CLI picker. */
export function isFreebuffSessionModelId(
  id: string | null | undefined,
): id is SupportedFreebuffModelId | FreebuffWebModelId {
  return (
    isSupportedFreebuffModelId(id) ||
    isFreebuffWebModelId(id, {
      includeGodOnly: true,
    })
  )
}

export function isFreebuffSessionModelAllowedForAccessTier(
  model: string | null | undefined,
  accessTier: FreebuffAccessTier | null | undefined,
): boolean {
  if (!model) return false
  if (accessTier !== 'limited') return isFreebuffSessionModelId(model)
  return LIMITED_FREEBUFF_MODEL_IDS.some((modelId) => modelId === model)
}

export function isFreebuffModelId(
  id: string | null | undefined,
): id is FreebuffModelId {
  if (!id) return false
  return FREEBUFF_MODELS.some((m) => m.id === id)
}

export function isFreebuffWebModelId(
  id: string | null | undefined,
  options: { includeGodOnly?: boolean } = {},
): id is FreebuffWebModelId {
  if (!id) return false
  const models = options.includeGodOnly
    ? FREEBUFF_WEB_ALL_MODELS
    : FREEBUFF_WEB_MODELS
  return models.some((m) => m.id === id)
}

export function isFreebuffWebGodOnlyModelId(
  id: string | null | undefined,
): boolean {
  if (!id) return false
  return FREEBUFF_WEB_GOD_ONLY_MODEL_IDS.some((modelId) => modelId === id)
}

export function resolveFreebuffModel(
  id: string | null | undefined,
): FreebuffModelId {
  return isFreebuffModelId(id) ? id : FALLBACK_FREEBUFF_MODEL_ID
}

export function resolveFreebuffWebModel(
  id: string | null | undefined,
  options: { includeGodOnly?: boolean } = {},
): FreebuffWebModelId {
  return isFreebuffWebModelId(id, options)
    ? id
    : (FALLBACK_FREEBUFF_MODEL_ID as FreebuffWebModelId)
}

export function resolveFreebuffModelForAccessTier(
  id: string | null | undefined,
  accessTier: FreebuffAccessTier | null | undefined,
): SupportedFreebuffModelId {
  if (accessTier === 'limited') {
    return isFreebuffModelAllowedForAccessTier(id, accessTier)
      ? (id as SupportedFreebuffModelId)
      : LIMITED_FREEBUFF_MODEL_ID
  }
  const resolved = resolveSupportedFreebuffModel(id)
  return isFreebuffModelAllowedForAccessTier(resolved, accessTier)
    ? resolved
    : FALLBACK_FREEBUFF_MODEL_ID
}

export function resolveFreebuffSessionModelForAccessTier(
  id: string | null | undefined,
  accessTier: FreebuffAccessTier | null | undefined,
): SupportedFreebuffModelId | FreebuffWebModelId {
  if (accessTier === 'limited') {
    return isFreebuffSessionModelAllowedForAccessTier(id, accessTier)
      ? (id as SupportedFreebuffModelId)
      : LIMITED_FREEBUFF_MODEL_ID
  }
  return isFreebuffSessionModelId(id)
    ? id
    : (FALLBACK_FREEBUFF_MODEL_ID as SupportedFreebuffModelId)
}

export function isSupportedFreebuffModelId(
  id: string | null | undefined,
): id is SupportedFreebuffModelId {
  if (!id) return false
  return SUPPORTED_FREEBUFF_MODELS.some((m) => m.id === id)
}

/**
 * Match a model id against a base id, tolerating the dated provider snapshot
 * suffix OpenRouter (and our own routing) appends, e.g.
 * `google/gemini-3.1-pro-preview-20260219` for base `google/gemini-3.1-pro-preview`.
 * Mirrors the suffix logic in `isFreeModeAllowedAgentModel` (free-agents.ts) —
 * the two MUST stay in sync. Only a `-YYYYMMDD`-style suffix matches, so e.g.
 * `mimo-v2.5-pro` never matches the base `mimo-v2.5`.
 */
export function freebuffModelIdMatches(
  candidate: string | null | undefined,
  baseId: string,
): boolean {
  if (!candidate) return false
  if (candidate === baseId) return true
  const prefix = baseId + '-'
  if (!candidate.startsWith(prefix)) return false
  return /^\d{6,8}(?:$|[-:])/.test(candidate.slice(prefix.length))
}

/** Whether the requested model is Gemini Pro, tolerating the dated snapshot
 *  suffix. Use this instead of `=== FREEBUFF_GEMINI_PRO_MODEL_ID` so a caller
 *  can't dodge a Gemini gate by sending the dated id. */
export function isFreebuffGeminiProModelId(
  id: string | null | undefined,
): boolean {
  return freebuffModelIdMatches(id, FREEBUFF_GEMINI_PRO_MODEL_ID)
}

export function isFreebuffPremiumModelId(
  id: string | null | undefined,
): id is FreebuffPremiumModelId {
  if (!id) return false
  // Suffix-tolerant: a dated variant of a premium id (e.g. a dated Kimi) must
  // still count as premium so it can't dodge the premium daily rate cap.
  return FREEBUFF_PREMIUM_MODEL_IDS.some((modelId) =>
    freebuffModelIdMatches(id, modelId),
  )
}

export function isFreebuffWebPremiumModelId(
  id: string | null | undefined,
): id is FreebuffWebPremiumModelId {
  if (!id) return false
  return FREEBUFF_WEB_PREMIUM_MODEL_IDS.some((modelId) =>
    freebuffModelIdMatches(id, modelId),
  )
}

export function isFreebuffSessionPremiumModelId(
  id: string | null | undefined,
): boolean {
  return isFreebuffWebPremiumModelId(id)
}

/** Whether `model` occupies the one-per-user Freebuff Desktop premium
 *  CONCURRENCY slot (premium models + MiniMax M3 + GLM 5.2). Suffix-tolerant
 *  (dated snapshots) like the other model predicates so a dated variant can't
 *  dodge the cap. Distinct from isFreebuffPremiumModelId, which gates the daily
 *  premium QUOTA and must NOT include M3/GLM. */
export function isFreebuffDesktopPremiumBucketModelId(
  id: string | null | undefined,
): boolean {
  if (!id) return false
  return FREEBUFF_DESKTOP_PREMIUM_BUCKET_MODEL_IDS.some((modelId) =>
    freebuffModelIdMatches(id, modelId),
  )
}

/** Whether the requested model is the GLM 5.2 referral reward, tolerating the
 *  dated snapshot suffix. GLM is metered by the weekly referral-session pool
 *  rather than the daily premium pool, so callers branch on this before the
 *  premium check. */
export function isFreebuffGlmV52ModelId(
  id: string | null | undefined,
): boolean {
  return FREEBUFF_GLM_V52_MODEL_IDS.some((modelId) =>
    freebuffModelIdMatches(id, modelId),
  )
}

export function isFreebuffMultimodalModelId(
  id: string | null | undefined,
): boolean {
  if (!id) return false
  return FREEBUFF_MULTIMODAL_MODEL_IDS.some((modelId) => modelId === id)
}

export function isFreebuffWebMultimodalModelId(
  id: string | null | undefined,
): boolean {
  if (!id) return false
  return FREEBUFF_WEB_MULTIMODAL_MODEL_IDS.some((modelId) => modelId === id)
}

/** Whether we store our own chat-completion traces for this free-mode model.
 *  See FREEBUFF_TRACED_MODEL_IDS. */
export function isFreebuffTracedModelId(
  id: string | null | undefined,
): boolean {
  if (!id) return false
  return FREEBUFF_TRACED_MODEL_IDS.some((modelId) => modelId === id)
}

export function resolveSupportedFreebuffModel(
  id: string | null | undefined,
): SupportedFreebuffModelId {
  return isSupportedFreebuffModelId(id) ? id : FALLBACK_FREEBUFF_MODEL_ID
}

export function getFreebuffModel(id: string): FreebuffModelOption {
  return (
    SUPPORTED_FREEBUFF_MODELS.find((m) => m.id === id) ??
    FREEBUFF_MODELS.find((m) => m.id === FALLBACK_FREEBUFF_MODEL_ID)!
  )
}

export function getFreebuffWebModel(id: string): FreebuffModelOption {
  return (
    FREEBUFF_WEB_ALL_MODELS.find((m) => m.id === id) ??
    FREEBUFF_WEB_ALL_MODELS.find((m) => m.id === FALLBACK_FREEBUFF_MODEL_ID)!
  )
}

function getNextFreebuffDeploymentStart(now: Date): Date {
  const easternNow = getZonedParts(now, FREEBUFF_EASTERN_TIMEZONE)
  const isBeforeTodayOpen = easternNow.hour < 9

  const offset = isBeforeTodayOpen ? 0 : 1

  return getUtcForZonedTime(
    addDaysToYmd(easternNow.year, easternNow.month, easternNow.day, offset),
    FREEBUFF_EASTERN_TIMEZONE,
    9,
    0,
  )
}

function getCurrentFreebuffDeploymentEnd(now: Date): Date {
  const pacificNow = getZonedParts(now, FREEBUFF_PACIFIC_TIMEZONE)
  return getUtcForZonedTime(pacificNow, FREEBUFF_PACIFIC_TIMEZONE, 17, 0)
}

function isSameLocalDay(left: Date, right: Date, timeZone?: string): boolean {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(left) === formatter.format(right)
}

function formatLocalTime(
  date: Date,
  referenceNow: Date,
  options: LocalTimeFormatOptions = {},
): string {
  const shouldShowWeekday = !isSameLocalDay(
    date,
    referenceNow,
    options.timeZone,
  )
  return new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    weekday: shouldShowWeekday ? 'short' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function getFreebuffDeploymentAvailabilityLabel(
  now: Date = new Date(),
  options: LocalTimeFormatOptions = {},
): string {
  if (isFreebuffDeploymentHours(now)) {
    const closesAt = getCurrentFreebuffDeploymentEnd(now)
    return `until ${formatLocalTime(closesAt, now, options)}`
  }

  const opensAt = getNextFreebuffDeploymentStart(now)
  return `opens ${formatLocalTime(opensAt, now, options)}`
}

export function isFreebuffDeploymentHours(now: Date = new Date()): boolean {
  const eastern = getZonedParts(now, FREEBUFF_EASTERN_TIMEZONE)
  const pacific = getZonedParts(now, FREEBUFF_PACIFIC_TIMEZONE)
  return (
    eastern.hour * 60 + eastern.minute >= 9 * 60 &&
    pacific.hour * 60 + pacific.minute < 17 * 60
  )
}

export function isFreebuffModelAvailable(
  id: string,
  now: Date = new Date(),
): boolean {
  const model = SUPPORTED_FREEBUFF_MODELS.find((m) => m.id === id)
  if (!model) return false
  return model.availability === 'always' || isFreebuffDeploymentHours(now)
}

export function isFreebuffSessionModelAvailable(
  id: string,
  now: Date = new Date(),
): boolean {
  const model = getFreebuffWebModel(id)
  return model.availability === 'always' || isFreebuffDeploymentHours(now)
}

export function resolveAvailableFreebuffModel(
  id: string | null | undefined,
  now: Date = new Date(),
): FreebuffModelId {
  const resolved = resolveFreebuffModel(id)
  return isFreebuffModelAvailable(resolved, now)
    ? resolved
    : FALLBACK_FREEBUFF_MODEL_ID
}
