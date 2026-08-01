import {
  addDaysToYmd,
  getUtcForZonedTime,
  getZonedParts,
  type ZonedDateParts,
} from '../util/zoned-time'
import { mimoModels, moonshotModels, openrouterModels } from './model-config'
import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
} from './freebuff-model-ids'
import {
  FREEBUFF_AI_TRAINING_NOTICE,
  type FreebuffModelDataUse,
} from './freebuff-data-use'

export {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
} from './freebuff-model-ids'

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
  /** Optional caveat shown in the picker (e.g. AI-training warning).
   *  Rendered in the warning/secondary color so users spot it before
   *  picking the model. */
  warning?: string
  /** Machine-readable data-use policy. Never infer storage or training
   *  behavior from the human-readable warning text. */
  dataUse: FreebuffModelDataUse
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
  /** Freshly released or freshly re-trained. Surfaced as a "NEW" badge so a
   *  returning user notices the model changed rather than assuming it is the
   *  same one they already formed an opinion about. Clear it once the model
   *  stops being news. */
  isNew?: boolean
  /** Set when another model has overtaken this one and users should generally
   *  move. Pickers render `notice` on the row and offer a one-click switch to
   *  `modelId`. Kept structured rather than folded into `warning` so the button
   *  has a real target, and so this stays distinct from the data-use caveat —
   *  a row can carry both. */
  supersededBy?: {
    modelId: string
    notice: string
    actionLabel: string
  }
}

/** Server-facing fallback copy for APIs and provider errors that can't know
 *  the caller's local timezone. The CLI should render
 *  `getFreebuffDeploymentAvailabilityLabel()` instead. */
export const FREEBUFF_DEPLOYMENT_HOURS_LABEL = '9am ET-5pm PT every day'
export const FREEBUFF_GEMINI_PRO_MODEL_ID = 'google/gemini-3.1-pro-preview'
/** DeepSeek V4 Flash served by Fireworks instead of DeepSeek's direct API.
 *  Used only by freebuff.com/chat, where Fireworks' faster inference is worth
 *  a slightly less capable serving stack. Not in SUPPORTED_FREEBUFF_MODELS or
 *  the free-mode allowlists — the CLI and web builder keep DeepSeek direct. */
export const FREEBUFF_DEEPSEEK_V4_FLASH_FIREWORKS_MODEL_ID =
  'fireworks/deepseek-v4-flash'
export const FREEBUFF_HY3_OPENROUTER_FREE_MODEL_ID =
  openrouterModels.openrouter_tencent_hy3_free
export const FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID =
  openrouterModels.openrouter_tencent_hy3
/** Legacy alias retained for the direct Atlas fallback implementation. New
 * paid HY3 selections route through OpenRouter. */
export const FREEBUFF_HY3_ATLAS_MODEL_ID = FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID
export const FREEBUFF_HY3_MODEL_ID = FREEBUFF_HY3_OPENROUTER_FREE_MODEL_ID
export const FREEBUFF_MIMO_V25_MODEL_ID = mimoModels.mimoV25
export const FREEBUFF_MIMO_V25_PRO_MODEL_ID = mimoModels.mimoV25Pro
/** GLM 5.2 (Z.ai), served by CrofAI (moved off Fireworks serverless
 *  2026-07-29 — CrofAI is the same upstream as the crof/ route below at ~4x
 *  less than Fireworks' list price). Unlike the other picker models it is NOT
 *  freely available — it is unlocked by referring friends. Each qualified
 *  referral grants one 1-hour GLM session per day, uncapped since 2026-07-30.
 *  Gated by a per-user daily session pool whose limit equals the caller's GLM
 *  referral score (see the free-session quota). */
export const FREEBUFF_GLM_V52_MODEL_ID = 'z-ai/glm-5.2'
/** LEGACY GLM 5.2 route served by CrofAI's direct OpenAI-compatible API. It was
 *  the premium-pool copy of GLM 5.2 for full-access Freebuff Web/Cloud users.
 *
 *  RETIRED FROM THE PICKER 2026-07-30: GLM 5.2 is a referral-earned reward
 *  only, so this route is filtered out of the Web/Cloud selector and the
 *  REFERRAL route (FREEBUFF_GLM_V52_MODEL_ID, metered by the daily GLM pool)
 *  is the sole way to reach the model. Nothing can newly select it —
 *  `resolveRememberedFreebuffWebModel` never persisted it either — so the
 *  remaining traffic is sessions that were already live at the cutover.
 *
 *  Deliberately still a valid session model and still in
 *  FREEBUFF_WEB_PREMIUM_MODEL_IDS: removing it from the model catalog would
 *  fail admission mid-session, and removing it from the premium pool alone
 *  would leave those sessions metered by NO pool (quotaConfigForModel returns
 *  undefined => unlimited). Both routes serve from the same CrofAI upstream at
 *  the same price, so the only thing this id still decides is which quota pool
 *  a pre-existing session draws from. Safe to delete once no live sessions
 *  reference it.
 *
 *  It remains absent from FREEBUFF_WEB_GEO_EXEMPT_MODEL_IDS, so limited regions
 *  could never select it.
 *
 *  This is an internal wire ID; CrofAI receives its native `glm-5.2` model ID. */
export const FREEBUFF_CROF_GLM_V52_MODEL_ID = 'crof/glm-5.2'
/** GPT-5.6 Luna (OpenAI), served through OpenRouter. The id is OpenRouter's own
 *  slug, so it falls through to the default OpenRouter route with no
 *  provider-specific handler (same as Ling 3.0 Flash).
 *
 *  Two things about this model are enforced server-side rather than left to the
 *  agent definitions, so they hold for every Freebuff surface, every subagent,
 *  and BYOK callers alike (see applyOpenRouterProviderRouting and
 *  applyOpenRouterReasoningDefaults in web/src/llm-api/openrouter.ts):
 *
 *   - Routing is PINNED to OpenAI's own endpoint. OpenRouter also lists Azure
 *     and Amazon Bedrock for this model at $1.00/$6.00 per M — 10x OpenAI's
 *     $0.10/$0.60 — so unpinned routing is a silent 10x bill (cf. the
 *     Kimi/Infron unit-price doubling, 2026-07-29).
 *   - Reasoning effort is `high`. Luna is cheap enough per token that the
 *     quality is worth more than the reasoning tokens.
 *
 *  Both are scoped to FREEBUFF traffic on purpose: `LITE_MODEL`
 *  (agents/constants.ts) is this same model id, so keying either off the model
 *  alone would change Codebuff's paid lite mode as a side effect. */
