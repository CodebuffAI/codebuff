import {
  addDaysToYmd,
  getUtcForZonedTime,
  getZonedParts,
  type ZonedDateParts,
} from '../util/zoned-time'
import {
  deepSeekExpensiveWindowEndsAt,
  isDeepSeekExpensiveWindow,
} from './freebuff-peak-hours'
import { mimoModels } from './model-config'
import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
} from './freebuff-model-ids'
import {
  FREEBUFF_AI_TRAINING_NOTICE,
  type FreebuffModelDataUse,
} from './freebuff-data-use'
import { clampReasoningEffort, type ReasoningEffort } from './reasoning-effort'

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
  availability: 'always' | 'deployment_hours' | 'off_peak_only'
  /**
   * Where a pick lands while THIS model is closed by `availability`.
   *
   * Without it an unavailable pick falls to FALLBACK_FREEBUFF_MODEL_ID, which
   * is the unlimited row — correct when a model is gone, wrong when it is
   * merely asleep and a better substitute is awake. V4 Flash closes at peak
   * precisely so its traffic lands on V4 Pro, and a silent detour to MiMo would
   * defeat the whole point of closing it.
   *
   * Advisory, not a guarantee: it is used only when the named model is itself
   * available, so this can never strand a pick on a second closed row.
   */
  unavailableFallback?: string
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
  /** Reasoning effort Freebuff turns run this model at. Not advisory: the
   *  completions layer sends it whenever the caller names no reasoning of its
   *  own (applyFreebuffReasoningDefaults in web/src/llm-api/openrouter.ts),
   *  and the Desktop and CLI pickers display the same field — one source, so
   *  on those surfaces what users see and what the server sends cannot drift.
   *  Omit where the model has no effort levels (MiniMax) or the provider
   *  default should stand untouched (GLM, MiMo). CAUTION: both DeepSeek V4
   *  models expose low/high/max and neither has a distinct medium rung — see
   *  DEEPSEEK_V4_REASONING_EFFORTS. */
  /** Reasoning effort sent for this model, on the PROVIDER's own scale.
   *  Deliberately wider than the shared agent-definition enum: Meta's ladder is
   *  minimal/low/medium/high/xhigh (its own 400 names the set). Not every
   *  provider accepts every rung, so each model still declares its own ladder. */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  /**
   * The ladder a USER may pick from for this model, ascending. Absent means the
   * model offers no choice and shows no control — the default for every row.
   *
   * Same field name and shape as Desktop's `ModelOption.efforts`
   * (freebuff-desktop/src/shared/models.ts), deliberately: Desktop already had
   * per-model effort lists driving its Claude/Codex picker, and one pattern
   * across surfaces beats two that must be kept in step.
   *
   * Values must be native provider settings, not compatibility aliases or
   * prompt approximations. The model's ordinary setting belongs in
   * `defaultEffort`; rungs may sit on either side of it.
   */
  efforts?: readonly ReasoningEffort[]
  /**
   * Where `efforts` starts before a user touches it.
   *
   * Usually equal to `reasoningEffort`, but kept separate so a future model can
   * expose a picker default that differs from its server-owned wire default.
   */
  defaultEffort?: ReasoningEffort
  /** Whether the model is still being trialed and may be unreliable. Surfaced
   *  in the picker as a "TEST" badge with a tooltip so users know it is not
   *  yet production-grade. */
  experimental?: boolean
  /** Tooltip attached to the tagline, for a tagline that names a behavior the
   *  word alone cannot explain (e.g. "Queue"). Rendered with the same
   *  dotted-underline affordance as the data-use "Data" label, so a row can
   *  carry both without growing a second line. */
  taglineTooltip?: string
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
/** Legacy wire id emitted by older freebuff.com/chat deployments. The shared
 *  completions API keeps accepting it, but routes it to DeepSeek direct. New
 *  chat code must use FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID instead. */
export const FREEBUFF_DEEPSEEK_V4_FLASH_FIREWORKS_MODEL_ID =
  'fireworks/deepseek-v4-flash'
// HY3 IS GONE, on every surface and every route (removed 2026-08-07). It left
// Freebuff on 2026-08-04 but its wire ids lived on for paid/BYOK callers via
// web/src/llm-api/hy3-fallback.ts; that file, the Atlas Cloud adapter that was
// its paid lane, and the `tencent/hy3*` model-config entries have all been
// deleted. Nothing routes these slugs now — a request for one falls through to
// the ordinary unknown-model path.
export const FREEBUFF_MIMO_V25_MODEL_ID = mimoModels.mimoV25
/** GLM 5.2, served by CrofAI's direct OpenAI-compatible API (moved off
 *  Fireworks serverless 2026-07-29, at ~4x less than Fireworks' list price).
 *  The `z-ai/` prefix is a wire id inherited from the Fireworks era — nothing
 *  reaches Z.ai; CrofAI receives its native `glm-5.2` id (see CROF_MODEL_MAP).
 *
 *  This is the ONLY GLM 5.2 route. Unlike the other picker models it is NOT
 *  freely available — it is unlocked by referring friends. Each qualified
 *  referral grants one 1-hour GLM session per day, uncapped since 2026-07-30.
 *  Gated by a per-user daily session pool whose limit equals the caller's GLM
 *  referral score (see the free-session quota).
 *
 *  A second wire id (`crof/glm-5.2`) used to reach the same CrofAI upstream on
 *  the ordinary daily PREMIUM pool. It was retired from the pickers 2026-07-30
 *  and deleted outright 2026-08-04: the picker exclusion was client-side only,
 *  so hand-written API callers kept admitting sessions on it and collecting
 *  GLM 5.2 with zero referrals (12-49 distinct accounts/day, mostly known
 *  sock-puppet clusters). Never reintroduce a second wire id for a
 *  entitlement-gated model — the quota pool is chosen by model id, so an extra
 *  id is an extra door. */
export const FREEBUFF_GLM_V52_MODEL_ID = 'z-ai/glm-5.2'
/** GPT-5.6 Luna (OpenAI), served through OpenRouter. The id is OpenRouter's own
 *  slug, so it falls through to the default OpenRouter route with no
 *  provider-specific handler (same as Ling 3.0 Flash).
 *
 *  Two things about this model are enforced server-side rather than left to the
 *  agent definitions, so they hold for every Freebuff surface, every subagent,
 *  and BYOK callers alike (see applyOpenRouterProviderRouting and
 *  applyFreebuffReasoningDefaults in web/src/llm-api/openrouter.ts):
 *
 *   - Routing PREFERS OpenAI's own endpoint ($0.10/$0.60 per M) via `order`,
 *     with fallbacks allowed and cost bounded by FREEBUFF_GPT_5_6_LUNA_MAX_PRICE
 *     rather than by the pin. A hard pin (allow_fallbacks:false) held until
 *     2026-08-16, when OpenAI began refusing every request from this account
 *     ("Policy Violation: this user has been blocked") and took Luna to a 100%
 *     failure rate with four usable endpoints sitting under the ceiling.
 *   - Reasoning effort is `high`. Luna is cheap enough per token that the
 *     quality is worth more than the reasoning tokens.
 *
 *  Both are scoped to FREEBUFF traffic on purpose: `LITE_MODEL`
 *  (agents/constants.ts) is this same model id, so keying either off the model
 *  alone would change Codebuff's paid lite mode as a side effect. */
export const FREEBUFF_GPT_5_6_LUNA_MODEL_ID = 'openai/gpt-5.6-luna'
/**
 * The Novita `-es` route. GOD-ONLY, and NOT a cheaper GPT-5.6 Luna.
 *
 * Its own id rather than a second lane under Luna's, because it is a different
 * model: measured 2026-08-21 it answers "I'm Codex, an OpenAI coding agent
 * based on GPT-5", volunteers Codex's internal tool names, and carries a fixed
 * ~4,450-token Codex system prompt we did not send. Serving that under Luna's
 * row would be the silent substitution the DeepSeek legacy/GA split exists to
 * prevent — and here the model says the quiet part out loud to any user who
 * asks what it is.
 *
 * A SECOND ID FOR THE SAME MODEL IS NORMALLY THE BUG (see GLM's note above:
 * an extra id is an extra door onto a quota pool). This is the opposite case —
 * one id per distinct model, kept apart precisely so neither can be mistaken
 * for the other. It is god-only, so it opens no pool.
 */
export const FREEBUFF_GPT_5_6_LUNA_ES_MODEL_ID = 'openai/gpt-5.6-luna-es'
/** OpenRouter provider slug Luna prefers (first in `provider.order`). */
export const FREEBUFF_GPT_5_6_LUNA_PROVIDER_ROUTE = 'openai'
/** Price ceiling for Luna, USD per million tokens. Sent as OpenRouter's
 *  `provider.max_price`, which REFUSES to route above it rather than serving
 *  and billing, so a provider re-pricing surfaces as a loud error instead of a
 *  surprise invoice. Since 2026-08-16 this — not a hard provider pin — is the
 *  sole cost guarantee, so it must not be widened casually.
 *
 *  This is a COST FENCE, not an assertion of the list price, and the gap is
 *  deliberate on both sides:
 *
 *   - It must sit ABOVE list. OpenRouter compares strictly: shipping the exact
 *     list price (0.1 / 0.6) made every Luna request 404 with "No endpoints
 *     found that satisfy the max price for this request" — verified against the
 *     live API on 2026-07-30, where 0.11/0.61 passed and 0.1/0.6 did not. A
 *     ceiling equal to list is an outage waiting on a rounding change.
 *   - It must stay under the next tier up. Azure, Azure EU and Amazon Bedrock
 *     listed $1.00/$6.00 when this was written and re-priced to $0.20/$1.20 by
 *     2026-08-16; the ceiling admits them at today's price and would exclude
 *     them again if they returned to the old one.
 *
 *  The headroom covers OpenAI's own tiers (list $0.10/$0.60, priority
 *  $0.20/$1.20, flex $0.05/$0.30) and ordinary price drift, while still failing
 *  closed well before a 10x endpoint could serve a request. */
export const FREEBUFF_GPT_5_6_LUNA_MAX_PRICE = {
  prompt: 0.5,
  completion: 3.0,
} as const
/** Reasoning effort every Luna turn runs at. */
export const FREEBUFF_GPT_5_6_LUNA_REASONING_EFFORT = 'high' as const
/**
 * Kimi K3 (Eco), served by CrofAI. God-only on Freebuff Web, for testing.
 *
 * The `crof/` prefix names the only place this exists — unlike the retired
 * `crof/glm-5.2`, which was a SECOND id for a model already offered under
 * `z-ai/glm-5.2` and became a quota-bypass route. There is no other id for
 * this, so the prefix creates no such door. (Note the paid `moonshotai/kimi-*`
 * slugs in model-config.ts are different models on a different provider, not
 * second doors onto this one.)
 *
 * `-eco` is load-bearing in the WIRE id and deliberately absent from the
 * DISPLAY name. CrofAI serves two K3 builds — `kimi-k3` at $2.00/$8.00 per M
 * and this Q2_K-quantized `kimi-k3-eco` at $1.00/$4.00 — so the id must name
 * the exact build or a future `kimi-k3` row would collide with it. The picker
 * label is plain "Kimi K3" by request; see KIMI_K3_ECO_MODEL.
 */
export const FREEBUFF_KIMI_K3_ECO_MODEL_ID = 'crof/kimi-k3-eco'
/**
 * Extended-context tiers for the DeepSeek V4 and Luna routes.
 *
 * Wire ids only. These are provisioned per-account rather than offered from a
 * client catalog, so they are deliberately absent from FREEBUFF_MODELS and
 * from every quota list — a client that rendered one would offer a row most
 * accounts cannot run. Requests carry the id directly on any free-mode root.
 *
 * Pricing and context windows track their base tier; the suffix names the
 * provisioned variant, not a different model family, so nothing here needs a
 * second entry in the price tables.
 */
export const FREEBUFF_DEEPSEEK_V4_PRO_MAX_MODEL_ID =
  'deepseek/deepseek-v4-pro-max'
export const FREEBUFF_DEEPSEEK_V4_FLASH_MAX_MODEL_ID =
  'deepseek/deepseek-v4-flash-max'
export const FREEBUFF_GPT_5_6_LUNA_MAX_MODEL_ID = 'openai/gpt-5.6-luna-max'

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

/**
 * Meta Muse Spark 1.2 (Contributor tier), served by Meta's own developer API
 * (`https://api.meta.ai/v1`, OpenAI-compatible chat completions). The `meta/`
 * prefix names the only place it exists — there is no second wire id, so it
 * cannot become a quota-bypass route the way `crof/glm-5.2` did.
 *
 * FREEBUFF WEB ONLY. It is absent from FREEBUFF_MODELS and
 * SUPPORTED_FREEBUFF_MODELS, so no CLI/Desktop build can select it and
 * `isFreebuffSessionModelId` refuses it on those surfaces. Web reaches it
 * through FREEBUFF_WEB_MODELS.
 *
 * The reason for the narrow surface is the rate limit, not the price: the
 * Contributor tier is capped at 60 RPM per TEAM — i.e. across every Freebuff
 * user at once — against Standard's 3,000. That is roughly one request per
 * second for the whole product, so this model needs the Convex-side queue
 * (see docs/freebuff-muse-spark.md) that the browser can render a wait for.
 * The CLI has no such queue and would just surface 429s.
 *
 * Contributor pricing ($0.10/$0.002/$0.20 per M against Standard's
 * $1.25/$0.15/$4.25) is bought with training rights over prompts and
 * completions, which is why this is `dataUse: 'training'` and carries the
 * AI-training warning.
 */
export const FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID =
  'meta/muse-spark-1.2-contributor'
/** Meta's own model id for the wire id above — what api.meta.ai receives. */
export const MUSE_SPARK_12_CONTRIBUTOR_UPSTREAM_MODEL_ID =
  'muse-spark-1.2-contributor'
/** Published Contributor-tier limit: 60 requests/min PER TEAM, shared by every
 *  Freebuff user. Sizes the queue's drain rate, so keep it in sync with
 *  https://dev.meta.ai/docs/pricing-rate-limits. */