export const FREEBUFF_GPT_5_6_LUNA_MODEL_ID = 'openai/gpt-5.6-luna'
/** OpenRouter provider slug Luna is pinned to. */
export const FREEBUFF_GPT_5_6_LUNA_PROVIDER_ROUTE = 'openai'
/** Price ceiling for Luna, USD per million tokens. Sent as OpenRouter's
 *  `provider.max_price`, which REFUSES the request rather than serving above
 *  it, so a provider re-pricing surfaces as a loud error instead of a 10x
 *  invoice.
 *
 *  This is a COST FENCE, not an assertion of the list price, and the gap is
 *  deliberate on both sides:
 *
 *   - It must sit ABOVE list. OpenRouter compares strictly: shipping the exact
 *     list price (0.1 / 0.6) made every Luna request 404 with "No endpoints
 *     found that satisfy the max price for this request" — verified against the
 *     live API on 2026-07-30, where 0.11/0.61 passed and 0.1/0.6 did not. A
 *     ceiling equal to list is an outage waiting on a rounding change.
 *   - It must sit WELL BELOW $1.00/$6.00, which is what Azure, Azure EU
 *     ($1.10/$6.60) and Amazon Bedrock charge for this model. Blocking those is
 *     the whole point.
 *
 *  Half of Azure's price leaves room for OpenAI's own tiers (list $0.10/$0.60,
 *  priority $0.20/$1.20) and for ordinary price drift, while still failing
 *  closed long before a 10x endpoint could serve a request. */
export const FREEBUFF_GPT_5_6_LUNA_MAX_PRICE = {
  prompt: 0.5,
  completion: 3.0,
} as const
/** Reasoning effort every Luna turn runs at. */
export const FREEBUFF_GPT_5_6_LUNA_REASONING_EFFORT = 'high' as const
/** God-mode-only Laguna S 2.1 route used to test Poolside's direct
 *  OpenAI-compatible API before wider rollout. */
export const FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID = 'poolside/laguna-s-2.1'
/** God-mode-only alias for testing the paid OpenRouter route independently
 *  from Poolside's direct API. OpenRouter receives `poolside/laguna-s-2.1`. */
export const FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID =
  'openrouter/poolside/laguna-s-2.1'
/** God-mode-only Ling 3.0 Flash (inclusionAI), a 124B MoE served free by
 *  OpenRouter. The id is OpenRouter's own slug, so it falls through to the
 *  default OpenRouter route with no provider-specific handler. Free endpoints
 *  are metered by OpenRouter per-account, so keep this god-only until its
 *  throughput under real turns is known. */
export const FREEBUFF_LING_3_FLASH_MODEL_ID = 'inclusionai/ling-3.0-flash:free'

/**
 * Claude Fable 5 — Anthropic's frontier model, offered to free CLI users as a
 * capacity-limited trial rather than as a standing picker model.
 *
 * It is deliberately NOT in FREEBUFF_MODELS: no client may render it from its
 * own catalog. The server decides, per request, whether the shared pool still
 * has sessions left and says so in the session response
 * (`limitedModelOffers`); a client that receives nothing renders exactly what
 * it rendered before the offer existed. See FREEBUFF_LIMITED_OFFER_MODEL_IDS.
 */
export const FREEBUFF_FABLE_5_MODEL_ID = 'anthropic/claude-fable-5'
/** UI-only rollout switch. Backend support and free-mode allowlists remain
 *  wired even when these models are hidden from the Freebuff picker. */
export const FREEBUFF_ENABLE_MIMO_MODELS_IN_UI = true
/** UI-only rollout switch for the streak indicator in the waiting room. */
export const FREEBUFF_ENABLE_STREAK_IN_UI = true
/** Local/debug switch: force the localhost free-mode country bypass into
 *  limited access so the limited Freebuff UX can be exercised without an env
 *  var. */
export const FREEBUFF_FORCE_LIMITED_MODE = false
export const FREEBUFF_PREMIUM_SESSION_LIMIT = 6
export const FREEBUFF_LIMITED_SESSION_LIMIT = 6
/** Full-access Web/Cloud models outside the premium/referral pools. The CLI
 * keeps these models unlimited; browser surfaces cap fresh sessions to deter
 * automated project/session churn. */
export const FREEBUFF_WEB_STANDARD_SESSION_LIMIT = 6
export const FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE = 'America/Los_Angeles'
export const FREEBUFF_PREMIUM_SESSION_PERIOD = 'pacific_day'
/** GLM 5.2 referral-reward session pool. Distinct from the shared premium
 *  daily pool: GLM sessions reset daily (Pacific; weekly until 2026-07-29) and
 *  the per-user limit is the caller's GLM referral score, uncapped since
 *  2026-07-30. Note the streak GLM bonus is a live entitlement on this same
 *  pool, so it refills at this cadence too. */
export const FREEBUFF_GLM_V52_SESSION_PERIOD = FREEBUFF_PREMIUM_SESSION_PERIOD
export const FREEBUFF_GLM_V52_SESSION_RESET_TIMEZONE =
  FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE
export const FREEBUFF_GLM_V52_SESSION_WINDOW_HOURS = 24
// The GLM referral reward is UNCAPPED as of 2026-07-30 (it was
// FREEBUFF_GLM_V52_REFERRAL_CAP = 10): every qualified full-access referral
// grants one 1-hour GLM session per day, with no read-time ceiling. The only
// remaining bound is FREEBUFF_REFERRAL_SIGNUP_LIMIT (100 attributed rows per
// referrer, enforced at attribution), which is now the effective maximum
// rather than the anti-spam backstop it used to be.
/** Master kill-switch for the GLM 5.2 referral program. While true, qualified
 *  referrals grant daily GLM sessions and the CLI advertises the perk. Flip to
 *  false to wind the program down: entitlement drops to 0 for everyone and the
 *  CLI stops showing the banner. The perk is intentionally framed as
 *  limited-time in the UI so turning this off isn't a surprise. */
export const FREEBUFF_GLM_V52_REFERRAL_ENABLED = true
/** GLM sessions are exactly one hour of wall-clock time, regardless of the
 *  global free-session length, so the "1 hour per referral per day" promise is
 *  exact. */
export const FREEBUFF_GLM_V52_SESSION_LENGTH_MS = 60 * 60 * 1000
export const FREEBUFF_LIMITED_SESSION_RESET_TIMEZONE =
  FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE
export const FREEBUFF_LIMITED_SESSION_PERIOD = FREEBUFF_PREMIUM_SESSION_PERIOD
export const FREEBUFF_WEB_STANDARD_SESSION_RESET_TIMEZONE =
  FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE
export const FREEBUFF_WEB_STANDARD_SESSION_PERIOD =
  FREEBUFF_PREMIUM_SESSION_PERIOD

/**
 * Streak rewards. Once a user reaches a `FREEBUFF_STREAK_REWARD_INTERVAL_DAYS`
 * (7)-day daily streak, they earn:
 *   - +1 session in their primary daily pool (premium for full-access users,
 *     limited for limited-access) **every day** the streak stays at 7+; and
 *   - for full-access users, +1 GLM 5.2 session per GLM-pool window per
 *     completed 7 days of the current streak (7 days → 1, 14 → 2), capped at
 *     `FREEBUFF_STREAK_GLM_BONUS_MAX_MULTIPLIER` (28-day streak), on top of
 *     referrals. The GLM pool resets daily (Pacific) since 2026-07-29, weekly
 *     before.
 *
 * The daily premium/limited bonus is persisted after today's first use. The
 * GLM bonus is derived live from the current streak, so it refills at the GLM
 * pool reset and shuts off as soon as the streak breaks.
 */
export const FREEBUFF_STREAK_REWARD_INTERVAL_DAYS = 7
/** Cap on the GLM streak bonus: at most this many 7-day tiers count, so a
 *  28-day (or longer) streak earns 4 GLM sessions per pool window. */
export const FREEBUFF_STREAK_GLM_BONUS_MAX_MULTIPLIER = 4
/** Master kill-switch for streak rewards. When false, streaks grant nothing
 *  and effective limits fall back to the base pool limits. */
export const FREEBUFF_STREAK_REWARDS_ENABLED = true
/** Sub-switch for the recurring full-access GLM 5.2 streak entitlement. Lets
 *  the perk be wound down independently of the premium/limited bonus (and of
 *  the separate referral-driven GLM program). */
export const FREEBUFF_STREAK_GLM_BONUS_ENABLED = true
/** Session units added to an eligible streak-reward pool. One whole session. */
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
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
])

export function canFreebuffModelSpawnGeminiThinker(modelId: string): boolean {
  return FREEBUFF_GEMINI_THINKER_PARENT_MODELS.has(modelId)
}

/**
 * Hard context windows (in tokens) of the freebuff models, keyed by the backend
 * model id sent to the completions endpoint.
 *
 * Every number was read off a real provider rejection in prod rather than a
 * spec sheet, so it is the limit the provider actually enforces:
 *   minimax-m3            "model maximum context length: 524287"
 *   deepseek-v4-flash     "model maximum context length: 1048575"
 *   kimi-k2.7-code        "Range of input length should be [1, 262144]"
 *
 * The consumer is agents/base-chat.ts, which prunes a chat thread's replayed
 * history to a fraction of the selected model's window. Its `handleSteps` is
 * serialized with toString() and so cannot import — it inlines a copy of this
 * table, and agents/__tests__/base-chat.test.ts fails if the two drift. This
 * is the reference copy: add a model here (with the rejection text that proves
 * the number) and the test will tell you to mirror it.
 *
 * Models absent from the map fall back to FREEBUFF_DEFAULT_CONTEXT_WINDOW. The
 * risk is asymmetric — guessing too high silently wedges a thread forever,
 * guessing too low only prunes earlier than strictly needed — so a model is
 * added only once its real limit has been observed.
 */
export const FREEBUFF_MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  [FREEBUFF_MINIMAX_M3_MODEL_ID]: 524_288,
  [FREEBUFF_DEEPSEEK_V4_FLASH_FIREWORKS_MODEL_ID]: 1_048_576,
}

/** Window assumed for any model missing from FREEBUFF_MODEL_CONTEXT_WINDOWS.
 *  Smaller than every window we have measured. */
export const FREEBUFF_DEFAULT_CONTEXT_WINDOW = 131_072

/** The "a better model exists" copy every superseded model points at, shared so
 *  three rows can't drift into three different sentences.
 *
 *  Names the DATED build. The wire id is undated and auto-updates, so the row a
 *  user is being steered TO is labelled "DeepSeek V4 Flash 07/31" in every
 *  picker (see DEEPSEEK_V4_FLASH_MODEL.displayName) — matching it exactly is
 *  what makes the notice point at something visible on screen rather than at a
 *  name nothing in the list carries.
 *
 *  Kept short on purpose: pickers render it as its own line, and in the CLI it
 *  is the longest line in the menu, so it sets the width of every card. */
const FLASH_SUPERSEDES_NOTICE =
  'DeepSeek V4 Flash 07/31 performs better for most tasks.'

const DEEPSEEK_V4_PRO_MODEL = {
  id: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  displayName: 'DeepSeek V4 Pro',
  tagline: 'Deep reasoning',
  availability: 'always',
  warning: FREEBUFF_AI_TRAINING_NOTICE,
  dataUse: 'training',
  premium: true,
  multimodal: false,
  // DeepSeek's V4-Flash-0731 GA build (2026-07-31) was re-post-trained for
  // agent work and now beats V4 Pro on coding and tool-use benchmarks, while
  // being cheaper and outside the premium pool. Pro stays selectable for people
  // who want its longer deliberation, but the picker says so plainly.
  supersededBy: {
    modelId: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    notice: FLASH_SUPERSEDES_NOTICE,
    actionLabel: 'Switch to V4 Flash',
  },
} as const satisfies FreebuffModelOption

const MIMO_V25_PRO_MODEL = {
  id: FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  displayName: 'MiMo 2.5 Pro',
  tagline: 'Smart & Slow',
  availability: 'always',
  dataUse: 'service',
  premium: true,
  // The Pro endpoint is text-only. Sending image content makes the provider
  // reject the request, unlike the non-Pro MiMo 2.5 endpoint.
  multimodal: false,
} as const satisfies FreebuffModelOption

const HY3_MODEL = {
  id: FREEBUFF_HY3_MODEL_ID,
  displayName: 'HY3',
  tagline: 'Trialing its performance',
  availability: 'always',
  dataUse: 'service',
  premium: true,
  multimodal: false,
  experimental: true,
} as const satisfies FreebuffModelOption

const HY3_OPENROUTER_PAID_MODEL = {
  id: FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID,
  displayName: 'HY3 (OpenRouter)',
  tagline: 'Paid via OpenRouter',
  availability: 'always',
  dataUse: 'service',
  premium: true,
  multimodal: false,
  experimental: true,
} as const satisfies FreebuffModelOption