export const MUSE_SPARK_CONTRIBUTOR_RPM = 60
/**
 * Reasoning effort sent with every Muse Spark request.
 *
 * Muse Spark ALWAYS reasons — `reasoning_effort: "none"` is a hard 400 — so
 * this chooses how much, not whether. The full ladder is
 * minimal/low/medium/high/xhigh; Meta's own 400 on an unknown value names the
 * set, which is the only place it is documented.
 *
 * Measured live 2026-08-06, same word problem, n=6 per level:
 *
 *   minimal   153 reasoning tokens   1.0s
 *   low      ~300                    —
 *   high      362                    1.9s
 *   xhigh     391                    2.4s
 *
 * The top of the ladder is nearly flat: xhigh buys ~8% more reasoning than
 * high, inside the run-to-run spread, and spends ~26% more latency for it.
 * The real lever is downward — minimal is a 2.4x cut and still answered
 * correctly on every sample. So read this constant as "max depth, latency
 * accepted", and reach for `minimal` or `low` if a turn ever needs to feel
 * fast. Cost barely enters into it: 500k output tokens across 347 prod
 * requests came to roughly $0.10.
 */
export const FREEBUFF_MUSE_SPARK_REASONING_EFFORT = 'xhigh' as const

/**
 * Ox Alpha — an anonymous ("stealth") frontier coding model, served through
 * OpenRouter at a list price of zero while its host evaluates it.
 *
 * FREEBUFF WEB AND CLOUD ONLY. It is absent from FREEBUFF_MODELS and
 * SUPPORTED_FREEBUFF_MODELS, so no CLI or Desktop build can select it and
 * `isFreebuffSessionModelId` refuses it there; the browser surfaces reach it
 * through FREEBUFF_WEB_MODELS. Unlike Muse Spark's narrow surface, that is a
 * "prove it first" decision rather than a property of the model — see
 * docs/freebuff-ox-alpha.md for what was measured and what would justify
 * widening it.
 *
 * The id is OpenRouter's own slug, so it falls through to the default
 * OpenRouter route with no provider-specific handler (same as Luna). Three
 * things about it are not like the other rows served that way:
 *
 *  - IT IS FREE, AND THAT IS FENCED RATHER THAN TRUSTED — see
 *    FREEBUFF_OX_ALPHA_MAX_PRICE. A stealth model's price is whatever an
 *    anonymous host decides tomorrow, and this row sits in no session pool at
 *    all, so an unnoticed repricing would be unmetered spend.
 *  - REASONING IS MANDATORY (the endpoint reports `reasoning.mandatory`), and
 *    the provider's own default effort is `max`. Measured on one debugging
 *    prompt, n=4 per rung, 2026-08-20: `low` answered correctly in 409
 *    completion tokens and 8.4s, `high` in 725 and 11.3s, `max` in 3,505 and
 *    48.5s — with one of the four `max` samples truncated by a 4k token limit
 *    mid-answer. So the row names its effort explicitly; leaving it unset opts
 *    every turn into the slowest and most truncation-prone rung there is.
 *  - Prompts and completions are RETAINED BY THE HOST and, per OpenRouter's
 *    stealth-model terms, not used for training. That is neither case
 *    `dataUse` was written for; see the row for how it is labelled.
 */
export const FREEBUFF_OX_ALPHA_MODEL_ID = 'stealth/ox-alpha'
/**
 * Price ceiling for Ox Alpha, USD per million tokens — ZERO, sent as
 * OpenRouter's `provider.max_price`.
 *
 * Same mechanism as FREEBUFF_GPT_5_6_LUNA_MAX_PRICE and deliberately the
 * opposite ceiling. Luna's sits ABOVE list to leave routing headroom; this one
 * sits exactly AT a list price of zero, so the first endpoint that charges
 * anything stops being routable at all.
 *
 * Both halves verified against the live API on 2026-08-20, because a fence
 * nobody has watched fail is not a fence: a zero ceiling serves Ox Alpha
 * normally, and the SAME ceiling on a priced model answers 404 "No endpoints
 * found that satisfy the max price for this request". It fails closed, loudly,
 * before the first billed token rather than after the invoice — which is the
 * shape of bill this repo has already paid twice (the retired OpenRouter
 * DeepSeek lane; the Kimi/Infron unit-price doubling).
 *
 * This guard is why the model can sit outside every session pool. Do not widen
 * it to "just a little headroom" without giving the row a pool in the same
 * change: the two are one decision.
 */
export const FREEBUFF_OX_ALPHA_MAX_PRICE = {
  prompt: 0,
  completion: 0,
} as const

/**
 * The user-pickable ladders, named like Desktop's THROUGH_XHIGH / NO_XHIGH so
 * the two catalogs read the same way.
 *
 * These are reusable provider-native ladders. A model's default is independent
 * and may sit below the last rung.
 */
export const EFFORTS_THROUGH_HIGH = ['low', 'medium', 'high'] as const
export const EFFORTS_THROUGH_XHIGH = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
] as const
export const EFFORTS_THROUGH_MAX = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const
/**
 * The three native DeepSeek V4 templates, shared by Flash 07/31 and Pro 08/13.
 *
 * DeepSeek publishes one requested→actual effort table for both models, and
 * since the Pro 08/13 GA build it is genuinely identical (read off
 * api-docs.deepseek.com/guides/thinking_mode, 2026-08-12): low→low, medium→high,
 * high→high, xhigh→high, max→max. Pro used to collapse low into high, which is
 * why it shipped a shorter ladder; that is no longer true, so the two rows now
 * share this one. Medium is still not a distinct level on either model and is
 * intentionally absent.
 *
 * The table is the ONLY source for this. DeepSeek's API accepts any
 * `reasoning_effort` string without complaint — `"gigantic"` returns a normal
 * 200 (verified against the live API, 2026-08-12) — so a rung being accepted
 * proves nothing about it being distinct, and a ladder can never be derived by
 * probing.
 */
const DEEPSEEK_V4_REASONING_EFFORTS = ['low', 'high', 'max'] as const
/** Ox Alpha's native ladder, read off the endpoint's `supported_efforts`.
 *  The same three rungs as DeepSeek V4 and, like it, no distinct medium — so
 *  it is a separate constant rather than a shared one only because the two
 *  providers are free to diverge. */
const OX_ALPHA_REASONING_EFFORTS = ['low', 'high', 'max'] as const
/**
 * The marker that turns a Muse Spark rate limit into a queued turn rather than
 * a failed one.
 *
 * It travels twice in the same 429 — as `error.code`, and inside
 * `error.message` — because only the message survives the whole path from
 * `web/src/llm-api/meta.ts` through the AI SDK to the runner's error handling.
 * The runner matches on it (see docs/freebuff-muse-spark.md); if it ever stops
 * matching, rate limits degrade to plain errors with no queue and no notice,
 * which is exactly the failure this constant exists to make greppable.
 */
export const MUSE_SPARK_RATE_LIMITED_ERROR_CODE = 'muse_spark_rate_limited'

/**
 * Where a rate-limited Muse Spark request goes instead of waiting.
 *
 * DeepSeek V4 Flash since 2026-08-18, when V4 Pro was paused for free mode (it
 * held this from 2026-08-12, and GPT-5.6 Luna before that). The choice is
 * constrained rather than free on two counts, and Flash satisfies both for the
 * same reasons Pro did:
 *
 *  - The fallback must be a model the caller is ALREADY entitled to, or a rate
 *    limit would become a way to reach something they are not. Flash shared the
 *    daily premium pool with Muse Spark until 2026-08-24; it is UNMETERED now,
 *    which satisfies this more strongly rather than weakening it — every
 *    full-access caller can run an unmetered row, so the reroute cannot hand out
 *    anything unearned. The direction that would is a referral-EARNED row, and
 *    the invariant test guards that explicitly.
 *  - It should be the model we would recommend anyway, since the user never
 *    chose it. Flash held DEFAULT_FREEBUFF_WEB_MODEL_ID when this was written;
 *    that is Pro now, so the two no longer coincide. Flash stays the right
 *    reroute on the stronger ground that it costs the user nothing.
 *
 * Both bullets are why this had to move with the pause rather than after it: a
 * fallback pointing at a paused model turns a queue overflow into a refusal.
 *
 * Being text-only costs this nothing: images reaching a Freebuff model that
 * cannot see pixels are converted to vision-model descriptions at the
 * completions layer (getFreebuffModelImageSupport gates it), so a rerouted turn
 * carrying an image still reads it.
 */
export const MUSE_SPARK_FALLBACK_MODEL_ID = FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID

/**
 * How long a caller may be asked to wait before the request is rerouted.
 *
 * Deliberately the same 10s as the provider's silent retry window, and that
 * identity is the whole design: a wait we can hide costs nothing and keeps the
 * user on the model they picked, while a wait we would have to *explain* is
 * worse than quietly serving the answer on a peer model. Meta answers a real
 * rate limit with `Retry-After: 60`, so in practice this splits cleanly —
 * blips are absorbed, genuine saturation reroutes.
 */
export const MUSE_SPARK_FALLBACK_AFTER_MS = 10_000

/** Picker copy for the tagline tooltip, and the single source for it — the
 *  server's behavior and the row's promise must not drift. Names the model
 *  MUSE_SPARK_FALLBACK_MODEL_ID actually points at; a catalog invariant test
 *  checks the two agree. */
export const MUSE_SPARK_FALLBACK_NOTICE =
  'Falls back to DeepSeek V4 Flash if the queue is too long.'

/** UI-only rollout switch. Backend support and free-mode allowlists remain
 *  wired even when these models are hidden from the Freebuff picker. */
export const FREEBUFF_ENABLE_MIMO_MODELS_IN_UI = true
/** UI-only rollout switch for the streak indicator in the waiting room. */
export const FREEBUFF_ENABLE_STREAK_IN_UI = true
/** Local/debug switch: force the localhost free-mode country bypass into
 *  limited access so the limited Freebuff UX can be exercised without an env
 *  var. */
export const FREEBUFF_FORCE_LIMITED_MODE = false
/**
 * Base premium sessions per Pacific day, before anything is earned.
 *
 * 5 → 4 when Levels shipped (`freebuff-levels.ts`), and the small size of that
 * cut is the design. A free tier whose floor already hands out everything has
 * nothing left to reward with — but a floor that COLLAPSES is a regression
 * every existing user feels on the same afternoon, and no amount of "you can
 * earn it back" reads as anything other than a takeaway. One session is what
 * an honest account loses; Levels then take it to 7, which is more than
 * anybody had before.
 *
 * Referral, streak, bounty and operator entitlement still add on top of this,
 * unchanged.
 */
export const FREEBUFF_PREMIUM_SESSION_LIMIT = 4
/**
 * Limited-region base sessions per Pacific day.
 *
 * 6 → 3, the one genuinely large cut, and it is aimed rather than broad:
 * `docs/freebuff-trust-levels.md` records that the brand-new-account /
 * unsupported-region / often-VPN intersection is the exact shape of the
 * reselling farms, and this is the pool they drain. A real developer abroad
 * climbs straight back past where they started — Levels take this to 7 — while
 * an account minted to be drained never earns a single rung.
 */
export const FREEBUFF_LIMITED_SESSION_LIMIT = 3

/**
 * What those two pools paid BEFORE Levels, and the revert lever.
 *
 * `FREEBUFF_LEVEL_SESSIONS=off` selects these instead of the reduced bases
 * above, and suppresses the level bonus with them. The two halves have to move
 * together: a reduced base with the ladder switched off is a pure takeaway,
 * which is the one configuration this feature must never be able to land in.
 * That is why the switch gates the whole change rather than just the bonus.
 *
 * Delete both, and the branch in `free-session/public-api.ts` that reads them,
 * once Levels has been on long enough that rolling back is not a thing anyone
 * would do.
 */
export const FREEBUFF_PRE_LEVELS_PREMIUM_SESSION_LIMIT = 5
export const FREEBUFF_PRE_LEVELS_LIMITED_SESSION_LIMIT = 6
/**
 * There is no standard-model session limit, on any surface.
 *
 * `FREEBUFF_WEB_STANDARD_SESSION_LIMIT` used to live here at 6, capping fresh
 * standard sessions on browser surfaces only — unlimited in CLI and Desktop,
 * six a day in Web and Cloud. Removed on 2026-08-18, because a product whose
 * central promise is "Freebuff is free" cannot have that promise be true on
 * one surface and not another, with no way for a user to discover the
 * difference except by hitting it.
 *
 * It was also close to redundant. `docs/freebuff-trust-levels.md` argues at
 * length that session COUNT is the wrong thing to meter — starting a session
 * costs nothing and an idle session costs nothing, while the traffic inside it
 * is bounded four separate ways (`messagesPerDay`, `messagesPer5Hours`,
 * `userMessagesPerDay`, and the daily spend ceiling). The churn it was aimed
 * at is project creation, which has its own gate
 * (`docs/freebuff-web-creation-gate.md`).
 *
 * Levels therefore scale only the two pools that are genuinely scarce: premium
 * and the limited region. See `freebuff-levels.ts`.
 */
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

/** How much history the account hub's activity map covers. A year, matching
 *  what the grid can legibly draw at 53 columns. Free: the map is drawn from
 *  one narrow row per active day. */
export const FREEBUFF_USAGE_MAP_DAYS = 365

/** Lookback for the hub's token and message totals, which are aggregated from
 *  `message` on demand. Days rather than months on purpose: that table's cost
 *  scales with how much the account sent, not with the calendar. */
export const FREEBUFF_RECENT_TOKENS_DAYS = 7

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
 *  subagent for deeper reasoning. Used by the CLI to toggle the gemini-thinker
 *  spawnable + prompts based on the user's pick, and by the server to admit
 *  gemini-thinker child requests against a parent session bound to one of
 *  these models.
 *
 *  This used to be "every full-access picker model except the limited-tier
 *  ones", and that rule no longer describes the list. DeepSeek V4 Flash left
 *  the limited tier on 2026-08-18 and is now premium, yet it is deliberately
 *  still OUT: a thinker child is an extra Gemini Pro call on top of the parent
 *  turn, and Flash now carries the bulk of free-mode traffic. Adding it would
 *  multiply exactly the cost the same day's changes were made to contain.
 *  Membership is a cost decision now, not a tier one.
 *
 *  V4 Pro stays listed while paused. The check only ever runs against a row's
 *  bound model, and no row can be bound to a paused model, so the entry is
 *  inert — and it means the thinker comes back with Pro in one edit instead of
 *  being forgotten. */