const MIMO_V25_MODEL = {
  id: FREEBUFF_MIMO_V25_MODEL_ID,
  displayName: 'MiMo 2.5',
  tagline: 'Balanced',
  availability: 'always',
  dataUse: 'service',
  premium: false,
  multimodal: true,
  // Same price as Flash and outclassed by it, so there is no cost argument to
  // weigh — just a better model. Note this is the limited tier's other pick and
  // its only natively-multimodal one; steering off it is only reasonable
  // because Flash reads images through the describe pipeline on every surface
  // (server/images/describe.ts, server/chat/image-context.ts).
  supersededBy: {
    modelId: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    notice: FLASH_SUPERSEDES_NOTICE,
    actionLabel: 'Switch to V4 Flash',
  },
} as const satisfies FreebuffModelOption

const DEEPSEEK_V4_FLASH_MODEL = {
  id: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  // Dated on purpose: the wire id is undated and auto-updates, so without the
  // date a returning user sees the same name and assumes the same model. The
  // 0731 GA build is a different, re-post-trained model.
  displayName: 'DeepSeek V4 Flash 07/31',
  tagline: 'Smartest & Fastest',
  availability: 'always',
  warning: FREEBUFF_AI_TRAINING_NOTICE,
  dataUse: 'training',
  premium: false,
  multimodal: false,
  isNew: true,
} as const satisfies FreebuffModelOption

const MINIMAX_M3_MODEL = {
  id: FREEBUFF_MINIMAX_M3_MODEL_ID,
  displayName: 'MiniMax M3',
  tagline: 'Fastest',
  availability: 'always',
  dataUse: 'service',
  // M3 is served by Fireworks without provider-side training. Its `service`
  // data-use classification keeps it out of FREEBUFF_TRACED_MODEL_IDS.
  premium: true,
  multimodal: true,
  // Flash overtook M3 on quality and is free rather than premium-pooled. M3
  // stays selectable — it is still the no-AI-training pick and natively
  // multimodal — but the picker says Flash is the better default.
  supersededBy: {
    modelId: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    notice: FLASH_SUPERSEDES_NOTICE,
    actionLabel: 'Switch to V4 Flash',
  },
} as const satisfies FreebuffModelOption

const GPT_5_6_LUNA_MODEL = {
  id: FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  displayName: 'GPT-5.6 Luna',
  tagline: 'Thinks hard & Fast',
  availability: 'always',
  // OpenAI's API does not train on request data, and the route carries
  // data_collection: 'deny', so no AI-training notice and no trace storage
  // (FREEBUFF_TRACED_MODEL_IDS keys off this).
  dataUse: 'service',
  premium: true,
  // OpenRouter reports input modalities text + image + file for this model.
  multimodal: true,
} as const satisfies FreebuffModelOption

const GLM_V52_MODEL = {
  id: FREEBUFF_GLM_V52_MODEL_ID,
  displayName: 'GLM 5.2',
  tagline: 'Unlock by referring friends',
  availability: 'always',
  dataUse: 'service',
  // Served by Fireworks without provider-side training; its `service`
  // data-use classification keeps GLM out of FREEBUFF_TRACED_MODEL_IDS.
  // `premium` drives the "Premium" badge styling in the picker; GLM's real
  // gate is its weekly referral-session pool, not the daily premium pool.
  premium: true,
  multimodal: false,
} as const satisfies FreebuffModelOption

// Legacy premium-pool GLM 5.2 (see FREEBUFF_CROF_GLM_V52_MODEL_ID). Retired
// from the picker 2026-07-30 but kept in FREEBUFF_WEB_MODELS so sessions that
// were live at the cutover still resolve to a real model option.
const CROF_GLM_V52_MODEL = {
  id: FREEBUFF_CROF_GLM_V52_MODEL_ID,
  displayName: 'GLM 5.2',
  tagline: 'Strong all-rounder',
  availability: 'always',
  // Served by CrofAI without provider-side training, like the referral GLM
  // route; its `service` classification keeps it out of
  // FREEBUFF_TRACED_MODEL_IDS.
  dataUse: 'service',
  // The quota that still matters for live sessions: this route is metered by
  // the shared daily premium pool (FREEBUFF_WEB_PREMIUM_MODEL_IDS).
  premium: true,
  multimodal: false,
} as const satisfies FreebuffModelOption

const POOLSIDE_LAGUNA_S_21_MODEL = {
  id: FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID,
  displayName: 'Laguna S 2.1 (Poolside)',
  tagline: 'Direct Poolside API',
  availability: 'always',
  dataUse: 'service',
  premium: true,
  multimodal: false,
  experimental: true,
} as const satisfies FreebuffModelOption

const POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL = {
  id: FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID,
  displayName: 'Laguna S 2.1 (OpenRouter)',
  tagline: 'Paid via OpenRouter',
  availability: 'always',
  dataUse: 'service',
  premium: true,
  multimodal: false,
  experimental: true,
} as const satisfies FreebuffModelOption

const FABLE_5_MODEL = {
  id: FREEBUFF_FABLE_5_MODEL_ID,
  displayName: 'Claude Fable 5',
  tagline: "Anthropic's most intelligent model",
  availability: 'always',
  // Load-bearing, not decoration: `dataUse: 'training'` is what puts this model
  // in FREEBUFF_TRACED_MODEL_IDS, which is the entire point of the trial — we
  // are buying hour-long agent traces with the pool. The warning is the
  // disclosure that makes that legitimate, and the catalog invariant test
  // requires the two to agree.
  warning: FREEBUFF_AI_TRAINING_NOTICE,
  dataUse: 'training',
  // Not in FREEBUFF_PREMIUM_MODEL_IDS: the daily premium pool is shared across
  // its models and Fable is metered by its OWN global pool instead (see
  // FREEBUFF_LIMITED_OFFER_MODEL_IDS). The flag only marks it as scarce for the
  // pickers' styling and for FREEBUFF_WEB_STANDARD_MODEL_IDS, which must not
  // absorb it.
  premium: true,
  multimodal: true,
  isNew: true,
} as const satisfies FreebuffModelOption

const LING_3_FLASH_MODEL = {
  id: FREEBUFF_LING_3_FLASH_MODEL_ID,
  displayName: 'Ling 3.0 Flash',
  tagline: 'Free via OpenRouter',
  availability: 'always',
  // OpenRouter's free endpoints route to providers that may retain and train
  // on prompts, and the bundled agent opts into data_collection.
  warning: FREEBUFF_AI_TRAINING_NOTICE,
  dataUse: 'training',
  premium: true,
  multimodal: false,
  experimental: true,
} as const satisfies FreebuffModelOption

export const SUPPORTED_FREEBUFF_MODELS = [
  DEEPSEEK_V4_PRO_MODEL,
  MIMO_V25_PRO_MODEL,
  MINIMAX_M3_MODEL,
  GPT_5_6_LUNA_MODEL,
  GLM_V52_MODEL,
  DEEPSEEK_V4_FLASH_MODEL,
  MIMO_V25_MODEL,
  FABLE_5_MODEL,
] as const satisfies readonly FreebuffModelOption[]

// GLM 5.2 is intentionally NOT in FREEBUFF_MODELS: it isn't a freely-pickable
// grid model, it's a referral reward surfaced by the separate referral banner.
// It stays in SUPPORTED_FREEBUFF_MODELS so the session/chat layers accept it as
// a valid model id once the user's weekly entitlement admits them.
//
// MiMo 2.5 Pro is RETIRED FROM THE CLIENT PICKERS (2026-07-31) but still in
// SUPPORTED_FREEBUFF_MODELS, the free-mode allowlists and provider routing, so
// already-released clients and live sessions keep resolving. This is the same
// staged shape Kimi K2.7 Code went through — note that Kimi's server half was
// since removed entirely, so treat that as the template for finishing this one
// once old clients are out of circulation. The non-Pro MiMo 2.5 is unaffected.
export const FREEBUFF_MODELS = [
  DEEPSEEK_V4_FLASH_MODEL,
  DEEPSEEK_V4_PRO_MODEL,
  GPT_5_6_LUNA_MODEL,
  MINIMAX_M3_MODEL,
  ...(FREEBUFF_ENABLE_MIMO_MODELS_IN_UI ? [MIMO_V25_MODEL] : []),
] as const satisfies readonly FreebuffModelOption[]

export const FREEBUFF_PREMIUM_MODEL_IDS = [
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
] as const

// ---------------------------------------------------------------------------
// Limited-offer models
//
// A model here is NOT in any client's picker catalog. The server counts how
// many sessions the current wave has left out of one GLOBAL pool and, only
// while the pool has capacity, tells the client about it in the session
// response (`limitedModelOffers`). Clients render the extra row from that
// payload and nothing else — so when the pool is spent, the offer disappears
// with no client release, and a client that never learned about the offer is
// byte-identical to what it is today.
//
// This exists because these are frontier models we cannot afford to leave
// standing open, and because the point of running them at all is the traces:
// they are `dataUse: 'training'`, so every hour-long session lands in
// chat_completion_traces (FREEBUFF_TRACED_MODEL_IDS).
// ---------------------------------------------------------------------------

/** Models offered only while their shared global pool has sessions left. */
export const FREEBUFF_LIMITED_OFFER_MODEL_IDS = [
  FREEBUFF_FABLE_5_MODEL_ID,
] as const

export type FreebuffLimitedOfferModelId =
  (typeof FREEBUFF_LIMITED_OFFER_MODEL_IDS)[number]

/** Suffix-tolerant like the other model predicates, so a dated provider
 *  snapshot can't dodge the pool accounting. */
export function isFreebuffLimitedOfferModelId(
  id: string | null | undefined,
): boolean {
  if (!id) return false
  return FREEBUFF_LIMITED_OFFER_MODEL_IDS.some((modelId) =>
    freebuffModelIdMatches(id, modelId),
  )
}

/**
 * Per-user daily ceiling on limited-offer sessions, on top of the global pool.
 *
 * One. A 50-session pool spent by five people is five traces of five people's
 * habits; spent by fifty people it is the distribution we actually want to
 * learn from. It also bounds what one account can cost us on a frontier model
 * whose sessions run a full hour.
 */
export const FREEBUFF_LIMITED_OFFER_SESSION_LIMIT = 1

/** Reset cadence for the per-user ceiling above — same Pacific-day boundary as
 *  every other freebuff pool, so a user sees one reset time, not two. */
export const FREEBUFF_LIMITED_OFFER_SESSION_PERIOD =
  FREEBUFF_PREMIUM_SESSION_PERIOD
export const FREEBUFF_LIMITED_OFFER_SESSION_RESET_TIMEZONE =
  FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE
export const FREEBUFF_LIMITED_OFFER_SESSION_WINDOW_HOURS =
  FREEBUFF_PREMIUM_SESSION_WINDOW_HOURS

/** Freebuff Web-only picker/support set. HY3 is intentionally excluded from
 *  FREEBUFF_MODELS and SUPPORTED_FREEBUFF_MODELS so CLI/Desktop freebuff
 *  surfaces do not pick it up during the initial web rollout. */
export const FREEBUFF_WEB_MODELS = [
  HY3_MODEL,
  GLM_V52_MODEL,
  CROF_GLM_V52_MODEL,
  ...FREEBUFF_MODELS,
] as const satisfies readonly FreebuffModelOption[]

export const FREEBUFF_WEB_GOD_ONLY_MODELS = [
  LING_3_FLASH_MODEL,
  POOLSIDE_LAGUNA_S_21_MODEL,
  POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL,
  HY3_OPENROUTER_PAID_MODEL,
] as const satisfies readonly FreebuffModelOption[]

export const FREEBUFF_WEB_ALL_MODELS = [
  ...FREEBUFF_WEB_GOD_ONLY_MODELS,
  ...FREEBUFF_WEB_MODELS,
] as const satisfies readonly FreebuffModelOption[]

export const FREEBUFF_WEB_GOD_ONLY_MODEL_IDS = [
  FREEBUFF_LING_3_FLASH_MODEL_ID,
  FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID,
  FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID,
  FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID,
] as const

/**
 * Web/Cloud models the picker no longer offers, while the backend keeps
 * honoring them so a session already running on one finishes normally.
 *
 * They stay in FREEBUFF_WEB_MODELS (and in whichever quota list meters them)
 * on purpose: dropping a live session's model from the catalog fails
 * admission mid-run, and dropping it from its quota list alone would leave it
 * metered by NO pool at all. Retiring is therefore picker-only; deleting the
 * id outright is a separate cleanup once no live session references it.
 *
 *   - HY3 — withdrawn during the initial web rollout.
 *   - CrofAI GLM 5.2 (2026-07-30) — GLM 5.2 became a referral-only reward, so
 *     the premium-pool copy is gone and FREEBUFF_GLM_V52_MODEL_ID (the daily
 *     referral pool) is the only way to reach the model on any surface.
 */
export const FREEBUFF_WEB_RETIRED_PICKER_MODEL_IDS = [
  FREEBUFF_HY3_MODEL_ID,
  FREEBUFF_CROF_GLM_V52_MODEL_ID,
] as const