export const FREEBUFF_GEMINI_THINKER_PARENT_MODELS = new Set<string>([
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
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
 *   deepseek-v4-pro       "This model's maximum context length is 1048576
 *                          tokens. However, you requested 1300092 tokens"
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
  [FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID]: 1_048_576,
  // Read off the rejection above on 2026-08-12 — the same window as Flash, and
  // the entry Pro had been missing since it shipped. Absent, base-chat gave a
  // million-token model FREEBUFF_DEFAULT_CONTEXT_WINDOW's 131_072 and summarized
  // a Pro chat thread at ~52k estimated tokens, 8x early. Unlike Luna and Muse
  // Spark below this is an observed limit rather than a published one, so it is
  // entered exactly.
  [FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID]: 1_048_576,
  // Luna is the one entry not read off a provider rejection. Every Luna
  // endpoint OpenRouter lists (OpenAI, its flex/priority tiers, Azure, Bedrock)
  // declares context_length 1_050_000, verified against the live endpoints API
  // on 2026-08-01; 1_000_000 is deliberately entered instead, which stays on
  // the safe side of the asymmetry above AND makes base-chat's 0.4 budget come
  // out at exactly 400k.
  //
  // Absent, Luna fell to FREEBUFF_DEFAULT_CONTEXT_WINDOW and base-chat budgeted
  // it 131_072 * 0.4 = 52_428 — a 20x under-estimate of a million-token model,
  // which summarizes a chat thread that had plenty of room left. Every
  // summarize rewrites history from the front and throws away the prompt cache
  // with it.
  [FREEBUFF_GPT_5_6_LUNA_MODEL_ID]: 1_000_000,
  // Novita publishes 372k for the `-es` route (their /v1/models, 2026-08-21),
  // far below Luna's own 1M — it is a Codex session, not the Luna API model.
  // Sized from what the provider states rather than inherited from the name.
  [FREEBUFF_GPT_5_6_LUNA_ES_MODEL_ID]: 372_000,
  // Meta publishes 1,048,576 for every Muse Spark variant. Entered as 1_000_000
  // for the same reason Luna is: it stays on the safe side of the asymmetry
  // above while remaining an honest order of magnitude, where falling through
  // to the 131_072 default would summarize a million-token thread 8x early.
  [FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID]: 1_000_000,
  // OpenRouter publishes 1,048,576 for the single Ox Alpha endpoint. Entered as
  // 1_000_000 for the same reason as the two above: a published number is not
  // an observed rejection, and the asymmetry here punishes guessing high.
  [FREEBUFF_OX_ALPHA_MODEL_ID]: 1_000_000,
}

/** Window assumed for any model missing from FREEBUFF_MODEL_CONTEXT_WINDOWS.
 *  Smaller than every window we have measured. */
export const FREEBUFF_DEFAULT_CONTEXT_WINDOW = 131_072

/* Two supersedes notices lived here — FLASH_SUPERSEDES_NOTICE ("V4 Flash 07/31
 * performs better for most tasks") and FLASH_RECOMMENDED_NOTICE ("V4 Flash
 * 07/31 is the recommended pick") — and both were deleted on 2026-08-21 with
 * their last referrers. The catalog now carries NO supersedes notice at all and
 * no row is badged RECOMMENDED; ordering is the only steer left.
 *
 * Worth reading in git before writing anything like them again, for two reasons
 * that outlive the particular models:
 *
 *  - BOTH EXPIRED WITHOUT ANYONE NOTICING. Each asserted Flash was the better
 *    default. Flash became premium on 2026-08-18 and started closing for the
 *    ten-hour peak window on 2026-08-21, so by the end the picker was steering
 *    users toward a model that is asleep for part of every day.
 *  - A NOTICE IS NOT JUST COPY. migrateSupersededFreebuffModelPreference
 *    rewrites a SAVED pick on every load, so a stale notice does not merely
 *    give bad advice — it silently moves users off the model they chose, on
 *    every launch, with no action from them.
 */

/**
 * DeepSeek V4 Pro, on the 08/13 GA build (2026-08-12).
 *
 * SAME ENDPOINT AND SAME WIRE ID as the preview build it replaces, and that is
 * not an assumption: DeepSeek direct serves only the undated ids, so the GA
 * build arrived on `deepseek-v4-pro` with no route to add. Every dated slug is
 * refused outright — `deepseek-v4-pro-0813` returns "The supported API model
 * names are deepseek-v4-pro or deepseek-v4-flash" (verified against the live
 * API, 2026-08-12), and /v1/models lists exactly the two undated ids. So there
 * is nothing to plumb for a new build; what changes is what this row SAYS.
 *
 * Pricing was unchanged by the GA release, but DeepSeek repriced the whole
 * family at 16:00 UTC on 2026-08-16 and split it into peak and off-peak cards:
 * $0.66 in / $0.022 cache read / $1.98 out per M off-peak, exactly double that
 * at peak (01:00-04:00 and 06:00-10:00 UTC). DEEPSEEK_V4_PRO_PRICING in
 * web/src/llm-api/deepseek.ts carries both.
 */
const DEEPSEEK_V4_PRO_MODEL = {
  id: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  // Dated for the same reason Flash is: the wire id is undated and auto-updates,
  // so an undated label tells a returning user nothing changed when in fact the
  // GA build is a different model from the preview they formed an opinion about.
  // UNDATED as of 2026-08-19, and that is a correction rather than a style
  // change. The rule here is that a name must identify the build a user
  // actually gets, and Pro stopped having one: the CrofAI lane serves the
  // undated `deepseek-v4-pro` snapshot while the direct lane serves 08/13, and
  // which one answers depends on the hour (see the peak-window gating in
  // deepseek-router.ts). "08/13" was true of only one of those, so it promised
  // a build we may not hand over.
  displayName: 'DeepSeek V4 Pro',
  // No longer a superlative. Pro is not the recommendation — it is the
  // expensive row that a user may still choose — so the tagline describes it
  // instead of ranking it. "Smartest" read as a recommendation the rest of the
  // catalog no longer makes.
  tagline: 'Deep reasoning',
  // ALWAYS as of 2026-08-22, and this tracks the LANE rather than a change of
  // policy — the third time this row has moved, always for the same reason.
  // Pro is closed at peak only while it is served by a provider that doubles
  // there. It is back on Cheaper Inference, whose card is FLAT, so there is no
  // expensive window to hide from and a ten-hour closure would cost users the
  // model for nothing.
  //
  // THE PAIRING STILL HOLDS: V4 Flash is `always` too, so neither is shut. The
  // rule that matters is that these two are never closed at once, not that one
  // of them always is — if Pro ever returns to DeepSeek direct, close it again
  // and check Flash in the same commit.
  availability: 'always',
  warning: FREEBUFF_AI_TRAINING_NOTICE,
  dataUse: 'training',
  premium: true,
  multimodal: false,
  // DeepSeek's own documented default (thinking on, effort high,
  // api-docs.deepseek.com/guides/thinking_mode), sent explicitly so a
  // provider-side default change cannot silently move Freebuff.
  reasoningEffort: 'high',
  // Low maps to a real low template on these builds, so Pro offers the same
  // three rungs as Flash. See DEEPSEEK_V4_REASONING_EFFORTS.
  efforts: DEEPSEEK_V4_REASONING_EFFORTS,
  defaultEffort: 'high',
  // NO `supersededBy` as of 2026-08-21, and its removal is the point rather
  // than housekeeping. This row carried "V4 Flash is what we recommend",
  // steering users off Pro on COST — it read cache at $0.022/M off-peak and
  // $0.044/M at peak, several times Flash, out of the same shared pool.
  //
  // Both halves of that argument inverted on the same day. Pro reads cache at
  // $0.002538/M FLAT on its new lane, and Flash is now the row that closes at
  // peak. Pointing Pro at Flash would send users to a model that is asleep for
  // ten hours precisely when this one is their best option — and because
  // `migrateSupersededFreebuffModelPreference` rewrites a SAVED pick on every
  // load, it would do that silently and repeatedly. That exact failure is
  // documented on MIMO_V25_MODEL; this is the same trap pointing the other way.
  // No `isNew`. The badge exists to pull attention to a row, which is the
  // opposite of what this one should do now.
} as const satisfies FreebuffModelOption

const MIMO_V25_MODEL = {
  id: FREEBUFF_MIMO_V25_MODEL_ID,
  displayName: 'MiMo 2.5',
  tagline: 'Balanced',
  availability: 'always',
  dataUse: 'service',
  premium: false,
  multimodal: true,
  // Xiaomi exposes only disabled and high (enabled) for MiMo 2.5. Since the
  // product has no separate thinking on/off control, there is no depth ladder
  // to render here; low/medium/max would merely be compatibility aliases.
  // NOT superseded as of 2026-08-18, and the reason is the whole point of the
  // pause. The pointer to Flash rested on "same price, strictly better model,
  // so there is no cost argument to weigh". Flash costing a premium session
  // ended that: MiMo is now the only UNLIMITED row and the target of
  // FALLBACK_FREEBUFF_MODEL_ID, so this row is precisely where a user lands
  // when their premium pool is spent.
  //
  // Two things went wrong while the pointer was still here, and both are worse
  // than a stale nudge:
  //  - `migrateSupersededFreebuffModelPreference` rewrites a SAVED pick on
  //    every load, so a user who deliberately chose the unlimited model was
  //    silently moved onto the premium one at each launch.
  //  - The picker nagged "switch to V4 Flash" on the very row it had just
  //    stepped a spent user down to — advice they cannot take until tomorrow.
  //
  // Restore it together with Flash leaving FREEBUFF_PREMIUM_MODEL_IDS, not
  // before: the argument returns only when Flash is free again.
} as const satisfies FreebuffModelOption

const DEEPSEEK_V4_FLASH_MODEL = {
  id: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  // Dated on purpose: the wire id is undated and auto-updates, so without the
  // date a returning user sees the same name and assumes the same model. The
  // 0731 GA build is a different, re-post-trained model.
  displayName: 'DeepSeek V4 Flash 07/31',
  // "Smart & Fast" survived Flash becoming premium on 2026-08-18: it describes
  // the model, and the one word in it that described the TIER ("unlimited") had
  // already gone when Pro took the recommendation on 2026-08-12. The picker
  // renders the premium group heading, so the tagline does not have to.
  tagline: 'Smart & Fast',
  // CLOSED AT PEAK again as of 2026-08-24. The 08-22 reopening was correct for
  // its moment and its premise has since expired: it reasoned that Pro was
  // "back on DeepSeek direct and closed at peak, so Flash has to be the row
  // that stays up". Pro is neither of those now — it runs on Cheaper Inference
  // at a flat $0.002538/M cache read and is open at all hours — so a row that
  // can hold the peak window exists again, and Flash is once more the row whose
  // whole cost doubles inside it.
  //
  // Flash is ~46% of fleet spend and DeepSeek doubles it for ten hours a day.
  // Measured 2026-08-24 09:00Z, inside the window:
  //
  //   Flash @ DeepSeek peak    $0.005621/msg
  //   Pro   @ Cheaper Inf.     $0.005731/msg   (1.02x — saves nothing)
  //   Luna  @ Cheaper Inf.     $0.002659/msg   (2.11x CHEAPER)
  //
  // Hence the fallback points at LUNA, not Pro. The old pointer named Pro from
  // when Pro was the flat-priced row; it is now merely the same price as the
  // row being closed, so redirecting there would shut a model for no saving —
  // the worst of both outcomes.
  availability: 'off_peak_only',
  unavailableFallback: FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  warning: FREEBUFF_AI_TRAINING_NOTICE,
  dataUse: 'training',
  // UNLIMITED again as of 2026-08-24, reversing the 2026-08-18 metering. Flash
  // went into the daily pool because it was the single largest driver of
  // free-mode spend; what changed is that it now has a cheap lane to spend on.
  // The Luminal lane carries Flash at a fraction of DeepSeek direct, and it is
  // running far under its concurrency ceiling — 43 pins against 80 measured
  // 2026-08-24 21:35Z, with ~90% of Flash sessions refused a slot. Metering
  // Flash by the premium pool throttles the demand that would fill that lane.
  //
  // FULL ACCESS ONLY. The limited tier is a separate catalog
  // (LIMITED_FREEBUFF_MODEL_IDS) and is deliberately untouched: those users
  // still get MiMo 2.5 alone, and Flash's pause there is what keeps those
  // sessions free.
  //
  // What did NOT move with it, on purpose:
  //  - FALLBACK_FREEBUFF_MODEL_ID stays MiMo. The fallback has to be available
  //    at every hour and Flash is `off_peak_only`; non-premium is necessary for
  //    that slot, not sufficient.
  //  - DEFAULT_FREEBUFF_MODEL_ID stays Luna. Which model leads the picker is a
  //    product decision, not a consequence of the quota bucket.
  //  - MIMO_V25_MODEL's supersededBy pointer stays off. Its comment asks for it
  //    back "when Flash is free again", but that was written before Flash
  //    closed for the peak window; restoring it would rewrite saved MiMo picks
  //    onto a model that is shut ten hours a day.
  //
  // Reverting is this flag plus the FREEBUFF_PREMIUM_MODEL_IDS entry, which
  // move together, and the FREEBUFF_TIER_CHANGE_NOTICE copy.
  premium: false,
  multimodal: false,
  reasoningEffort: 'high',
  // The 07/31 build has native low/high/max prompt templates. Medium is not a
  // distinct level and is intentionally absent.
  efforts: DEEPSEEK_V4_REASONING_EFFORTS,
  defaultEffort: 'high',
  isNew: true,
} as const satisfies FreebuffModelOption

/**
 * The provisioned extended-context tiers.
 *
 * Full rows so the provisioning tooling, the usage ledger and support have a
 * display name and a data-use classification to read, exactly like every other
 * model. They are deliberately NOT in FREEBUFF_MODELS, FREEBUFF_WEB_MODELS or
 * any quota list: the tier is granted per account rather than picked, so a
 * client that rendered one would offer a row most accounts cannot run, and a
 * quota list would meter a tier whose ceiling is the grant itself.
 *
 * Reasoning defaults, pricing and context tracking their base tier is the
 * point of the suffix — it names the provisioned variant, not a new family.
 */
const DEEPSEEK_V4_PRO_MAX_MODEL = {
  id: FREEBUFF_DEEPSEEK_V4_PRO_MAX_MODEL_ID,
  displayName: 'DeepSeek V4 Pro (Max context)',
  tagline: 'Extended context',
  availability: 'always',
  warning: FREEBUFF_AI_TRAINING_NOTICE,
  dataUse: 'training',
  premium: false,
  multimodal: false,
  reasoningEffort: 'high',
  defaultEffort: 'high',
} as const satisfies FreebuffModelOption

const DEEPSEEK_V4_FLASH_MAX_MODEL = {
  id: FREEBUFF_DEEPSEEK_V4_FLASH_MAX_MODEL_ID,
  displayName: 'DeepSeek V4 Flash (Max context)',
  tagline: 'Extended context',
  availability: 'always',
  warning: FREEBUFF_AI_TRAINING_NOTICE,
  dataUse: 'training',
  premium: false,
  multimodal: false,
  reasoningEffort: 'high',
  defaultEffort: 'high',
} as const satisfies FreebuffModelOption

const GPT_5_6_LUNA_MAX_MODEL = {
  id: FREEBUFF_GPT_5_6_LUNA_MAX_MODEL_ID,
  displayName: 'GPT-5.6 Luna (Max context)',
  tagline: 'Extended context',
  availability: 'always',
  dataUse: 'service',
  premium: true,
  multimodal: false,
  reasoningEffort: FREEBUFF_GPT_5_6_LUNA_REASONING_EFFORT,
} as const satisfies FreebuffModelOption

/**
 * The provisioned tiers, as rows. Exported for the provisioning tooling and
 * for support lookups; NOT spread into any catalog, for the reason above.
 */
export const FREEBUFF_PROVISIONED_MODELS = [
  DEEPSEEK_V4_PRO_MAX_MODEL,
  DEEPSEEK_V4_FLASH_MAX_MODEL,
  GPT_5_6_LUNA_MAX_MODEL,
] as const satisfies readonly FreebuffModelOption[]

const MINIMAX_M3_MODEL = {
  id: FREEBUFF_MINIMAX_M3_MODEL_ID,
  displayName: 'MiniMax M3',
  tagline: 'Fastest',
  availability: 'always',
  dataUse: 'service',
  // M3 is served by Fireworks without provider-side training. Its `service`
  // data-use classification keeps it out of FREEBUFF_TRACED_MODEL_IDS.
  // WITHDRAWN 2026-08-20 (FREEBUFF_PAUSED_FREE_MODEL_IDS). The row is kept
  // here, not deleted: a paused model has to stay in SUPPORTED so the server
  // still recognises the id and can coerce it. `premium` is now moot — nothing
  // reaches a pool through a model that never survives admission — but it stays
  // true so that restoring the row is one edit to the paused list rather than
  // two that must agree.
  premium: true,
  multimodal: true,
  // MiniMax M3 supports adaptive thinking or disabled thinking, but no effort
  // levels. A depth picker would therefore be cosmetic.
  // NO `supersededBy`. This was the last supersedes notice in the catalog and
  // it went on 2026-08-21 with the rest: the picker no longer nudges anyone
  // anywhere. Its claim had also expired twice over — it pointed at Flash as
  // "free rather than premium-pooled" (Flash became premium on 2026-08-18) and
  // as the better default (Flash now closes for ten hours a day). A nudge that
  // survives the argument it was making is worse than none, because
  // migrateSupersededFreebuffModelPreference acts on it silently.
} as const satisfies FreebuffModelOption

const GPT_5_6_LUNA_MODEL = {
  id: FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  displayName: 'GPT-5.6 Luna',
  // Luna is the general-purpose premium option; its row's own badges (Images,
  // no training notice) distinguish it from the other all-around models.
  tagline: 'Strong all-around',
  availability: 'always',
  // OpenAI's API does not train on request data, and the route carries
  // data_collection: 'deny', so no AI-training notice and no trace storage
  // (FREEBUFF_TRACED_MODEL_IDS keys off this).
  dataUse: 'service',
  premium: true,
  // OpenRouter reports input modalities text + image + file for this model.
  multimodal: true,
  reasoningEffort: FREEBUFF_GPT_5_6_LUNA_REASONING_EFFORT,
  // OpenRouter's model metadata advertises all five enabled effort levels.
  efforts: EFFORTS_THROUGH_MAX,
  defaultEffort: FREEBUFF_GPT_5_6_LUNA_REASONING_EFFORT,
  // Luna led the browser surfaces from 2026-08-04 until Pro's 08/13 GA build
  // took the recommendation on 2026-08-12. It stays fully selectable, and stays
  // the one premium row with no AI-training notice and native image input —
  // reasons a user may still deliberately want it — but the picker now says
  // plainly that Pro is the better default.
  //
  // NOT in FREEBUFF_WEB_DEEMPHASIZED_MODEL_IDS — which is now empty, but Luna
  // would not qualify anyway: muting is this product's "materially dearer"
  // signal, and against Pro that does not resolve — Pro is 2.76x cheaper on the cache reads that
  // dominate agent traffic, and dearer on fresh input and output (full table on
  // that constant). Steering on quality is honest; implying a settled price
  // difference in either direction would not be.
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
  // Our CrofAI route accepts but ignores reasoning_effort (including invalid
  // values), so OpenRouter's GLM ladder does not describe the route users run.
} as const satisfies FreebuffModelOption

/**
 * Kimi K3 (Eco), CrofAI. God-only, for testing, and the cost is part of why.
 *
 * List price per M (CrofAI catalog, read from the live /v1/models endpoint on
 * 2026-08-07): $1.00 in, $0.10 cache read, $4.00 out. Against DeepSeek V4
 * Flash's $0.12/$0.21 on the same provider that is ~8x input and ~19x output,
 * which is the argument for keeping it off the public picker rather than
 * merely marking it premium.
 *
 * `displayName` is 'Kimi K3', NOT 'Kimi K3 Eco', by explicit request. This
 * breaks the convention DEEPSEEK_V4_FLASH_MODEL sets — name the exact build so
 * a returning user cannot mistake one for another — and the divergence is
 * deliberate rather than an oversight, so do not "fix" it: CrofAI also serves a
 * full `kimi-k3` at twice the price, and this row is the Q2_K-quantized Eco
 * build (1M context, 131,072 max completion tokens). The wire id keeps `-eco`
 * so the two builds stay distinguishable everywhere it actually matters —
 * routing, billing, and the CROF_MODEL_MAP entry. If the full K3 is ever added
 * as its own row, this label has to be disambiguated at that point.
 */
const GPT_5_6_LUNA_ES_MODEL = {
  id: FREEBUFF_GPT_5_6_LUNA_ES_MODEL_ID,
  // Named for what it IS. "Luna" appears nowhere: the route answers "Codex" when
  // asked, so a row calling it Luna would be contradicted by the model itself.
  displayName: 'Codex (test)',
  tagline: 'Novita route — evaluation only',
  availability: 'always',
  // No AI-training claim either way: the supplier has no resale agreement for
  // this route, so we have no data-use terms to pass on. `service` is the
  // conservative reading — we are not asserting a training warning we cannot
  // substantiate, and not asserting safety we cannot either.
  dataUse: 'service',
  // TRUE so it cannot fall into FREEBUFF_STANDARD_MODEL_IDS, which is derived
  // as `WEB_ALL.filter(m => !m.premium)` — the UNMETERED pool. God-only is the
  // gate; this flag is what stops the row becoming free inference if the gate
  // is ever widened.
  premium: true,
  multimodal: false,
  reasoningEffort: FREEBUFF_GPT_5_6_LUNA_REASONING_EFFORT,
} as const satisfies FreebuffModelOption

const KIMI_K3_ECO_MODEL = {
  id: FREEBUFF_KIMI_K3_ECO_MODEL_ID,
  displayName: 'Kimi K3',
  tagline: 'Via CrofAI',
  availability: 'always',
  dataUse: 'service',
  premium: true,
  multimodal: false,
  experimental: true,
  // CrofAI likewise ignores reasoning_effort for this build. Do not expose a
  // control until this concrete route reports distinct supported levels.
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
  // pickers' styling and for FREEBUFF_STANDARD_MODEL_IDS, which must not
  // absorb it.
  premium: true,
  multimodal: true,
  // OpenRouter reports low/medium/high/xhigh/max, with high as the default.
  efforts: EFFORTS_THROUGH_MAX,
  defaultEffort: 'high',
  isNew: true,
} as const satisfies FreebuffModelOption

/**
 * Meta Muse Spark 1.2 Contributor. Premium on Web, and unusual in WHY: every
 * other premium row is priced premium, while this one is cheaper per token than
 * DeepSeek V4 Flash. What is scarce is the 60 RPM team-wide rate limit, so the
 * daily premium session pool is doing double duty here as a way to bound how
 * many people are inside that limit at once. See
 * FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID.
 */
const MUSE_SPARK_12_CONTRIBUTOR_MODEL = {
  id: FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
  displayName: 'Muse Spark 1.2',
  // The tagline names the thing that actually differentiates this row for a
  // user: it is the one model that can make you wait. Context length is not
  // what they need to know before picking it.
  tagline: 'Queue',
  taglineTooltip: MUSE_SPARK_FALLBACK_NOTICE,
  availability: 'always',
  // Load-bearing pair (a catalog invariant test enforces it): the Contributor
  // tier's whole discount is Meta training on prompts and completions.
  warning: FREEBUFF_AI_TRAINING_NOTICE,
  dataUse: 'training',
  premium: true,
  multimodal: false,
  reasoningEffort: FREEBUFF_MUSE_SPARK_REASONING_EFFORT,
  efforts: EFFORTS_THROUGH_XHIGH,
  defaultEffort: FREEBUFF_MUSE_SPARK_REASONING_EFFORT,
} as const satisfies FreebuffModelOption

/**
 * The Ox Alpha picker row. STANDARD rather than premium — metered by no session
 * pool on any surface, which is what `!premium` means here
 * (FREEBUFF_STANDARD_MODEL_IDS is derived by filtering on it).
 *
 * That is a reading of a $0 price and a measured ceiling, not an oversight of
 * the rule the premium lists keep repeating. There is nothing to ration: the
 * model costs nothing and the fence keeps it that way
 * (FREEBUFF_OX_ALPHA_MAX_PRICE), and its host absorbed 300 concurrent requests,
 * ~99k prompt tokens/sec and 1,800 requests at a sustained 10/s without a
 * single 429 (docs/freebuff-ox-alpha.md). What a pool would really ration is
 * our standing with that host, and no number in this file can tell us where
 * that limit is — serving the model and watching it can, which is what the two
 * browser surfaces are for here.
 *
 * `experimental` is doing real work on this row rather than decorating it. An
 * anonymous host can reprice, rename or withdraw a stealth model with no
 * notice, so the TEST badge is the only promise about it we can actually keep.
 */
const OX_ALPHA_MODEL = {
  id: FREEBUFF_OX_ALPHA_MODEL_ID,
  displayName: 'Ox Alpha',
  // Names the property a user picks this row FOR. "Free" would not distinguish
  // it — every row in this catalog is free to the user — and naming the host
  // is impossible, which is the whole point of a stealth model.
  tagline: '1M context',
  availability: 'always',
  // NOT the AI-training notice, and the gap between the two is the point. The
  // stealth terms say the host keeps prompts and completions and does not train
  // on them, so `dataUse` stays 'service' — that field is what
  // FREEBUFF_TRACED_MODEL_IDS keys off, and claiming a training grant we were
  // not given would be wrong in the direction that changes behavior. The
  // warning still says the thing a user wants before pasting a private repo
  // into a provider whose name nobody will tell them.
  //
  // NOTE this is the one row where a warning does not imply `dataUse:
  // 'training'`. The invariant test asserting they move together scopes itself
  // to SUPPORTED_FREEBUFF_MODELS (the CLI/Desktop catalog), which this is
  // deliberately not in; ox-alpha.test.ts pins the exception so it reads as a
  // decision rather than as drift.
  warning: 'Anonymous provider retains prompts',
  dataUse: 'service',
  premium: false,
  // text + image + video in, text out.
  multimodal: true,
  // See FREEBUFF_OX_ALPHA_MODEL_ID for the measurement behind this. The
  // provider's own default is `max`, which is 4x the tokens and 4x the latency
  // of `high` for no better answer.
  reasoningEffort: 'high',
  efforts: OX_ALPHA_REASONING_EFFORTS,
  defaultEffort: 'high',
  experimental: true,
  isNew: true,
} as const satisfies FreebuffModelOption

export const SUPPORTED_FREEBUFF_MODELS = [
  OX_ALPHA_MODEL,
  DEEPSEEK_V4_PRO_MODEL,
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
// MiMo 2.5 Pro is GONE (2026-08-04). It was hidden from the client pickers on
// 2026-07-31 and kept server-valid for released clients, exactly as Kimi K2.7
// Code was; this is the second stage of that same retirement. Requests for it
// now 403 with free_mode_invalid_agent_model. The non-Pro MiMo 2.5 is
// unaffected, and paid/BYOK MiMo Pro plus its llm-api provider routing are
// untouched.
// Order is the order shown in every picker: the recommended default leads, the
// unlimited fallback it steps down to follows, then the rest of the full-access
// grid.
//
// DeepSeek V4 Pro is PAUSED for free mode (2026-08-18) and left this list — the
// row is gone from every picker. It stays in SUPPORTED_FREEBUFF_MODELS on
// purpose: released clients hold their catalog in the binary and keep asking for
// it, and an id the server does not RECOGNISE cannot be coerced, only refused.
// Recognising it is what lets admission substitute (see
// FREEBUFF_PAUSED_FREE_MODEL_IDS) instead of wedging those clients the way
// #1801 wedged the limited tier.
export const FREEBUFF_MODELS = [
  // LUNA LEADS as of 2026-08-24, and the position is not a preference — a test
  // pins FREEBUFF_MODELS[0] to DEFAULT_FREEBUFF_MODEL_ID, so this moved because
  // the DEFAULT had to move.
  //
  // Flash closes for the ten-hour peak window again (see its `availability`),
  // and the default must be open at every hour: it is what a new user lands on
  // before they know the catalog exists, so a default dark for ten hours a day
  // fails admission for exactly the people least able to diagnose it. That
  // invariant is asserted, not assumed.
  //
  // Luna rather than Pro, on measured cost inside the window (2026-08-24 09:00Z):
  //   Luna @ Cheaper Inference  $0.002659/msg   93.8% cache
  //   Pro  @ Cheaper Inference  $0.005731/msg   87.4% cache
  // Luna is less than half of Pro and less than half of Flash-at-peak, which is
  // the reverse of the ordering rationale that stood on 2026-08-22, when Luna's
  // cost was being read off a card that priced its cache reads 25x too high.
  //
  // Ordering is still the ONLY steer here — no supersedes notices, nothing
  // badged RECOMMENDED — so changing this order is a product decision.
  GPT_5_6_LUNA_MODEL,
  DEEPSEEK_V4_FLASH_MODEL,
  ...(FREEBUFF_ENABLE_MIMO_MODELS_IN_UI ? [MIMO_V25_MODEL] : []),
  // Next to MiMo because they are the two UNMETERED rows -- a user scanning for
  // something that costs no session finds them together. Not first:
  // FREEBUFF_MODELS[0] is pinned by test to DEFAULT_FREEBUFF_MODEL_ID, and an
  // experimental row must never become the thing a new user lands on before
  // they know the catalog exists.
  OX_ALPHA_MODEL,
  // LAST again: capped at one session a day, closed for ten hours, and the
  // dearest row we serve. Somewhere a user reaches deliberately rather than by
  // scanning from the top.
  DEEPSEEK_V4_PRO_MODEL,
] as const satisfies readonly FreebuffModelOption[]

// Flash joined this list on 2026-08-18 and LEFT it on 2026-08-24, once the
// Luminal lane gave it somewhere cheap to run — see
// DEEPSEEK_V4_FLASH_MODEL.premium for why, and for the constants that
// deliberately did not follow it out. Dropping it here is what makes it
// unlimited: FREEBUFF_STANDARD_MODEL_IDS is derived by filtering `!premium`, so
// a model in neither this list nor a referral pool becomes unmetered by
// construction.
//
// This is the FULL-ACCESS pool only. The limited tier meters by region rather
// than model and reads LIMITED_FREEBUFF_MODEL_IDS, so nothing here reaches it.
//
// Pro never left for long: it was pulled from the catalog entirely on 08-18 and
// restored on 08-19, because both monitoring its cost and routing its provider
// require it to serve traffic. What changed instead is that nothing recommends
// it — see its supersededBy and its place at the end of FREEBUFF_MODELS.
export const FREEBUFF_PREMIUM_MODEL_IDS = [
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
] as const

/**
 * Per-user daily ceilings on INDIVIDUAL premium models, on top of — not instead
 * of — the shared premium pool.
 *
 * A pool per entry, NOT one pool shared between them: two models capped at one
 * session each is two sessions, and folding them together would silently halve
 * both. The shared premium pool still meters every one of these as well, so a
 * capped session costs a user their scarce allowance AND a premium unit.
 *
 * Why the expensive rows and not the cheap ones: five premium sessions spent
 * entirely on V4 Pro and five spent on MiMo are the same number and wildly
 * different bills. The pool counts sessions; only this expresses price. Flash
 * is deliberately absent — it is the recommended default, and capping the model
 * most users are steered onto would push them off the catalog's cheapest
 * competent row after a single hour. Flash fills whatever the pool has left.
 *
 * A TABLE rather than a constant per model, because this is the lever that gets
 * pulled under cost pressure and it should be one line to add a row, one number
 * to change a limit, and nothing at all to change in a client — the label ships
 * to installed CLIs and Desktops over the wire (see FreebuffSessionRateLimit).
 */
export const FREEBUFF_PER_MODEL_SESSION_CAPS: Readonly<
  Record<string, { limit: number; pool: string; poolLabel: string }>
> = {
  // V4 Pro came out on 2026-08-21 and should stay out: it moved to a flat
  // $0.002538/M cache read, which is the cheapest premium row we serve. Capping
  // the cheap row is what the table exists NOT to do.
  //
  // Luna is capped at TWO — half the shared premium pool, not all of it — and
  // the number is a comparison rather than a budget. At $0.008/M cache read it
  // is ~3x Pro's, so a pool spent entirely on Luna costs several times the same
  // pool spent on Pro. Two lets a user run it alongside the cheaper row instead
  // of choosing between them, while a full four would make the expensive row
  // the default way to spend the day.
  //
  // Anything added here is automatically a FIXED pool (no streak, referral or
  // grant may raise it) and automatically counts ADMISSIONS rather than session
  // units. The second is not optional — units floor at 0.1, so a unit-counted
  // "2 a day" is really 20 a day. That was a real prod bug on 2026-08-20.
  //
  // Flash was never here and still should not be: it is the recommended
  // default, and capping the row most users are steered onto would push them
  // off the catalog's cheapest competent option after a single hour.
  // V4 PRO IS UNCAPPED as of 2026-08-22, metered only by the shared premium
  // session pool like Flash. The cap tracked Pro being the dearest row per
  // token on DeepSeek direct ($0.022/M off-peak, $0.044/M at peak); on Cheaper
  // Inference it reads cache at $0.002538/M FLAT, which makes it the cheapest
  // premium row we serve. Capping the cheap row is what this table exists not
  // to do.
  //
  // If Pro ever returns to DeepSeek direct, the cap comes back with it — the
  // entry is a claim about price, and that is the price that changed.
  // LUNA IS UNCAPPED as of 2026-08-23, metered only by the shared premium
  // pool like Pro and Flash. The cap said Luna was ~3x Pro on cache reads; it
  // is not, and the comparison that set the number was reading a broken card.
  // Measured on the settled rates both lanes actually bill:
  //
  //   Luna  $0.008/M cache read   ->  $0.20/session on Cheaper Inference
  //   Pro   $0.002538/M           ->  $0.34/session
  //
  // Luna is now the CHEAPER of the two per session, so a pool spent on it costs
  // less than the same pool spent on the row that was left uncapped. The entry
  // was a claim about relative price, and the claim inverted.
  //
  // The table is deliberately EMPTY rather than deleted. It is the lever that
  // gets pulled under cost pressure, and the argument above for which rows
  // belong in it is the part worth keeping.
}

/** Whether `model` carries a ceiling of its own beyond the shared pool. */
export function getFreebuffPerModelSessionCap(
  model: string | null | undefined,
): { limit: number; pool: string; poolLabel: string } | undefined {
  if (!model) return undefined
  return FREEBUFF_PER_MODEL_SESSION_CAPS[model]
}

export const FREEBUFF_DEEPSEEK_SESSION_PERIOD = FREEBUFF_PREMIUM_SESSION_PERIOD
export const FREEBUFF_DEEPSEEK_SESSION_RESET_TIMEZONE =
  FREEBUFF_PREMIUM_SESSION_RESET_TIMEZONE
export const FREEBUFF_DEEPSEEK_SESSION_WINDOW_HOURS =
  FREEBUFF_PREMIUM_SESSION_WINDOW_HOURS

/**
 * Models free mode no longer runs, but still RECOGNISES.
 *
 * This is not a picker-only retirement (FREEBUFF_WEB_RETIRED_PICKER_MODEL_IDS
 * is that, and is deliberately empty) — nothing here is served to anyone. It is
 * the opposite problem: a paused model must stay a known id so the server can
 * SUBSTITUTE for it.
 *
 * An id dropped from SUPPORTED entirely is one `isFreebuffSessionModelId` says
 * nothing about, so the coercion in `resolveFreebuffSessionModelForAccessTier`
 * never runs and the request is simply refused. Every installed client holding
 * that pick then retries forever, because the pick comes from the catalog
 * compiled into its binary and no server change reaches it — measured at 2.5x
 * admissions and 91% of sessions ending at the 0.1-unit floor when the limited
 * tier hit exactly this on 2026-08-18 (#1801).
 *
 * So: out of every picker, out of every quota list, still recognised, and
 * coerced to the tier's default at admission and at the session gate.
 *
 * EMPTY as of 2026-08-19. V4 Pro was the only entry, for one day, and came
 * back because monitoring its cost and routing its provider both need it to
 * serve traffic — it is de-recommended instead (see its supersededBy).
 *
 * The machinery stays. It is the tested answer to a question that keeps coming
 * up under cost pressure, and the expensive way to learn it is the one already
 * paid for in #1801: the coercion has to exist BEFORE a model is taken away,
 * because the clients that need it are the ones already installed.
 */
export const FREEBUFF_PAUSED_FREE_MODEL_IDS: readonly string[] = [
  // Withdrawn from free mode entirely on 2026-08-20. It reached $213/hr — the
  // largest single line on the bill — and is not worth that at any tier.
  //
  // PAUSED rather than deleted, which is the difference between withdrawing a
  // model and breaking the clients that still ask for it. Every released CLI and
  // Desktop holds this id in its compiled-in catalog and will keep sending it;
  // an id the server does not RECOGNISE cannot be coerced, only refused, and a
  // refusal here is the retry loop that cost the limited tier 2.5x its
  // admissions in #1801. Listed here it stays recognised, is coerced to the
  // fallback at admission, and is served to nobody.
  FREEBUFF_MINIMAX_M3_MODEL_ID,
]

/**
 * What a caller asking for a withdrawn model is told.
 *
 * Names the model it asked for and what to use instead — the client that sends
 * this id is a released binary whose picker still lists it, so "unavailable"
 * alone leaves the user staring at a row that looks fine and does not work.
 */
export function freebuffWithdrawnModelMessage(id: string): string {
  const model = SUPPORTED_FREEBUFF_MODELS.find((m) => m.id === id)
  const name = model?.displayName ?? id
  const replacement =
    SUPPORTED_FREEBUFF_MODELS.find((m) => m.id === DEFAULT_FREEBUFF_MODEL_ID)
      ?.displayName ?? DEFAULT_FREEBUFF_MODEL_ID
  return `${name} is no longer available in Freebuff. We recommend using ${replacement} instead.`
}

/** Suffix-tolerant like the other model predicates, so a dated provider
 *  snapshot of a paused model cannot slip past the pause. */
export function isFreebuffPausedFreeModelId(
  id: string | null | undefined,
): boolean {
  if (!id) return false
  return FREEBUFF_PAUSED_FREE_MODEL_IDS.some((modelId) =>
    freebuffModelIdMatches(id, modelId),
  )
}

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

/** Freebuff Web-only picker/support set: the CLI/Desktop catalog plus the
 *  earned GLM 5.2 row. */
export const FREEBUFF_WEB_MODELS = [
  // Ox Alpha is NOT listed here any more -- it reaches this list through
  // ...FREEBUFF_MODELS since it joined the CLI/Desktop catalog on 2026-08-24.
  // Naming it here as well would list it twice in both browser pickers.
  MUSE_SPARK_12_CONTRIBUTOR_MODEL,
  GLM_V52_MODEL,
  ...FREEBUFF_MODELS,
] as const satisfies readonly FreebuffModelOption[]

export const FREEBUFF_WEB_GOD_ONLY_MODELS = [
  KIMI_K3_ECO_MODEL,
  GPT_5_6_LUNA_ES_MODEL,
] as const satisfies readonly FreebuffModelOption[]

export const FREEBUFF_WEB_ALL_MODELS = [
  ...FREEBUFF_WEB_GOD_ONLY_MODELS,
  ...FREEBUFF_WEB_MODELS,
] as const satisfies readonly FreebuffModelOption[]

/** Derived rather than hand-listed: this is what isFreebuffWebGodOnlyModelId()
 *  checks to keep a god-only row off /api/live, /api/latency and the picker
 *  for a non-god user, and a hand-maintained second list can drift from
 *  FREEBUFF_WEB_GOD_ONLY_MODELS above without either failing to compile — the
 *  same shape FREEBUFF_ROOT_AGENT_IDS avoids relative to the base3 map. */
export const FREEBUFF_WEB_GOD_ONLY_MODEL_IDS = Object.freeze(
  FREEBUFF_WEB_GOD_ONLY_MODELS.map((model) => model.id),
)

/**
 * Web/Cloud models the picker no longer offers, while the backend keeps
 * honoring them so a session already running on one finishes normally: the id
 * stays in FREEBUFF_WEB_MODELS and in whichever quota list meters it, because
 * dropping a live session's model from the catalog fails admission mid-run and
 * dropping it from its quota list alone would leave it metered by NO pool.
 *
 * DELIBERATELY EMPTY, and the bar for adding to it is high.
 *
 * A picker-only retirement is a UI change, not a gate: the filter runs
 * client-side, so anything talking to the API directly still reaches the id.
 * Both former occupants proved it. The CrofAI GLM 5.2 route sat here from
 * 2026-07-30 and hand-written callers kept admitting free premium-pool GLM
 * sessions on it for five days. HY3 sat here since the initial web rollout.
 * Both were deleted outright on 2026-08-04.
 *
 * Park a model here ONLY to let genuinely live sessions drain, and only when
 * the id being reachable in the meantime is harmless — never as the gate
 * itself, and never for a model that costs real money or is entitlement-earned.
 * Then finish the removal.
 */
export const FREEBUFF_WEB_RETIRED_PICKER_MODEL_IDS = [] as const

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

/** Models metered by the SHARED daily premium pool, which every full-access
 *  account is granted for free. GLM 5.2 (FREEBUFF_GLM_V52_MODEL_IDS) is held
 *  out because its entitlement is earned rather than granted daily — putting
 *  any GLM route in this list hands the model out for nothing. */
export const FREEBUFF_WEB_PREMIUM_MODEL_IDS = [
  ...FREEBUFF_PREMIUM_MODEL_IDS,
  // Metered by the web premium pool like every other god-only row. Being in
  // SOME pool is the point: FREEBUFF_STANDARD_MODEL_IDS is derived by
  // filtering `!premium`, so a premium model left out of here would be metered
  // by no pool at all rather than by a stricter one.
  FREEBUFF_KIMI_K3_ECO_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_ES_MODEL_ID,
  // Not here for cost — Muse Spark Contributor is cheaper per token than the
  // Standard pool's models. The premium pool is what bounds how many users sit
  // inside its 60 RPM team-wide ceiling at once, and being in SOME pool is
  // mandatory: FREEBUFF_STANDARD_MODEL_IDS is derived by filtering
  // `!premium`, so a premium model left out of here is metered by no pool.
  FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
] as const

/**
 * Full-access models outside the premium and referral pools — i.e. the ones a
 * full-access account may use without a session quota at all, on every
 * surface.
 *
 * Derived by filtering `!premium` over the public catalog, which is why the
 * premium lists above insist that every premium model appear in SOME pool: a
 * premium model left out of them lands in here and becomes unlimited.
 *
 * Named `WEB_STANDARD` until 2026-08-18, when the browser-only session pool it
 * was named after was removed; the list itself is unchanged and is now the
 * catalog invariant several tests assert against.
 */
export const FREEBUFF_STANDARD_MODEL_IDS = Object.freeze(
  FREEBUFF_WEB_ALL_MODELS.filter((model) => !model.premium).map(
    (model) => model.id,
  ),
)

/** Models unlocked by referrals, metered by the daily GLM session pool rather
 *  than the daily premium pool. Kept separate from FREEBUFF_PREMIUM_MODEL_IDS
 *  so GLM never falls into the shared daily premium quota. Since 2026-07-30
 *  this is the ONLY way to reach GLM 5.2 on any surface. */
export const FREEBUFF_GLM_V52_MODEL_IDS = [FREEBUFF_GLM_V52_MODEL_ID] as const

/** Models that occupy the single per-user "premium-bucket" CONCURRENCY slot in
 *  Freebuff Desktop's multi-session mode: at most one of these may have an
 *  active session per user at a time, while every other model may run in up to
 *  three concurrent tabs. (On the LIMITED access tier the admission path puts
 *  EVERY model in the slot regardless of this list — limited users get one
 *  freebuff tab at a time; see `requestDesktopSession`.)
 *
 *  This is strictly a CONCURRENCY bucket, NOT a quota bucket, and since
 *  2026-08-24 it is SPELLED OUT rather than derived from
 *  FREEBUFF_PREMIUM_MODEL_IDS. Deriving it meant metering a model — a spend
 *  decision about a daily pool — silently also capped its tabs. Flash entering
 *  the quota list on 2026-08-18 therefore made the DEFAULT model one-tab-only,
 *  and ~1k accounts a day met "Another tab is using the hosted model" on the row
 *  they were steered to. Like FREEBUFF_PER_MODEL_SESSION_CAPS, membership is A
 *  CLAIM ABOUT PRICE: a row belongs when one user running three at once is a
 *  bill we would not want to underwrite. Decide the two lists separately.
 *
 *  Do NOT use this for the daily premium quota — that stays on
 *  isFreebuffPremiumModelId, so GLM (metered weekly) never starts burning the
 *  5/day premium pool.
 *
 *  ONE THING THE SPLIT NOW ALLOWS THAT THE DERIVATION DID NOT: a row that is
 *  metered AND multi-tab. `buildAdmitStampStatement` pairs an outgoing window to
 *  its admit row on `(user, model, access_tier, admitted_at)`, so two tabs of one
 *  metered row admitted in the SAME MILLISECOND make that pairing arbitrary and
 *  one window's charge can land on the other's admit. Nothing is metered and
 *  multi-tab today. Before making one so, key admit rows by instance id. */
export const FREEBUFF_DESKTOP_PREMIUM_BUCKET_MODEL_IDS = [
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
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
/** Trusted server-to-server companion to the acting-user header: the Freebuff
 *  Web/Cloud proxy sets it to '1' after verifying, server-side, that the
 *  acting account holds the god/admin role on Freebuff Web. Like the
 *  acting-user header it is honored only when the request authenticates as
 *  the Freebuff Web service account; from any other caller it is ignored, so
 *  forging it buys nothing. */
export const FREEBUFF_PRIVILEGED_USER_HEADER = 'x-freebuff-privileged-user'
/** Trusted Freebuff Web/Cloud session-proxy hint: also resolve the GLM referral
 * pool, which costs a query of its own. Set by the surfaces that render a GLM
 * row. The name is historical — every other pool is now sent unconditionally —
 * but the string stays as-is so installed clients keep working. */
export const FREEBUFF_INCLUDE_UNUSED_RATE_LIMITS_HEADER =
  'x-freebuff-include-unused-rate-limits'
/** Set by the CLI on its recurring active-session poll. The response keeps the
 *  authoritative session state but omits quota snapshots the CLI already has
 *  and does not need for its countdown. */
export const FREEBUFF_COMPACT_SESSION_HEADER = 'x-freebuff-compact-session'
/** Set to '1' by Freebuff Desktop to opt into multi-session mode (concurrent
 *  per-tab sessions); absent for CLI/web, which keep one session per user. */
export const FREEBUFF_MULTI_SESSION_HEADER = 'x-freebuff-multi-session'
/** Set to '1' on a per-instance GET /session to mark it as a liveness beat: the
 *  client is telling the server this tab is still there. Only a beat writes the
 *  row's `last_seen_at`, and only a row with a `last_seen_at` can give up its
 *  concurrency slot for going quiet — so a client that never beats keeps the
 *  `expires_at`-only rule and is never dropped mid-window. */
export const FREEBUFF_HEARTBEAT_HEADER = 'x-freebuff-heartbeat'
/** How often a beating client re-beats. The server's liveness TTL is a multiple
 *  of this (several missed beats), so a brief network blip never costs a live
 *  tab its slot. */
export const FREEBUFF_SESSION_HEARTBEAT_INTERVAL_MS = 45_000
/** Set on POST /session to the instance id of the single-slot holder the caller
 *  was just told about, meaning "end that tab's session and give me the slot"
 *  (Desktop's "Use it here"). Liveness covers a holder that stopped beating, but
 *  it cannot help when the holder is genuinely alive somewhere the user cannot
 *  reach — another machine, or a window they have no way to close — so this is
 *  the escape hatch that does not depend on us having modelled liveness right.
 *
 *  It names a holder rather than saying "take whatever is there": the server
 *  only honors it when it still matches the holder the rejection identified, so
 *  a click on a stale card can never end a tab the user was never shown. */
export const FREEBUFF_TAKEOVER_INSTANCE_HEADER =
  'x-freebuff-takeover-instance-id'
/** Drain window after a session's `expires_at`: the gate still serves an
 *  in-flight agent run, but no new prompt should start. Shared because the
 *  client has to know it too — a tab keeps beating until its row is past this,
 *  which is what lets the server tell a run that is finishing from a tab that
 *  died. Server-side accessor: `getSessionGraceMs()`. */
export const FREEBUFF_SESSION_GRACE_MS = 30 * 60 * 1000

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

/** What new freebuff users see selected in the CLI and Desktop pickers, and the
 *  model their "RECOMMENDED" hero opens on. DeepSeek V4 Flash 07/31 as of
 *  2026-08-18, taking back the lead it held until 2026-08-12, because V4 Pro —
 *  which took it on the strength of the 08/13 GA build — is paused for free mode
 *  (FREEBUFF_PAUSED_FREE_MODEL_IDS). Flash is the strongest row free mode still
 *  runs, so it leads again by default rather than by re-argued merit.
 *
 *  It is PREMIUM as of the same day, which it was NOT the last time it held this
 *  slot, so the machinery below is now load-bearing for it too: the shared daily
 *  pool CAN run dry, and surfaces that know the live quota must step down to
 *  FALLBACK_FREEBUFF_MODEL_ID once it is spent — getRecommendedFreebuffModelId
 *  for the picker hero, Desktop's availableFreebuffDefault for an unpicked tab —
 *  or the default becomes a model whose next send fails admission.
 *
 *  Still three separate constants: this one, DEFAULT_FREEBUFF_WEB_MODEL_ID and
 *  FALLBACK_FREEBUFF_MODEL_ID (what callers needing a guaranteed-available id
 *  for resolution / auto-fallbacks should use). The first two name the same
 *  model today and have diverged before; the third is genuinely a different
 *  model rather than the same one under two names.
 *
 *  It carries the AI-training notice, so pickers using it must render the
 *  model's `warning`. */
export const DEFAULT_FREEBUFF_MODEL_ID: FreebuffModelId =
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID

/** What new Freebuff Web/Cloud users see selected in the browser pickers, and
 *  the model a new Cloud thread starts on. DeepSeek V4 Pro as of 2026-08-21.
 *
 *  A STARTING POSITION, not an endorsement — nothing in the catalog is badged
 *  RECOMMENDED any more. It is Pro because a default has to be joinable and Pro
 *  is the only premium row open at every hour: V4 Flash now closes for the
 *  ten-hour peak window, and a default that is unavailable for part of every
 *  day is a default that fails admission for the users least able to diagnose
 *  it.
 *
 *  A browser build is the workload where model quality shows up most: one long
 *  agentic run against a live sandbox, where a wrong turn early costs the whole
 *  first project, which 51% of Web users never come back from. That argument
 *  picked Pro and it has not changed — Pro is simply not available to spend on
 *  right now, so this falls to the strongest row free mode still runs.
 *
 *  The cost half had ALREADY collapsed before the pause, which is why this is a
 *  smaller loss than it looks. Browser turns re-send their whole prefix every
 *  step, so cache reads are ~98% of tokens; Pro read cache at $0.003625/M
 *  against Luna's $0.010/M until DeepSeek's 16:00 UTC 2026-08-16 repricing put
 *  it at $0.022/M off-peak and $0.044/M at peak — 2.2x to 4.4x DEARER than Luna
 *  on the dominant term, on top of fresh input and output. See
 *  FREEBUFF_WEB_DEEMPHASIZED_MODEL_IDS for the table.
 *
 *  Flash keeps the AI-training notice Pro carried, so the disclosure a
 *  first-time user sees is unchanged. It is premium as of 2026-08-18, so it
 *  still draws on the shared daily pool and the step-down to
 *  FALLBACK_FREEBUFF_MODEL_ID stays load-bearing (getRecommendedFreebuffWebModelId
 *  for the hero picker; the model selector coerces a spent default) — otherwise
 *  the default becomes a model whose next send fails admission.
 *
 *  Kept as its own constant from DEFAULT_FREEBUFF_MODEL_ID (CLI/Desktop) so the
 *  browser surfaces can steer independently. They name the same model today and
 *  diverged as recently as 2026-08-04 → 2026-08-12. */
export const DEFAULT_FREEBUFF_WEB_MODEL_ID: FreebuffWebModelId =
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID

/** Premium models the Web/Cloud picker renders small and muted: they are
 *  materially more expensive per token than the recommended default without
 *  being materially better for the browser surfaces' workloads. They stay
 *  fully selectable — this only controls emphasis and ordering (they sort last
 *  within the Premium group).
 *
 *  This tracks the models Flash superseded — costing more per token AND having
 *  lost the quality argument — so muting them is what steers new picks to Flash.
 *  Both halves of that test have to hold: DeepSeek V4 Pro left this list on
 *  2026-08-12 because its 08/13 GA build wins the quality half again.
 *
 *  EMPTY as of 2026-08-12. MiniMax M3 was the last entry, and with Pro gone it
 *  was the only muted row in a list of full-size ones — the compact treatment
 *  folds the tagline up onto the name line, which next to four two-line rows
 *  read as a broken row rather than as a de-emphasized one. M3 keeps its
 *  supersededBy notice, which is the steering that was doing the real work.
 *  Muting only pays for itself on a group of rows, so add entries back in
 *  pairs or not at all.
 *
 *  GPT-5.6 Luna is superseded (by Pro) and deliberately NOT muted. The cost
 *  half of that call used to be genuinely unresolvable; DeepSeek's 16:00 UTC
 *  2026-08-16 repricing resolved it the other way. Per M — Luna read off
 *  OpenRouter 2026-08-12, Pro from DeepSeek's published card:
 *
 *                    fresh input   cache read   output
 *    V4 Pro off-peak    $0.660       $0.022      $1.980
 *    V4 Pro peak        $1.320       $0.044      $3.960
 *    Luna               $0.100       $0.010      $0.600
 *
 *  Pro was 2.76x cheaper than Luna on cache reads — the term that dominates an
 *  agent workload, where re-sent prefixes are ~98% of tokens. It is now 2.2x
 *  dearer off-peak and 4.4x dearer at peak, and it was already dearer on fresh
 *  input and output. So Pro is now dearer than Luna on every term in every
 *  window, and "materially more expensive" is a claim that has moved onto the
 *  OTHER row.
 *
 *  This list is still EMPTY and Pro is still the Web default — muting is a
 *  product-steering decision and the repricing alone should not silently flip
 *  it. But the numbers that justified both no longer say what they said; this
 *  is the note for whoever revisits it. */
export const FREEBUFF_WEB_DEEMPHASIZED_MODEL_IDS: readonly FreebuffModelId[] =
  []

export function isFreebuffWebDeemphasizedModelId(
  id: string | null | undefined,
): boolean {
  if (!id) return false
  return FREEBUFF_WEB_DEEMPHASIZED_MODEL_IDS.some((modelId) =>
    freebuffModelIdMatches(id, modelId),
  )
}

/** Always-available fallback used when the requested model can't be served
 *  right now (unknown id, deployment hours closed, premium pool spent). Kept
 *  distinct from DEFAULT_FREEBUFF_MODEL_ID so a new user's "preferred default"
 *  can be the smartest model without auto-flipping anyone to a closed
 *  serverless model.
 *
 *  MUST BE NON-PREMIUM. This is the id every surface steps down TO when the
 *  daily premium pool runs dry, so a premium value here is a step-down onto a
 *  model that fails admission for exactly the user it was meant to rescue — a
 *  loop, not a fallback. That is why it moved off Flash on 2026-08-18 the same
 *  hour Flash became premium: the two edits are one change, and restoring
 *  either alone re-creates the loop.
 *
 *  MiMo 2.5 is now the only unlimited row in the catalog, so it is both this
 *  fallback and LIMITED_FREEBUFF_MODEL_ID. Those coinciding is a consequence of
 *  the pause, not a rule — keep them separate constants. */
export const FALLBACK_FREEBUFF_MODEL_ID: FreebuffModelId =
  FREEBUFF_MIMO_V25_MODEL_ID

/**
 * The limited tier's catalog, and the model an out-of-tier or stale pick is
 * coerced to. MiMo 2.5 alone since 2026-08-18: DeepSeek V4 Flash 07/31 was this
 * tier's default until DeepSeek repriced the V4 family on 2026-08-16 (see
 * DEEPSEEK_V4_PRO_MODEL), and it is the tier's highest-volume model, so pausing
 * it here is what keeps these sessions free.
 *
 * A PAUSE, NOT A RETIREMENT. Flash stays in SUPPORTED_FREEBUFF_MODELS,
 * FREEBUFF_MODELS and FALLBACK_FREEBUFF_MODEL_ID, so full access is unaffected
 * and restoring it is re-adding the id here (and to
 * FREEBUFF_WEB_GEO_EXEMPT_MODEL_IDS) plus dropping
 * FREEBUFF_PAUSED_MODEL_NOTICE from the pickers.
 */
export const LIMITED_FREEBUFF_MODEL_ID: FreebuffModelId =
  FREEBUFF_MIMO_V25_MODEL_ID
// Ox Alpha joins the limited tier on 2026-08-24. Like MiMo it costs that pool
// nothing extra: limited access is metered by REGION, not by model, so every
// limited session draws the same FREEBUFF_LIMITED_SESSION_LIMIT whichever row
// it picks. This widens what those users may choose, not how much they get.
//
// It was already available to limited-tier BROWSER users via
// FREEBUFF_WEB_GEO_EXEMPT_MODEL_IDS; this is the CLI/Desktop half, and the two
// lists now agree for this row.
export const LIMITED_FREEBUFF_MODEL_IDS = [
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_OX_ALPHA_MODEL_ID,
] as const
export const LIMITED_FREEBUFF_MODELS = LIMITED_FREEBUFF_MODEL_IDS.map(
  (modelId) => SUPPORTED_FREEBUFF_MODELS.find((model) => model.id === modelId)!,
)

export type FreebuffAccessTier = 'full' | 'limited'

/** Access tier carried in the Freebuff Web Convex JWT. Extends the CLI tier
 *  with 'blocked' (Tor / corroborated anonymous network): the app still
 *  loads, but every agent send is rejected server-side. */
export type FreebuffWebAccessTier = FreebuffAccessTier | 'blocked'

/** How many of a user's projects may have an agent RUNNING at the same time on
 *  Freebuff Web/Cloud. Past the cap the take-over prompt appears, and taking
 *  over stops only the longest-idle run.
 *
 *  STILL 1 — and raising it is a one-line change here ONLY once Freebuff Web is
 *  on the per-tab (multi-session) free-session store. On the single-session
 *  store the web surface uses today, `admitOrTakeOver` rotates
 *  `active_instance_id` on EVERY `requestSession`, including a same-model live
 *  reclaim (web/src/server/free-session/store.ts). So the moment a second
 *  project admitted its session, the first project's in-flight turn would fail
 *  its next completions call with `session_superseded` — concurrency that
 *  silently kills the run the user is watching. Desktop already runs concurrent
 *  per-tab sessions via `requestSession({ multiSession, instanceId })`; wiring
 *  Web to the same path (session request header + `freebuff_multi_session` in
 *  the runner's `codebuff_metadata`) is what unblocks 2.
 *
 *  Everything else is already cap-agnostic: rows are per (user, project) and
 *  only `agent_running` ones count, so opening or reading a second project is
 *  free at any cap — that part shipped 2026-08-12. */
export const FREEBUFF_MAX_CONCURRENT_PROJECTS = 1

/** Abuse backstop on project creation for outer-region (limited-tier) Freebuff
 *  Web users. A project the user still has consumes one slot — creations that
 *  failed and were rolled back do not, so a bad creation never costs quota.
 *  The quota resets at midnight Pacific time.
 *
 *  This was 3 until 2026-08-12, which real users hit on their first session:
 *  every rung of the creation ladder (warm pool → cold Daytona → browser
 *  runtime) mints its own project row, so a couple of failed first builds
 *  locked someone out for the day with nothing to show for it. 10 is high
 *  enough that only automation reaches it. */
/** Per-day cap on new Web projects a user may create, in EVERY region.
 *
 *  Was 10 and limited-region only until 2026-08-19, when the Daytona US quota
 *  saturated (498/500 vCPU, 996/1000 GiB). Measured against a full day of
 *  traffic at the time — 1,893 user-owned creations across 1,484 users, mean
 *  1.3 — a cap of 5 would have blocked 41 creations (2.2%) across 11 users,
 *  and the single heaviest account created 14. So this bounds the worst case
 *  rather than reclaiming capacity; the routing change that moved
 *  limited-region desktops to Nodepod is what actually moved the number.
 *
 *  Override per deployment with FREEBUFF_WEB_PROJECT_DAILY_LIMIT. */
export const FREEBUFF_WEB_PROJECT_DAILY_LIMIT = 5

/** How many of a user's sandboxes may be running at once. A sandbox counts as
 *  open while its project has an agent run in flight or has proven presence
 *  inside Daytona's 10-minute auto-stop window.
 *
 *  Set to the highest concurrency any single account was actually observed
 *  holding on 2026-08-19 (2, across just 12 of ~1,485 daily-active owners), so
 *  it binds nobody today and only stops that number growing.
 *
 *  Override per deployment with FREEBUFF_WEB_MAX_OPEN_SANDBOXES. */
export const FREEBUFF_WEB_MAX_OPEN_SANDBOXES = 2

/** Per-day cap on blank ("plan a custom stack") Cloud projects, which unlike
 *  connect-repo need no GitHub App install and each boot a full-size VM. Same
 *  backstop role — and the same rollback exemption — as the web limit above.
 *  Resets at midnight Pacific time. */
export const FREEBUFF_CLOUD_BLANK_PROJECT_DAILY_LIMIT = 10

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
 * limited-region session pool; every other model remains geo-gated.
 *
 * Flash left this list with LIMITED_FREEBUFF_MODEL_IDS — restore it in both or
 * neither, since FREEBUFF_WEB_LIMITED_MODEL_IDS is the union of the two.
 *
 * Ox Alpha is the first entry that is here and NOT in
 * LIMITED_FREEBUFF_MODEL_IDS, and the split is the point rather than an
 * oversight: that list is the CLI/Desktop limited catalog (it maps over
 * SUPPORTED_FREEBUFF_MODELS and reaches the CLI picker, the home FAQ and the
 * README), while this one is the browser surfaces'. A Web/Cloud-only model can
 * therefore reach limited regions without appearing anywhere it cannot run.
 *
 * Being here costs the limited tier nothing extra. That tier is metered by
 * REGION, not by model — every limited session draws on the same
 * FREEBUFF_LIMITED_SESSION_LIMIT pool whichever row it picks — so this widens
 * what those users can choose without widening how much they get. */
export const FREEBUFF_WEB_GEO_EXEMPT_MODEL_IDS = [
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_OX_ALPHA_MODEL_ID,
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
  // GLM 5.2 is selectable from a limited region when the user holds a bounty
  // grant — the entitlement gate is the GLM quota pool, not this allowlist
  // (see isGlmRedeemableAtLimitedTier). Without this the Web picker coerced a
  // GLM pick straight back to the flash model, so a bounty reward earned in a
  // limited region was unspendable no matter what the server allowed.
  return (
    isGlmRedeemableAtLimitedTier(id) ||
    FREEBUFF_WEB_LIMITED_MODEL_IDS.some((modelId) => modelId === id)
  )
}

/** Coerce a limited-tier Freebuff Web selection (premium ids, stale
 * localStorage values — including a Flash pick saved before that model was
 * paused for this tier) to LIMITED_FREEBUFF_MODEL_ID. */
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

/** The model the CLI/Desktop picker highlights as the "recommended" hero so a
 *  new user can start with one Enter press without scanning the full list. Full
 *  access → DEFAULT_FREEBUFF_MODEL_ID (GPT-5.6 Luna); limited →
 *  LIMITED_FREEBUFF_MODEL_ID (MiMo 2.5). Both names are restated here because
 *  this docblock twice outlived the constants it described — it still named V4
 *  Pro and V4 Flash on 2026-08-24, long after neither was returned.
 *
 *  The hero is premium, so ALWAYS pass `premiumExhausted` from the live quota
 *  snapshot: it flips to FALLBACK_FREEBUFF_MODEL_ID once the daily pool runs
 *  out, because the recommended pick has to stay joinable. A caller that omits
 *  it will offer a hero whose next send fails admission. */
export function getRecommendedFreebuffModelId(
  accessTier: FreebuffAccessTier | null | undefined,
  options: { premiumExhausted?: boolean } = {},
): SupportedFreebuffModelId {
  if (accessTier === 'limited') return LIMITED_FREEBUFF_MODEL_ID
  if (options.premiumExhausted) return FALLBACK_FREEBUFF_MODEL_ID
  return DEFAULT_FREEBUFF_MODEL_ID
}

/** The Web/Cloud counterpart of getRecommendedFreebuffModelId: full access →
 *  DEFAULT_FREEBUFF_WEB_MODEL_ID (GPT-5.6 Luna); limited →
 *  LIMITED_FREEBUFF_MODEL_ID. `premiumExhausted` flips the hero to the
 *  unlimited flash model so the recommended pick is always joinable. */
export function getRecommendedFreebuffWebModelId(
  accessTier: FreebuffAccessTier | null | undefined,
  options: { premiumExhausted?: boolean } = {},
): FreebuffWebModelId {
  if (accessTier === 'limited') return LIMITED_FREEBUFF_MODEL_ID
  if (options.premiumExhausted) return FALLBACK_FREEBUFF_MODEL_ID
  return DEFAULT_FREEBUFF_WEB_MODEL_ID
}

/**
 * GLM 5.2 is reachable from limited access, but only against a bounty-earned
 * grant.
 *
 * The tier gate used to live here, in the model allowlist: a limited-tier
 * (VPN / unsupported-country) user could not name GLM at all. Bounties pay a
 * GLM session that is meant to be worth the same in every region, so the gate
 * moved DOWN into the quota pool — at limited tier the GLM pool counts only
 * grants minted `redeemable_at_limited_tier` (bounty payouts), and nothing
 * else. Referral GLM entitlement still counts for nothing there, which is the
 * anti-farming stance docs/referrals.md describes.
 *
 * The practical effect of allowing it here is that a limited user with no
 * bounty grant gets `rate_limited` (limit 0) instead of `session_model_
 * mismatch`. Clients only surface GLM to them once the server reports a
 * balance, so that path is not a normal one to hit.
 */
export function isGlmRedeemableAtLimitedTier(
  model: string | null | undefined,
): boolean {
  return FREEBUFF_GLM_V52_MODEL_IDS.some((modelId) => modelId === model)
}

export function isFreebuffModelAllowedForAccessTier(
  model: string | null | undefined,
  accessTier: FreebuffAccessTier | null | undefined,
): boolean {
  if (!model) return false
  if (accessTier !== 'limited') return isFreebuffModelId(model)
  return (
    isGlmRedeemableAtLimitedTier(model) ||
    LIMITED_FREEBUFF_MODEL_IDS.some((modelId) => modelId === model)
  )
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
  // A paused model is allowed to NO tier. Checked ahead of everything else
  // because the pause is the whole point: it is still a recognised session id
  // (see FREEBUFF_PAUSED_FREE_MODEL_IDS), so every other branch here would
  // happily admit it.
  if (isFreebuffPausedFreeModelId(model)) return false
  if (accessTier !== 'limited') return isFreebuffSessionModelId(model)
  // See isGlmRedeemableAtLimitedTier: GLM's limited-tier gate is the quota
  // pool (bounty grants only), not this allowlist.
  //
  // The UNION of both limited catalogs, for the same reason the full-access
  // branch above takes the union of both full catalogs: session admission is
  // shared by CLI, Desktop, Web and Cloud, so it must accept every row ANY of
  // them may legitimately offer. Reading only the CLI/Desktop list
  // (LIMITED_FREEBUFF_MODEL_IDS) is what it did until Ox Alpha, which was
  // harmless only while the two lists happened to agree — the moment a
  // browser-only row reaches limited regions, that version offers a picker row
  // whose first send fails admission with session_model_mismatch.
  //
  // Widening WHAT a limited user may pick, not how much: the limited pool is
  // keyed on the tier rather than the model.
  return (
    isGlmRedeemableAtLimitedTier(model) ||
    FREEBUFF_WEB_LIMITED_MODEL_IDS.some((modelId) => modelId === model)
  )
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
    // GLM survives the coercion at limited tier so a bounty-earned session is
    // launchable from any region; the pool decides whether it is joinable.
    if (id === FREEBUFF_GLM_V52_MODEL_ID) return id
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
  // NOTE: a withdrawn model does NOT resolve here. It used to coerce silently
  // to the fallback, which kept clients running but left a user who picked it
  // watching a different model answer with no explanation. Admission now
  // REFUSES it with `model_unavailable` and a message naming the replacement
  // (see freebuffWithdrawnModelMessage). That refusal is deliberately not
  // session-ending, so the client shows the message instead of re-admitting.
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

/** True for the Muse Spark wire id. Suffix-tolerant like the other model
 *  predicates so a dated provider snapshot can't slip past the rate-limit queue
 *  that keys off it (see docs/freebuff-muse-spark.md). */
export function isMuseSparkModelId(id: string | null | undefined): boolean {
  if (!id) return false
  return freebuffModelIdMatches(id, FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID)
}

export function isFreebuffSessionPremiumModelId(
  id: string | null | undefined,
): boolean {
  return isFreebuffWebPremiumModelId(id)
}

/** Whether `model` occupies the one-per-user Freebuff Desktop premium
 *  CONCURRENCY slot. Suffix-tolerant (dated snapshots) like the other model
 *  predicates so a dated variant can't dodge the cap. Distinct from
 *  isFreebuffPremiumModelId, which gates the daily premium QUOTA: the two lists
 *  overlap but neither contains the other. */
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

/**
 * Models that may ONLY be served to the Freebuff Web service account — i.e. to
 * turns issued by the Freebuff Web / Cloud runner itself, never to a caller
 * holding an ordinary API key.
 *
 * This is the surface gate with teeth. Every other thing that keeps a model off
 * a surface is a client-side fact: a model absent from FREEBUFF_MODELS is one
 * no shipped CLI build renders, which stops our users and nobody else. A
 * hand-written caller posts whatever agent id and model id it likes, and the
 * free-mode allowlist happily confirms that `base3-free-ox-alpha` may run Ox
 * Alpha — because it may, when WE are the ones asking.
 *
 * The service account is the one claim in a free-mode request that cannot be
 * forged. `codebuff_metadata.surface` is self-reported and is ignored for
 * everyone else precisely because it is (see docs/unified-usage-tracking.md);
 * the API key that authenticates the runner is held server-side. So "Web and
 * Cloud only" is expressed as "authenticated as the runner", which is the same
 * statement made in the only terms an attacker cannot restate.
 *
 * ONLY OX ALPHA IS LISTED, deliberately. Muse Spark and Kimi K3 Eco are also
 * browser-only and would also pass this gate in normal operation, but they are
 * metered by the premium pool, so a third-party caller reaching one spends a
 * quota that runs out. Ox Alpha is metered by NOTHING and costs nothing to
 * serve, which makes it the single most attractive target in the catalog for a
 * reselling proxy — the one row where "they can only take four sessions a day"
 * is not a backstop. Add the others here too if that ever stops being the
 * distinction; the check is per-model on purpose.
 *
 * Enforced in web/src/app/api/v1/chat/completions/_post.ts, next to the
 * free-mode agent+model allowlist. That is where inference is actually spent,
 * so a caller who somehow admits a session still cannot run a single turn on it.
 */
// EMPTIED 2026-08-24, when Ox Alpha went to CLI and Desktop.
//
// This list means "served only to the Freebuff Web service account", and it was
// the one real gate keeping the model on surfaces we could withdraw it from in
// a single deploy. Shipping the row inside a CLI binary is incompatible with
// that promise, so the gate could not survive the rollout -- keeping the id
// here would 403 every CLI and Desktop turn.
//
// Understand what that costs before adding a model here again, or removing one:
// Ox Alpha is metered by NOTHING (premium: false, no pool, price fenced at $0),
// which made it the single most attractive row in the catalog for a reselling
// proxy. The remaining defences are narrower than this one was:
//
//   - the tool-schema check (docs/freebuff-abuse-detection.md), which downgrades
//     third-party clients on every model, but not a caller who has faithfully
//     reproduced our toolset
//   - FREEBUFF_PAUSED_FREE_MODEL_IDS, which is the rollback lever rather than a
//     standing gate
//
// The rollback path is now `FREEBUFF_PAUSED_FREE_MODEL_IDS`, NOT re-adding the
// id here: pausing stops admissions on every surface in one deploy, while this
// list would leave a visible picker row that 403s on send.
export const FREEBUFF_SERVICE_ONLY_MODEL_IDS = [] as const satisfies readonly string[]

/** Whether `id` may only be served to the Freebuff Web service account. Matches
 *  dated builds for the same reason the price fence does: a variant that slips
 *  past this predicate is the same model with the gate off. */
export function isFreebuffServiceOnlyModelId(
  id: string | null | undefined,
): boolean {
  return FREEBUFF_SERVICE_ONLY_MODEL_IDS.some((modelId) =>
    freebuffModelIdMatches(id, modelId),
  )
}

/** Whether `id` names Ox Alpha, including any dated build of it. Consumed by
 *  the OpenRouter lane, which attaches the zero-price fence to exactly these
 *  requests — a dated variant that slipped past this predicate would be the
 *  same model with no fence on it. */
export function isFreebuffOxAlphaModelId(
  id: string | null | undefined,
): boolean {
  return freebuffModelIdMatches(id, FREEBUFF_OX_ALPHA_MODEL_ID)
}

/** The catalog's reasoning effort for the requested model, tolerating dated
 *  snapshot suffixes like every other id helper. Null for models that carry
 *  none — see FreebuffModelOption.reasoningEffort. */
/** The catalog row for any surface's id, or undefined. Both catalogs, for the
 *  same reason getFreebuffModelReasoningEffort reads both: a Web-only model is
 *  absent from SUPPORTED_FREEBUFF_MODELS by design. */
function findFreebuffModelOption(
  id: string | null | undefined,
): FreebuffModelOption | undefined {
  return (
    SUPPORTED_FREEBUFF_MODELS.find((m) => freebuffModelIdMatches(id, m.id)) ??
    FREEBUFF_WEB_ALL_MODELS.find((m) => freebuffModelIdMatches(id, m.id))
  )
}

/** The ladder a user may pick from for this model, or null when it offers no
 *  choice — which is every model that has not opted in. */
export function getFreebuffModelEfforts(
  id: string | null | undefined,
): readonly ReasoningEffort[] | null {
  const efforts = findFreebuffModelOption(id)?.efforts
  return efforts && efforts.length > 0 ? efforts : null
}

/** Where this model's ladder starts before a user touches it. */
export function getFreebuffModelDefaultEffort(
  id: string | null | undefined,
): ReasoningEffort | null {
  const entry = findFreebuffModelOption(id)
  if (!entry?.efforts?.length) return null
  return entry.defaultEffort ?? entry.efforts[entry.efforts.length - 1]!
}

/**
 * THE authority on what effort a request runs at. Everything a client sends is
 * a request, never a command.
 *
 * Keyed on the model the request will ACTUALLY run — not the one the user
 * picked. Those differ more often than they look: a limited-tier user's premium
 * pick is coerced (resolveFreebuffSessionModelForAccessTier), the cloud build
 * path rewrites it, and a Muse Spark turn can be rerouted to Luna mid-flight.
 * Clamping against the requested model would then let one model's rung reach
 * another's API — `xhigh` landing on DeepSeek maps to `max`, the most expensive
 * rung there is, from a user who never asked for it.
 *
 * Clamp-DOWN (see clampReasoningEffort): a rung above the ceiling becomes the
 * ceiling rather than snapping back to the default, so a rerouted user keeps
 * the closest thing to what they chose. Models with no ladder return null and
 * keep whatever `reasoningEffort` already says.
 */
export function resolveFreebuffReasoningEffort(
  modelId: string | null | undefined,
  requested: unknown,
): ReasoningEffort | null {
  const efforts = getFreebuffModelEfforts(modelId)
  if (!efforts) return null
  const fallback = getFreebuffModelDefaultEffort(modelId)
  if (!fallback) return null
  // Medium was briefly offered for Flash before the 07/31 capability matrix was
  // corrected, and reaches these models from persisted Desktop/Web preferences
  // and from threads that switched model. DeepSeek maps that compatibility
  // spelling to high (medium→high in its own effort table), so honor that rather
  // than letting generic clamp-down turn a stale value into LOW while the UI
  // displays high.
  //
  // Applies to Pro as well as Flash since Pro's 08/13 ladder gained `low`:
  // before that, "everything on offer is above medium" already landed Pro's
  // medium on high, and losing that to the clamp would be a silent downgrade of
  // exactly the model users pick for deliberation.
  if (
    requested === 'medium' &&
    (freebuffModelIdMatches(modelId, FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID) ||
      freebuffModelIdMatches(modelId, FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID))
  ) {
    return 'high'
  }
  return clampReasoningEffort(requested, efforts, fallback)
}

export function getFreebuffModelReasoningEffort(
  id: string | null | undefined,
): NonNullable<FreebuffModelOption['reasoningEffort']> | null {
  // BOTH catalogs, and the Web one is not optional. This used to read
  // SUPPORTED_FREEBUFF_MODELS alone — the CLI/Desktop catalog — which silently
  // excluded every Web-only model. Muse Spark is deliberately absent from that
  // list (its absence IS the Desktop gate), so setting `reasoningEffort` on its
  // row did nothing at all and gave no hint why: the field was present, the
  // lookup simply could not see the row. Any future Web-only model would have
  // hit the same wall.
  const entry: FreebuffModelOption | undefined =
    SUPPORTED_FREEBUFF_MODELS.find((m) => freebuffModelIdMatches(id, m.id)) ??
    FREEBUFF_WEB_ALL_MODELS.find((m) => freebuffModelIdMatches(id, m.id))
  return entry?.reasoningEffort ?? null
}

/**
 * Whether a Web/Cloud selection may be REMEMBERED as the user's default model.
 *
 * GLM 5.2 is excluded. GLM is a scarce, hand-metered pick that a user runs out
 * of far sooner than the rest of the picker, so pinning it as the remembered
 * default strands them on a model they cannot start: the next new thread, a
 * different app, or a plain page reload would open on GLM and fail admission.
 * Picking GLM applies to the surface in front of you; anything that starts
 * fresh falls back to DEFAULT_FREEBUFF_WEB_MODEL_ID.
 *
 * Every localStorage read AND write of the remembered model must go through
 * this (via resolveRememberedFreebuffWebModel), so a value saved before this
 * rule existed self-heals on the next load instead of persisting forever.
 */
export function isFreebuffWebRememberableModelId(
  id: string | null | undefined,
): boolean {
  return !isFreebuffGlmV52ModelId(id)
}

/**
 * The model a surface should START on, given a remembered (localStorage)
 * selection: the saved model when it is still valid and rememberable, else
 * DEFAULT_FREEBUFF_WEB_MODEL_ID.
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

  // Keep the retired chat wire id text-only during a staggered deployment.
  // It now routes to DeepSeek direct, but has no catalog option of its own.
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
 * Why a row cannot be picked right now, in the reader's own clock — or
 * undefined when it can.
 *
 * The pickers had a label for deployment hours and nothing for anything else,
 * so a model closed for any OTHER reason looked completely normal: selectable,
 * checkmarked, and refused only at send time. That is exactly what V4 Pro's
 * peak-hour window did — correctly closed at 2am Pacific and indistinguishable
 * from open.
 *
 * LOCAL TIME is the whole point. DeepSeek publishes its peak in UTC, so the
 * window a user lives in (5pm-3am Pacific) shares no digits with the one we
 * store. "Closed 00:00-10:00 UTC" asks someone at 2am to do timezone
 * arithmetic before they can tell whether the product is broken.
 */
export function getFreebuffModelUnavailableLabel(
  id: string,
  now: Date = new Date(),
  options: LocalTimeFormatOptions = {},
): string | undefined {
  if (isFreebuffSessionModelAvailable(id, now)) return undefined
  const model =
    SUPPORTED_FREEBUFF_MODELS.find((candidate) => candidate.id === id) ??
    getFreebuffWebModel(id)
  if (model.availability === 'off_peak_only') {
    return `Back at ${formatLocalTime(
      deepSeekExpensiveWindowEndsAt(now),
      now,
      options,
    )}`
  }
  return getFreebuffDeploymentAvailabilityLabel(now, options)
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
  return isAvailableAt(model.availability, now)
}

/**
 * The ONE reading of `availability`, shared by the picker's joinability check
 * and the server's admission check.
 *
 * They were separate, and the picker's copy only knew 'always' and deployment
 * hours — so `off_peak_only` fell through to a window that has nothing to do
 * with it. That was right only by coincidence: DeepSeek's peak and our staffing
 * hours happen to overlap at some times of day and not others, so V4 Pro would
 * have shown as pickable during the expensive window whenever the two disagreed,
 * and been refused on send.
 *
 * A picker that can disagree with admission is worse than one that is simply
 * wrong, because the disagreement only surfaces after the user commits.
 */
function isAvailableAt(
  availability: FreebuffModelOption['availability'],
  now: Date,
): boolean {
  if (availability === 'always') return true
  if (availability === 'off_peak_only') return !isDeepSeekExpensiveWindow(now)
  return isFreebuffDeploymentHours(now)
}

export function isFreebuffSessionModelAvailable(
  id: string,
  now: Date = new Date(),
): boolean {
  const model =
    SUPPORTED_FREEBUFF_MODELS.find((candidate) => candidate.id === id) ??
    getFreebuffWebModel(id)
  // Same reading as the picker's joinability check, deliberately — see
  // isAvailableAt. `off_peak_only` is the ten hours DeepSeek charges double
  // (00:00-10:00 UTC), a different window from `deployment_hours`, which tracks
  // OUR staffing rather than an upstream rate card.
  return isAvailableAt(model.availability, now)
}

export function resolveAvailableFreebuffModel(
  id: string | null | undefined,
  now: Date = new Date(),
): FreebuffModelId {
  const resolved = resolveFreebuffModel(id)
  if (isFreebuffModelAvailable(resolved, now)) return resolved
  // A closed row may name where its traffic should go instead — V4 Flash sends
  // its peak hours to V4 Pro. Checked for availability itself rather than
  // trusted, so a chain of closed rows can never strand a pick; anything
  // unresolvable still lands on the unlimited fallback.
  const declared = (
    SUPPORTED_FREEBUFF_MODELS as readonly FreebuffModelOption[]
  ).find((candidate) => candidate.id === resolved)?.unavailableFallback
  if (
    declared &&
    isFreebuffModelId(declared) &&
    isFreebuffModelAvailable(declared, now)
  ) {
    return declared
  }
  return FALLBACK_FREEBUFF_MODEL_ID
}