/** Whether the Web/Cloud picker should offer `id` as a new selection. False
 *  for retired routes (see FREEBUFF_WEB_RETIRED_PICKER_MODEL_IDS), which the
 *  backend still serves for sessions already on them. */
export function isFreebuffWebSelectableModelId(
  id: string | null | undefined,
): boolean {
  if (!id) return false
  return !FREEBUFF_WEB_RETIRED_PICKER_MODEL_IDS.some(
    (modelId) => modelId === id,
  )
}

/** Models metered by the SHARED daily premium pool. Still includes the retired
 *  CrofAI GLM 5.2 route so sessions live at its 2026-07-30 cutover stay
 *  metered (see FREEBUFF_CROF_GLM_V52_MODEL_ID); no new session can select it.
 *  The REFERRAL GLM route (FREEBUFF_GLM_V52_MODEL_IDS) is held out because its
 *  entitlement is earned rather than granted daily. */
export const FREEBUFF_WEB_PREMIUM_MODEL_IDS = [
  ...FREEBUFF_PREMIUM_MODEL_IDS,
  FREEBUFF_CROF_GLM_V52_MODEL_ID,
  FREEBUFF_HY3_MODEL_ID,
  FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID,
  FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID,
  FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID,
  FREEBUFF_LING_3_FLASH_MODEL_ID,
] as const

/** Full-access Web/Cloud models sharing the browser-only standard daily pool. */
export const FREEBUFF_WEB_STANDARD_MODEL_IDS = Object.freeze(
  FREEBUFF_WEB_ALL_MODELS.filter((model) => !model.premium).map(
    (model) => model.id,
  ),
)

/** Models unlocked by referrals, metered by the daily GLM session pool rather
 *  than the daily premium pool. Kept separate from FREEBUFF_PREMIUM_MODEL_IDS
 *  so GLM never falls into the shared daily premium quota. Since 2026-07-30
 *  this is the ONLY way to reach GLM 5.2 on any surface. */
export const FREEBUFF_GLM_V52_MODEL_IDS = [FREEBUFF_GLM_V52_MODEL_ID] as const

/** The retired CrofAI GLM 5.2 route. This is an IDENTITY list, not a quota
 *  bucket — the route is metered by the shared premium pool (it is in
 *  FREEBUFF_WEB_PREMIUM_MODEL_IDS). Callers use it to tell the two same-named
 *  GLM 5.2 routes apart, e.g. for the never-remember rule and the picker's
 *  retired-model filter. */
export const FREEBUFF_CROF_GLM_V52_MODEL_IDS = [
  FREEBUFF_CROF_GLM_V52_MODEL_ID,
] as const

/** Models that occupy the single per-user "premium-bucket" CONCURRENCY slot in
 *  Freebuff Desktop's multi-session mode: at most one of these may have an
 *  active session per user at a time, while unlimited-bucket models (DeepSeek V4
 *  Flash, MiMo 2.5) may run in up to three concurrent tabs. (On the LIMITED
 *  access tier the admission path puts EVERY model in the slot regardless of
 *  this list — limited users get one freebuff tab at a time; see
 *  `requestDesktopSession`.)
 *
 *  This is strictly a CONCURRENCY bucket, NOT a quota bucket. It is intentionally
 *  a SUPERSET of FREEBUFF_PREMIUM_MODEL_IDS: it also includes GLM 5.2, which is
 *  metered weekly for QUOTA purposes but expensive enough that we cap it to one
 *  concurrent desktop session. Do NOT use this for the daily premium quota —
 *  that stays on isFreebuffPremiumModelId so GLM never starts burning the
 *  5/day premium pool. */
export const FREEBUFF_DESKTOP_PREMIUM_BUCKET_MODEL_IDS = [
  ...FREEBUFF_PREMIUM_MODEL_IDS,
  FREEBUFF_GLM_V52_MODEL_ID,
] as const

/** Concurrent Freebuff Desktop sessions per model bucket. Premium is also
 * enforced by the database's partial unique index; unlimited is enforced by
 * the desktop soft gate and the chat-completions session gate. */
export const FREEBUFF_DESKTOP_SESSION_LIMITS = {
  premium: 1,
  unlimited: 3,
} as const
export type FreebuffDesktopSessionBucket =
  keyof typeof FREEBUFF_DESKTOP_SESSION_LIMITS

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

export function getFreebuffDesktopSessionBucket(
  model: string,
  accessTier: FreebuffAccessTier | null | undefined,
): FreebuffDesktopSessionBucket {
  return occupiesFreebuffDesktopSlot(model, accessTier)
    ? 'premium'
    : 'unlimited'
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
export const FREEBUFF_MULTIMODAL_MODEL_IDS = Object.freeze(
  SUPPORTED_FREEBUFF_MODELS.filter((model) => model.multimodal).map(
    (model) => model.id,
  ),
)

export const FREEBUFF_WEB_MULTIMODAL_MODEL_IDS = Object.freeze(
  FREEBUFF_WEB_ALL_MODELS.filter((model) => model.multimodal).map(
    (model) => model.id,
  ),
)

/** Free-mode models whose chat-completion traces we store in our own dataset
 *  (chat_completion_traces). Derived from machine-readable data-use metadata;
 *  UI wording can change without changing retention behavior. */
export const FREEBUFF_TRACED_MODEL_IDS = SUPPORTED_FREEBUFF_MODELS.filter(
  (model: FreebuffModelOption) => model.dataUse === 'training',
).map((model) => model.id)

export type FreebuffModelId = (typeof FREEBUFF_MODELS)[number]['id']
export type SupportedFreebuffModelId =
  (typeof SUPPORTED_FREEBUFF_MODELS)[number]['id']
export type FreebuffPremiumModelId = (typeof FREEBUFF_PREMIUM_MODEL_IDS)[number]
export type FreebuffWebModelId = (typeof FREEBUFF_WEB_ALL_MODELS)[number]['id']
export type FreebuffWebPremiumModelId =
  (typeof FREEBUFF_WEB_PREMIUM_MODEL_IDS)[number]

/** What new freebuff users see selected in the picker. DeepSeek V4 Flash as of
 *  2026-07-31: the V4-Flash-0731 GA build re-post-trained for agent work now
 *  beats V4 Pro on the coding/tool-use benchmarks that matter here, at a
 *  fraction of the per-token cost — so the strongest pick and the cheapest pick
 *  are the same model. It is also always-available and outside the premium
 *  pool, which means the recommended default no longer has to flip when the
 *  pool runs out. (It does still carry the AI-training notice, so pickers using
 *  this default must render the model's `warning`.)
 *  Callers that need a guaranteed-available id for resolution /
 *  auto-fallbacks should use FALLBACK_FREEBUFF_MODEL_ID instead (same model
 *  today, but the two are separate decisions). */
export const DEFAULT_FREEBUFF_MODEL_ID: FreebuffModelId =
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID

/** What new Freebuff Web/Cloud users see selected in the browser pickers, and
 *  the model a new Cloud thread starts on. Same reasoning as
 *  DEFAULT_FREEBUFF_MODEL_ID above, and it lands even harder here: a browser
 *  build burns far more tokens than a CLI turn, so steering to Flash is both
 *  the quality and the cost choice.
 *
 *  Kept as its own constant from DEFAULT_FREEBUFF_MODEL_ID (CLI/Desktop) so the
 *  browser surfaces can steer independently. The two currently resolve to the
 *  same model, but a change to one is not automatically a change to the other. */
export const DEFAULT_FREEBUFF_WEB_MODEL_ID: FreebuffWebModelId =
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID

/** Premium models the Web/Cloud picker renders small and muted: they are
 *  materially more expensive per token than the recommended default without
 *  being materially better for the browser surfaces' workloads. They stay
 *  fully selectable — this only controls emphasis and ordering (they sort last
 *  within the Premium group).
 *
 *  Since 2026-07-31 this is exactly the set of models Flash superseded: both
 *  cost more per token AND lost the quality argument, so muting them and
 *  sorting them last is what steers new picks to Flash. */
export const FREEBUFF_WEB_DEEMPHASIZED_MODEL_IDS = [
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
] as const

export function isFreebuffWebDeemphasizedModelId(
  id: string | null | undefined,
): boolean {
  if (!id) return false
  return FREEBUFF_WEB_DEEMPHASIZED_MODEL_IDS.some((modelId) =>
    freebuffModelIdMatches(id, modelId),
  )
}

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

/** Per-day cap on blank ("plan a custom stack") Cloud projects, which unlike
 *  connect-repo need no GitHub App install and each boot a full-size VM. The
 *  shared burst bucket alone would permit roughly ten in a row. Resets at
 *  midnight Pacific time. */
export const FREEBUFF_CLOUD_BLANK_PROJECT_DAILY_LIMIT = 5

/** Per-project ceiling on custom-stack planner turns.
 *
 * The planner is a free premium-model chat that never touches a sandbox, so
 * without a ceiling one blank project is an unbounded free MiniMax M3
 * conversation — the cheapest abuse route into the premium pool, since it skips
 * the VM work every other free surface pays for.
 *
 * Sized well above honest use: the prompt caps discovery at two question
 * rounds, so a real conversation is a seed turn, two answers, and a few stack
 * revisions. Hitting this means the plan is not converging.
 *
 * Only planning turns count. "Start building" is a separate mutation, so a user
 * who exhausts the cap with a finished plan can still build — they just cannot
 * keep chatting. */
export const FREEBUFF_CLOUD_PLANNER_TURN_LIMIT = 12

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
 *  DeepSeek V4 Pro (the smartest default — a premium model in the
 *  shared daily pool); limited → the always-available flash model. Pass
 *  `premiumExhausted` from the live quota snapshot so the hero flips to the
 *  unlimited DeepSeek Flash once the premium pool runs out — the recommended
 *  pick must always be joinable. */
export function getRecommendedFreebuffModelId(
  accessTier: FreebuffAccessTier | null | undefined,
  options: { premiumExhausted?: boolean } = {},
): SupportedFreebuffModelId {
  if (accessTier === 'limited') return LIMITED_FREEBUFF_MODEL_ID
  if (options.premiumExhausted) return FALLBACK_FREEBUFF_MODEL_ID
  return DEFAULT_FREEBUFF_MODEL_ID
}

/** The Web/Cloud counterpart of getRecommendedFreebuffModelId: full access →
 *  DeepSeek V4 Pro (the cost-efficient browser default); limited → the
 *  always-available flash model. `premiumExhausted` flips the hero to the
 *  unlimited flash model so the recommended pick is always joinable. */
export function getRecommendedFreebuffWebModelId(
  accessTier: FreebuffAccessTier | null | undefined,
  options: { premiumExhausted?: boolean } = {},
): FreebuffWebModelId {
  if (accessTier === 'limited') return LIMITED_FREEBUFF_MODEL_ID
  if (options.premiumExhausted) return FALLBACK_FREEBUFF_MODEL_ID
  return DEFAULT_FREEBUFF_WEB_MODEL_ID
}

export function isFreebuffModelAllowedForAccessTier(
  model: string | null | undefined,
  accessTier: FreebuffAccessTier | null | undefined,
): boolean {
  if (!model) return false
  if (accessTier !== 'limited') return isFreebuffModelId(model)
  return LIMITED_FREEBUFF_MODEL_IDS.some((modelId) => modelId === model)
}

/** Session admission is shared by CLI/Desktop/Web/Cloud. Client pickers use
 *  FREEBUFF_MODELS or FREEBUFF_WEB_MODELS, while the server accepts their union
 *  with temporarily retired models from SUPPORTED_FREEBUFF_MODELS. */
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

/** Resolve an explicit CLI selection for an access tier. The ordinary picker
 * uses `FREEBUFF_MODELS`; full-access users can also select referral-only GLM
 * through its separate banner action, or a limited-offer model the server told
 * them about this launch. Both live outside `FREEBUFF_MODELS`, so without these
 * passes an explicit pick of either would be silently rewritten to the fallback
 * model — the user would press Enter on Fable and land on DeepSeek. */
export function resolveFreebuffModelForAccessTier(
  id: string | null | undefined,
  accessTier: FreebuffAccessTier | null | undefined,
):
  | FreebuffModelId
  | typeof FREEBUFF_GLM_V52_MODEL_ID
  | FreebuffLimitedOfferModelId {
  if (accessTier === 'limited') {
    return isFreebuffModelAllowedForAccessTier(id, accessTier)
      ? (id as FreebuffModelId)
      : LIMITED_FREEBUFF_MODEL_ID
  }
  if (id === FREEBUFF_GLM_V52_MODEL_ID) return id
  const limitedOffer = FREEBUFF_LIMITED_OFFER_MODEL_IDS.find(
    (modelId) => modelId === id,
  )
  if (limitedOffer) return limitedOffer
  return resolveFreebuffModel(id)
}

export function resolveFreebuffSessionModelForAccessTier(
  id: string | null | undefined,
  accessTier: FreebuffAccessTier | null | undefined,
  options: { includeGodOnly?: boolean } = {},
): SupportedFreebuffModelId | FreebuffWebModelId {
  if (accessTier === 'limited') {
    return isFreebuffSessionModelAllowedForAccessTier(id, accessTier)
      ? (id as SupportedFreebuffModelId)
      : LIMITED_FREEBUFF_MODEL_ID
  }
  if (isSupportedFreebuffModelId(id)) return id
  return resolveFreebuffWebModel(id, {
    includeGodOnly: options.includeGodOnly ?? true,
  })
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
 *  CONCURRENCY slot (premium models + GLM 5.2). Suffix-tolerant
 *  (dated snapshots) like the other model predicates so a dated variant can't
 *  dodge the cap. Distinct from isFreebuffPremiumModelId, which gates the daily
 *  premium QUOTA and must NOT include GLM. */
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

/** Whether the requested model is GPT-5.6 Luna, tolerating the dated snapshot
 *  suffix. Used by the OpenRouter layer to apply Luna's pinned routing and
 *  reasoning effort, so a dated variant can't dodge either. */
export function isFreebuffGpt56LunaModelId(
  id: string | null | undefined,
): boolean {
  return freebuffModelIdMatches(id, FREEBUFF_GPT_5_6_LUNA_MODEL_ID)
}

/** Whether the requested model is the CrofAI GLM 5.2 route. Identity only — the
 *  route draws from the shared daily premium pool, so this must NOT be used to
 *  pick a quota bucket. Suffix-tolerant like the other predicates. */
export function isFreebuffCrofGlmV52ModelId(
  id: string | null | undefined,
): boolean {
  return FREEBUFF_CROF_GLM_V52_MODEL_IDS.some((modelId) =>
    freebuffModelIdMatches(id, modelId),
  )
}

/**
 * Whether a Web/Cloud selection may be REMEMBERED as the user's default model.
 *
 * Both GLM 5.2 routes are excluded. GLM is a scarce, hand-metered pick that a
 * user runs out of far sooner than the rest of the picker, so pinning it as the
 * remembered default strands them on a model they cannot start: the next new
 * thread, a different app, or a plain page reload would open on GLM and fail
 * admission. Picking GLM applies to the surface in front of you; anything that
 * starts fresh falls back to DEFAULT_FREEBUFF_WEB_MODEL_ID.
 *
 * Every localStorage read AND write of the remembered model must go through
 * this (via resolveRememberedFreebuffWebModel), so a value saved before this
 * rule existed self-heals on the next load instead of persisting forever.
 */
export function isFreebuffWebRememberableModelId(
  id: string | null | undefined,
): boolean {
  return !isFreebuffGlmV52ModelId(id) && !isFreebuffCrofGlmV52ModelId(id)
}

/**
 * The model a surface should START on, given a remembered (localStorage)
 * selection: the saved model when it is still valid and rememberable, else the
 * Web/Cloud default (DeepSeek V4 Pro).
 *
 * Distinct from resolveFreebuffWebModel, which resolves a LIVE selection and
 * must leave a just-picked GLM alone.
 */
export function resolveRememberedFreebuffWebModel(
  id: string | null | undefined,
  options: { includeGodOnly?: boolean } = {},
): FreebuffWebModelId {
  const resolved = resolveFreebuffWebModel(id, options)
  return isFreebuffWebRememberableModelId(resolved)
    ? resolved
    : DEFAULT_FREEBUFF_WEB_MODEL_ID
}

export function isFreebuffMultimodalModelId(
  id: string | null | undefined,
): boolean {
  if (!id) return false
  return FREEBUFF_MULTIMODAL_MODEL_IDS.some((modelId) => modelId === id)
}

/**
 * Return whether a model used by a Freebuff surface accepts image input.
 * Unknown models return undefined so the provider backend does not strip
 * images from newly added or paid models until their capability is known.
 */
export function getFreebuffModelImageSupport(
  id: string | null | undefined,
): boolean | undefined {
  if (!id) return undefined

  // Freebuff Web Chat serves this DeepSeek variant through Fireworks rather
  // than the normal Freebuff picker, so it does not have a model option entry.
  if (
    freebuffModelIdMatches(id, FREEBUFF_DEEPSEEK_V4_FLASH_FIREWORKS_MODEL_ID)
  ) {
    return false
  }

  const model =
    SUPPORTED_FREEBUFF_MODELS.find((option) =>
      freebuffModelIdMatches(id, option.id),
    ) ??
    FREEBUFF_WEB_ALL_MODELS.find((option) =>
      freebuffModelIdMatches(id, option.id),
    )
  return model?.multimodal
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

/** The "a better model exists" notice for `id`, or undefined when the model is
 *  current. Returns nothing when the replacement is not itself selectable on
 *  this surface, so a picker never offers a switch to a model it cannot show. */
export function getFreebuffModelSupersededBy(
  id: string | null | undefined,
  selectableModelIds: readonly string[],
): FreebuffModelOption['supersededBy'] | undefined {
  if (!id) return undefined
  const catalog: readonly FreebuffModelOption[] = [
    ...SUPPORTED_FREEBUFF_MODELS,
    ...FREEBUFF_WEB_ALL_MODELS,
  ]
  const supersededBy = catalog.find(
    (candidate) => candidate.id === id,
  )?.supersededBy
  if (!supersededBy) return undefined
  return selectableModelIds.includes(supersededBy.modelId)
    ? supersededBy
    : undefined
}

/**
 * The model a saved preference should be steered to, or null to keep it.
 *
 * Applied EVERY time a surface reads its remembered pick, so each new
 * thread/session/launch starts on the replacement. A superseded model stays
 * fully selectable — picking one mid-thread works and sticks for that thread —
 * but it never becomes the model a fresh surface opens on again.
 *
 * This is deliberately aggressive: a saved preference outranks a changed
 * default forever otherwise, which is exactly how users kept landing back on
 * models we no longer recommend. The cost is that a user who wants a
 * superseded model as their standing default cannot have one; the picker's
 * per-row notice is what makes that visible rather than mysterious.
 *
 * Derived from the catalog's own `supersededBy` pointers, so a model marked
 * superseded automatically gets BOTH the picker nudge and this steering —
 * they can never disagree about which models are stale.
 */
export function migrateSupersededFreebuffModelPreference(
  id: string | null | undefined,
  selectableModelIds: readonly string[],
): string | null {
  return getFreebuffModelSupersededBy(id, selectableModelIds)?.modelId ?? null
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
  const model =
    SUPPORTED_FREEBUFF_MODELS.find((candidate) => candidate.id === id) ??
    getFreebuffWebModel(id)
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
