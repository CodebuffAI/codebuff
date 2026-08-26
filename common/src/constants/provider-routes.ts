export const PROVIDER_ROUTE_IDS = [
  'fireworks/deployment',
  'fireworks/serverless',
  'minimax/official',
  'xiaomi/official',
  'openrouter/novita/fp8',
  'mimo/openrouter',
  'infron/makora',
  'glm/crof',
  'glm/infron',
  'deepseek/openrouter',
  'deepseek/crof',
  'deepseek/cheaper-inference',
  'deepseek/luminal',
  'deepseek/fusioncode',
  'deepseek/runinfra',
  'deepseek/official',
  'luna/fallback',
  'luna/primary',
] as const

export type ProviderRouteId = (typeof PROVIDER_ROUTE_IDS)[number]

/**
 * A GPT-5.6 Luna session that diverted off its primary lane because that lane
 * was OUT OF CAPACITY, and should now enter on the fallback instead.
 *
 * Named for the ROLE, not the upstream, and deliberately so: this value is
 * persisted in `free_session.provider_route` and read back unvalidated, so an
 * id naming its provider either forces a migration or becomes a name that lies
 * the moment the fallback moves. {@link MIMO_OPENROUTER_PROVIDER_ROUTE} carries
 * the same warning for the same reason. {@link LUNA_FALLBACK_UPSTREAM} below
 * says who currently serves it.
 *
 * Why pin at all: Luna's lanes each keep their OWN prompt cache, and an agent
 * turn re-sends its whole prefix every step, so ~96.5% of its tokens are cache
 * reads. Moving a live session between providers therefore costs a full cold
 * prefill on a prefix it has already paid to warm. Pinning moves SESSIONS, not
 * requests: the session that overflowed stays on the fallback and warms there
 * once, instead of re-paying at every turn.
 */
/**
 * A Flash session GRANTED the FusionCode front lane by the admission
 * controller — the same shape as the Luminal grant, and granted only when
 * Luminal declined, since Luminal is ~45% cheaper. Like Luminal's pin this is
 * a grant, not a cohort mark: its own env switch is the drain.
 */
export const DEEPSEEK_FUSIONCODE_PROVIDER_ROUTE =
  'deepseek/fusioncode' satisfies ProviderRouteId

export const LUNA_FALLBACK_PROVIDER_ROUTE =
  'luna/fallback' satisfies ProviderRouteId

/**
 * A Luna session explicitly returned to the primary lane after the fallback
 * failed it.
 *
 * Distinct from UNPINNED, which also enters on the primary: an unpinned session
 * simply never diverted, while this one diverted and came back. Keeping them
 * apart is what lets the fallback rate be read as "sessions that overflowed"
 * rather than "sessions that overflowed and stayed overflowed".
 */
export const LUNA_PRIMARY_PROVIDER_ROUTE =
  'luna/primary' satisfies ProviderRouteId

/**
 * Who serves {@link LUNA_FALLBACK_PROVIDER_ROUTE} today. Repointing this moves
 * every session already pinned there, with no migration — which is the whole
 * reason the id above does not name a provider.
 */
export const LUNA_FALLBACK_UPSTREAM = 'cheaper-inference' as const

export const FIREWORKS_DEPLOYMENT_PROVIDER_ROUTE =
  'fireworks/deployment' satisfies ProviderRouteId
export const FIREWORKS_SERVERLESS_PROVIDER_ROUTE =
  'fireworks/serverless' satisfies ProviderRouteId
export const MINIMAX_OFFICIAL_PROVIDER_ROUTE =
  'minimax/official' satisfies ProviderRouteId
/**
 * MiMo 2.5's OpenRouter lane — the ENTRY lane since 2026-08-23, when Xiaomi's
 * direct rate limit made it untenable as the primary (see mimo-router.ts for
 * the measured 429 rate that settled it).
 *
 * THE PIN IS NOW INERT, exactly as {@link GLM_CROF_PROVIDER_ROUTE} became when
 * its lane was promoted: it names the lane a session would enter anyway. It is
 * still recognized on READ, and must stay so, because ~48k sessions a day were
 * pinned here under the old order and their pins outlive the deploy. Reading it
 * as "start at the primary" is exactly right for them — they are already warm
 * on this lane, so they carry on with no cold prefill.
 *
 * Like {@link DEEPSEEK_INFRON_MAKORA_PROVIDER_ROUTE} it says *which lane*, NOT
 * which upstream serves it — that is {@link MIMO_OPENROUTER_UPSTREAM_ORDER}
 * below, so repointing the upstream moves every session here with no migration.
 *
 * Named generically on purpose. Its predecessor
 * {@link MIMO_NOVITA_PROVIDER_ROUTE} baked the upstream into a value that gets
 * persisted in `free_session.provider_route` and read back unvalidated, so
 * changing upstreams meant either a migration or a name that lies.
 */
export const MIMO_OPENROUTER_PROVIDER_ROUTE =
  'mimo/openrouter' satisfies ProviderRouteId
/**
 * Marks a MiMo session as diverted OFF the OpenRouter lane onto Xiaomi's direct
 * API — the backup since the 2026-08-23 swap, and the direction this pin has
 * pointed only since then.
 *
 * It exists for the reason {@link GLM_CROF_PROVIDER_ROUTE} does: depth bought
 * not with money but with a SECOND ACCOUNT AND A SECOND BALANCE. Both MiMo
 * lanes ran dry inside 14 hours (Xiaomi 2026-08-22 17:30Z, OpenRouter
 * 2026-08-23 07:35Z), which is the whole argument for keeping two funded
 * accounts and a 402 that can cross between them.
 *
 * Reuses the long-declared but never-written `xiaomi/official` id, so no
 * `PROVIDER_ROUTE_IDS` entry had to be added.
 */
export const MIMO_XIAOMI_PROVIDER_ROUTE =
  'xiaomi/official' satisfies ProviderRouteId
/**
 * The upstreams that serve {@link MIMO_OPENROUTER_PROVIDER_ROUTE}, preferred
 * first: Xiaomi's OWN endpoint, reached through OpenRouter's account rather
 * than our direct API key, with Novita behind it purely as depth.
 *
 * It lives next to the route id because the two are meant to be read together —
 * the id says which lane a session is pinned to, this says who serves it — and
 * in `common/` rather than in mimo-router.ts so `scripts/mimo-smoke.ts` can
 * assert against the REAL value without importing the billing chain. A smoke
 * test that restates this config would keep passing after the upstream moved,
 * reporting a lane it no longer covers.
 *
 * Novita served the lane until 2026-08-01, which was most of what made the
 * fallback expensive. Measured over 6h of prod that day, attributing rows by
 * whether their cost reproduces our Xiaomi formula:
 *
 *   openrouter/novita   18,268 reqs (42.6%)  19.2% cache  $364.11  $0.138/M in
 *   xiaomi direct       24,631 reqs (57.4%)  90.5% cache   $63.76  $0.018/M in
 *
 * Novita is also 20% dearer per token before caching ($0.168/$0.336 against
 * Xiaomi's $0.14/$0.28) and prices cache reads at $0.0034/M against $0.0028/M.
 * Xiaomi's OpenRouter endpoint is priced identically to our direct rate, so the
 * lane costs the same as the primary and differs only in whose rate limit and
 * prompt cache it draws on — which is, since 2026-08-23, the entire reason this
 * lane is the ENTRY rather than the backup.
 */
export const MIMO_OPENROUTER_UPSTREAM_ORDER = [
  'xiaomi/fp8',
  'novita/fp8',
] as const

/**
 * Fresh OpenRouter `provider` block for the MiMo lane.
 *
 * TWO ENTRIES DELIBERATELY, and it must never go back to one. A pinned session
 * has no health check and no un-pin path — `routeWithStickyFallback` short
 * -circuits straight to the fallback — so if the lane's only upstream is down,
 * one transient Xiaomi blip wedges every remaining request in that session
 * rather than degrading a single one. That is not hypothetical: a one-deep pin
 * on DeepSeek's Infron lane took out 1,160 requests across 191 users for ~32h
 * when `makora` went offline (2026-07-26/27, fixed in #1045).
 *
 * Verified live on this lane 2026-08-01: within an `allow_fallbacks:false`
 * order list, an unroutable first entry is SKIPPED rather than failing the
 * request — `order:['nosuchprovider','xiaomi/fp8']` returned 200 from Xiaomi —
 * while `order:['xiaomi/fp8','novita/fp8']` still serves from Xiaomi when it is
 * healthy. So the depth costs nothing in the normal case and is the difference
 * between a degraded session and a wedged one in the bad case. Novita is second
 * because it is the best-understood host for this model: it served ~43% of MiMo
 * traffic through late July, so its compatibility with our request shape is
 * proven, and it only ever serves when Xiaomi cannot.
 *
 * Returns a NEW object with a NEW array every call. These arrays get aliased
 * into an outgoing request body, and this file's peer
 * `INFRON_PROVIDER_ORDER` was made copy-on-assignment in #1045 for exactly that
 * reason — one downstream mutation would corrupt routing process-wide.
 */
export function mimoOpenRouterProvider(): Record<string, unknown> {
  return {
    order: [...MIMO_OPENROUTER_UPSTREAM_ORDER],
    allow_fallbacks: false,
  }
}
/**
 * LEGACY MiMo fallback pin, written while the OpenRouter lane was hardcoded to
 * Novita FP8. Still recognized on READ so sessions pinned before
 * {@link MIMO_OPENROUTER_PROVIDER_ROUTE} shipped keep serving from that lane
 * instead of silently reverting to a Xiaomi-direct attempt they already failed.
 * Never written anymore; expires with its session. Inert since the 2026-08-23
 * swap for the same reason its successor is — see there.
 */
export const MIMO_NOVITA_PROVIDER_ROUTE =
  'openrouter/novita/fp8' satisfies ProviderRouteId
/**
 * GLM 5.2's CrofAI lane. Was the backup for one day (the 2026-08-20 Infron
 * cutover); the ENTRY lane again since 2026-08-21, when production measurement
 * showed Infron costs 2x — see GLM_INFRON_PROVIDER_ROUTE for the numbers.
 *
 * Still recognized on READ so the handful of sessions pinned here during that
 * day keep working. The pin is now inert: it names the lane they would enter
 * anyway.
 *
 * GLM 5.2 entered the day served by CrofAI alone. It now runs a two-lane sticky
 * cascade — Infron's Alibaba group first, CrofAI behind it — so this id exists
 * for the same reason {@link MIMO_OPENROUTER_PROVIDER_ROUTE} does: to record
 * that a session left the entry lane and must not be sent back, because each
 * upstream keeps its own prompt cache and flapping between them re-pays a cold
 * prefill every turn.
 *
 * NOTE THE DIRECTION OF THE MONEY, because it is the reverse of every other
 * cascade in this file: CrofAI — the BACKUP — is cheaper on all three terms,
 * by 1.83x on input and output and 2.75x on cache reads. So this lane is not
 * depth bought with money, it is depth bought with a SECOND ACCOUNT AND A
 * SECOND BALANCE — the property {@link DEEPSEEK_RUNINFRA_PROVIDER_ROUTE} exists
 * for, and the one CrofAI's own 401 "Not Enough Credits" proved GLM needed. The
 * order was set by request; the measured table behind those ratios is in
 * web/src/llm-api/glm-router.ts.
 *
 * Like its peers the id names the LANE, not the upstream — that is
 * INFRON_PROVIDER_ORDER, keyed by model — so repointing which Alibaba region
 * serves the entry lane needs no migration, while renaming this value would:
 * it is persisted in `free_session.provider_route` and read back unvalidated.
 */
export const GLM_CROF_PROVIDER_ROUTE = 'glm/crof' satisfies ProviderRouteId
/**
 * GLM 5.2's Infron lane — the BACKUP again as of 2026-08-21, after one hour of
 * head-to-head production traffic settled the question the cutover opened.
 *
 * Both lanes served comparable work in the same window (147k vs 143k average
 * input tokens, 95 vs 89 distinct users):
 *
 *              msgs   cache    $/msg      $/M input   median $/prompt
 *   Infron     2,014  94.6%    0.024241   0.1640      0.1265
 *   CrofAI     1,203  89.0%    0.012063   0.0842      0.0615
 *
 * Infron really does cache BETTER — 94.6% against 89.0% — and is still 2.0x
 * dearer per message and 2.06x per user prompt, because its cache reads cost
 * 2.75x. The measurement matches the rate card to within a percent, so this is
 * price, not noise.
 *
 * IT CANNOT BE FIXED BY WARMING. Solving h*0.1375 + (1-h)*0.55 = 0.0842 for
 * Infron's break-even hit rate gives h = 1.129 — above 100%. At a perfect cache
 * Infron would still cost $0.1375/M against CrofAI's measured $0.0842. The
 * order can only flip if CrofAI falls below ~65% cache while Infron holds
 * ~100%, so do not re-litigate this on a single bad CrofAI hour.
 *
 * What Infron is still here for is what it was always actually buying: a second
 * account and a second prepaid balance behind a model whose entitlement is
 * earned. CrofAI answers 401 "Not Enough Credits" when its balance runs dry,
 * and that used to be a total outage.
 */
export const GLM_INFRON_PROVIDER_ROUTE = 'glm/infron' satisfies ProviderRouteId
/**
 * DeepSeek V4 Flash's CrofAI lane — and, since the 2026-08-15 cutover, the
 * COHORT MARK that says a session belongs on it.
 *
 * This id now carries two meanings that deliberately coincide. Written at
 * ADMISSION it means "this session was admitted after the cutover, so it enters
 * the cascade on CrofAI". Written by the CASCADE it means "this session
 * diverted onto CrofAI". Both want the same thing — enter on CrofAI — which is
 * why pins written by the pre-cutover code needed no migration when the
 * cutover shipped, and why nothing has to distinguish them on read.
 *
 * A session with NO pin is, by construction, one admitted before the cutover
 * shipped: it runs the pre-cutover order and keeps the prompt cache it has
 * already paid to warm. See `deepseekEntryLane` and
 * docs/freebuff-deepseek-provider-cutover.md.
 *
 * Reference prices per M — CrofAI/Infron/OpenRouter from live billing
 * 2026-08-04, RunInfra from runinfra.ai/pricing and Infron re-read from its
 * catalog on 2026-08-16, DeepSeek from its published card after the 16:00 UTC
 * 2026-08-16 repricing:
 *
 *                        input    cache read   output
 *   CrofAI 0731         0.1200     0.0030     0.2100
 *   RunInfra 0731       0.1300     0.0100     0.2700
 *   Infron alibaba      0.2120     0.0210     0.6360
 *   DeepSeek off-peak   0.2200     0.0070     0.6600
 *   DeepSeek peak       0.4400     0.0140     1.3200
 *   (retired) OpenRouter 0.0881    0.0176     0.1761
 *
 * A coding turn re-sends its whole prefix every step, so cache reads are most
 * of the tokens and that is the term that decides the bill. Infron's own
 * 2026-08-16 repricing (from 0.0690/0.0144/0.1375) turned it from the cheapest
 * lane into the dearest, which is what put {@link
 * DEEPSEEK_RUNINFRA_PROVIDER_ROUTE} ahead of it.
 *
 * The DeepSeek repricing also made CrofAI the cheapest lane outright rather
 * than a near-tie: it is now cheaper than DeepSeek direct on every term, by
 * 2.3x on cache reads off-peak and 4.7x at peak. The lane ORDER has not been
 * revisited to match — see docs/freebuff-deepseek-provider-cutover.md.
 *
 * It also serves `deepseek-v4-flash-0731` — the GA build, the same one
 * DeepSeek's own API serves — where Infron's undated slug is a frozen preview
 * snapshot. So this lane matches the DeepSeek-direct lane behind it in
 * behaviour as well as price.
 */
export const DEEPSEEK_CROF_PROVIDER_ROUTE =
  'deepseek/crof' satisfies ProviderRouteId
/**
 * DeepSeek's own API — the lane a cutover session diverts to, and the lane
 * every PRE-cutover session still enters on.
 *
 * It was the unpinned default until 2026-08-15, which is why it had no route id
 * before: a lane nothing ever moves to needs no name. Now that a cutover
 * session can divert here, it has to be able to say so, and to stay — its
 * prompt cache is warm on this upstream, and sending the next turn back to a
 * CrofAI that just failed would pay a cold prefill to reach a lane we already
 * know is unhealthy. The pin skips CrofAI as an ENTRY point only: it stays in
 * the order behind this lane, because by the next turn the blip has usually
 * cleared and CrofAI is still far cheaper than the lanes below.
 *
 * Behind CrofAI for cutover sessions because DeepSeek is the side that
 * repriced — as of 16:00 UTC 2026-08-16 its cache reads are $0.0070/M off-peak
 * and $0.0140/M at peak against CrofAI's $0.0030, so what used to be a
 * marginal loss on that term is now a 2.3-4.7x one — and because of the
 * failure record that made this a cascade at all: on 2026-08-03/04 it shed peak
 * load with 3,934 x 503 "Service is too busy" and diverted 4,997 sessions at
 * once, and on 2026-08-11 it accepted 650 requests in six hours and then sent
 * nothing, tripping the four-minute first-token watchdog. Note that the
 * watchdog is DeepSeek-direct-only (see `handleDeepSeekStream`); no equivalent
 * guards the CrofAI lane now serving in front of it.
 */
/**
 * DeepSeek V4 Flash's Luminal lane — a small FREE grant, and the only pin in
 * this file that is RATIONED rather than reactive.
 *
 * Every other route id here records where a session ENDED UP after something
 * failed. This one records that a session WON a slot: Luminal donated a slice
 * of Flash capacity far below our volume, so the pin is minted by an admission
 * controller (web/src/server/free-session/luminal-admission.ts) that hands out
 * a bounded number of them and stops when Luminal starts refusing.
 *
 * It is FIRST in the cascade for the sessions that carry it, which no other
 * cheap-lane experiment has earned, because it is free and the lanes behind it
 * are not: CrofAI's cache reads are $0.0030/M, DeepSeek direct's are
 * $0.0070-0.0140/M, and this is $0. The OpenRouter retirement on {@link
 * DEEPSEEK_CROF_PROVIDER_ROUTE} is the cautionary tale for adding a lane for
 * depth; this is the opposite — a lane added for price, capped so it cannot
 * become depth.
 *
 * Measured against the endpoint on 2026-08-20, which is what made this
 * routable at all:
 *
 *   - It SHEDS rather than queues: HTTP 429 in 87-98ms with `retry-after: 1`
 *     and a structured `rate_limit_error` body. A refused session costs one
 *     fast round trip and diverts.
 *   - REQUEST-bound, not token-bound. 32k prompts shed at ~175-224k tok/s
 *     while 128k prompts sustained 498k tok/s untouched, so the served budget
 *     (~5-7 req/s) does not shrink as prompts grow.
 *   - Prefix caching holds at 99.4-99.9% across concurrency, against
 *     production Flash's 98.8% — which is why admission is per SESSION. A
 *     request-level share would make every request a cold prefill and consume
 *     the grant on prefill alone.
 *
 * A 429 here is TERMINAL for the session, unlike a divert off any other lane:
 * the cascade re-pins it onward and it never comes back. That is deliberate.
 * The lanes behind this one are sized to take our whole volume, so there is
 * nothing to gain by retrying a rationed lane and one wasted round trip per
 * turn to lose.
 */
export const DEEPSEEK_LUMINAL_PROVIDER_ROUTE =
  'deepseek/luminal' satisfies ProviderRouteId
export const DEEPSEEK_OFFICIAL_PROVIDER_ROUTE =
  'deepseek/official' satisfies ProviderRouteId
/**
 * DeepSeek V4 Pro's entry lane as of 2026-08-21: the Cheaper Inference gateway.
 *
 * It replaces CrofAI at the front of Pro's cascade AND removes it from the
 * cascade entirely — CrofAI's Pro lane was the dated `deepseek-v4-pro-0813`
 * slug, stood down the same day as too dear and too inconsistent. So Pro's two
 * lanes are now this and DeepSeek direct.
 *
 * Cheaper on every term than the direct lane behind it ($0.3045/$0.002538/$0.609
 * per M against $0.66/$0.022/$1.98 off-peak) and, unlike direct, FLAT — no peak
 * card. That last point is most of the value: direct doubles for ten hours a
 * day and those windows carry 26% of tokens against 46% of spend.
 *
 * The cache question this file's other entries keep raising was measured here
 * rather than assumed, and the first answer was wrong. A 13-sample probe showed
 * ~70% and read as disqualifying; at scale, warm, it is 100% over 60 sequential
 * and 95% over 40 concurrent, holding on both upstreams this gateway routes
 * between. Cold-start misses, not routing instability. Compare lanes at their
 * MEASURED WARM hit rate — the rule that has now been arrived at three times in
 * this file.
 */
export const DEEPSEEK_CHEAPER_INFERENCE_PROVIDER_ROUTE =
  'deepseek/cheaper-inference' satisfies ProviderRouteId
/**
 * DeepSeek V4 Flash's LAST resort: the Infron lane, now tier 4 of four.
 *
 * DEMOTED FROM TIER 3 ON 2026-08-16. It was the cheapest route we had —
 * measured live 2026-08-04 on a 45,008-token prompt at $0.069/M input and
 * ~$0.0144/M cache read — and Infron then repriced its Alibaba Cloud Int.
 * group to $0.212/M input, $0.021/M cache read and $0.636/M output. That is
 * 3.1x, 1.4x and 4.6x, and it turns the cheapest lane into the dearest one.
 *
 * {@link DEEPSEEK_RUNINFRA_PROVIDER_ROUTE} is cheaper on input, cache reads and
 * output alike, and a measured agent turn confirms the list prices rather than
 * contradicting them: costed on one real 29-call buffbench turn, RunInfra came
 * to $0.0444 against this lane's $0.0820 — 1.85x. So Infron ahead of RunInfra
 * is wrong on both paper and practice.
 *
 * So it sits behind {@link DEEPSEEK_CROF_PROVIDER_ROUTE}, {@link
 * DEEPSEEK_OFFICIAL_PROVIDER_ROUTE} and {@link
 * DEEPSEEK_RUNINFRA_PROVIDER_ROUTE}, and it must never be the lane a session
 * settles on. Its own failure mode is why nothing cheap may sit below it: a
 * single aggregator account behind one Alibaba provider group, which when
 * 4,997 sessions diverted onto it in one window returned 13,286 saturation
 * 429s and then ran out of credits entirely, leaking the raw billing error to
 * 1,086 users. This only works because the cascade RE-PINS on each hop — a
 * session that finds Infron saturated does not pay a doomed Infron attempt on
 * every later turn.
 *
 * The `makora` in the name is historical (that upstream went offline in
 * 2026-07). The id says only *that* a session is on this lane, never which
 * upstream serves it — that is INFRON_PROVIDER_ORDER, keyed by model — so
 * repointing the upstream also moves sessions already pinned here. Renaming the
 * value itself would need a migration; it is persisted in
 * `free_session.provider_route` and read back unvalidated.
 */
export const DEEPSEEK_INFRON_MAKORA_PROVIDER_ROUTE =
  'infron/makora' satisfies ProviderRouteId
/**
 * DeepSeek V4 Flash's SECOND backup: the RunInfra lane, tier 3 of four.
 *
 * Added because the three lanes ahead of it have each failed in the one way a
 * cascade cannot absorb — by running out of money. DeepSeek shed peak load,
 * Infron's aggregator account went dry and leaked its billing error to 1,086
 * users, and CrofAI returned 401 "Not Enough Credits" off its own prepaid
 * balance. Three lanes whose failures are that correlated with a divert storm
 * are, on the worst day, one lane. RunInfra is a fourth independent account
 * and balance behind them; that independence, not its price, is the reason it
 * exists.
 *
 * List prices are on {@link DEEPSEEK_CROF_PROVIDER_ROUTE}. It is dearer than
 * CrofAI on all three terms, so it can never sit above it; it sits above Infron
 * because Infron repriced on 2026-08-16 into the dearest lane we have.
 *
 * VALIDATED ON A REAL AGENT TURN rather than a price table, which is unusual
 * for this file and worth the words. One buffbench task was run end to end
 * through this lane against a local server: 29 model calls, 1,202,712 input
 * tokens (82.3% cached), 25,287 output tokens. Costing that exact token
 * profile against each lane's card:
 *
 *   CrofAI            $0.0338
 *   RunInfra          $0.0444
 *   DeepSeek off-peak $0.0705
 *   Infron            $0.0820
 *   DeepSeek peak     $0.1409
 *
 * So RunInfra ahead of Infron is right by 1.85x on measured traffic, which is
 * what this lane's placement rests on. Note the DeepSeek rows sit BELOW
 * RunInfra on this workload since the 2026-08-16 repricing — that is a question
 * about the entry lane, not about this one, and it belongs to
 * docs/freebuff-deepseek-provider-cutover.md rather than here.
 *
 * The cache has a COLD START. Over that turn it served 82.3% of input tokens
 * from cache, but the aggregate hides the shape: the first few calls missed
 * outright despite sharing a large prefix, then it held at 98-99% for the
 * remaining ~25 calls. A synthetic probe showed the same thing (three misses,
 * then 99.1% hits), with ~600ms latency on a hit against ~1,500ms on a miss.
 * `prompt_cache_key` did not pin routing. The practical consequence is that a
 * long session gets the list rate and a very short one pays closer to fresh
 * input — acceptable for a lane only sustained failure reaches.
 *
 * Two further constraints, both measured rather than published: its hard output
 * ceiling is 32,768 tokens (see RUNINFRA_DEEPSEEK_V4_FLASH_MAX_TOKENS — below
 * the 48,000 budget the product considers safe, so expect more empty
 * length-capped answers here), and it returns no `cost`, so its price table
 * bills every request rather than catching a rare gap.
 *
 * What makes it a better tier-3 than the OpenRouter lane it replaced in the
 * cascade: that lane priced cache reads at $0.0176/M and was reached 1,205
 * times in 24h, which is how DeepSeek's daily bill went from $9k to $39.7k.
 * RunInfra is 1.76x under it on exactly that term. Depth still costs something
 * — 3.3x CrofAI's cache read — which is why it leaves NO RESUMABLE PIN (see
 * `asDeepSeekLane`): a session that touches it starts its next turn from the
 * primary again rather than settling here for the rest of its hour.
 *
 * Like its peers the id names the LANE, not the upstream, and it is persisted
 * in `free_session.provider_route` and read back unvalidated — so renaming the
 * value would need a migration, while repointing what serves it would not.
 */
export const DEEPSEEK_RUNINFRA_PROVIDER_ROUTE =
  'deepseek/runinfra' satisfies ProviderRouteId
/**
 * RETIRED as a DeepSeek lane on 2026-08-11. Kept as a recognized id because it
 * is persisted in `free_session.provider_route` and read back unvalidated —
 * sessions still carrying the pin must not crash; they simply start from the
 * primary again, which is the right answer for a lane that no longer exists.
 *
 * Why it went: it prices cache reads at $0.0176/M against CrofAI's $0.0030,
 * and an agent turn re-sends its whole prefix every step, so ~98% of the
 * tokens land on exactly that term. Being "last resort" did not bound the
 * damage — the pin only moved forward, so one transient 429 on the lane above
 * parked a session here for the rest of its hour. It was reached 1,205 times
 * in 24h, more often than the lane ahead of it, and DeepSeek's daily bill went
 * from $9k to $39.7k over four days while volume rose only 41%. Depth that
 * costs 5.9x on the dominant token class is not depth.
 *
 * The replacement for that depth is retries: the two cheap lanes are attempted
 * three times each before anything diverts.
 *
 * (Historical, for the MiMo lane which still uses OpenRouter:)
 * DeepSeek V4 Flash's LAST resort: the OpenRouter lane, tier 4 of four.
 *
 * Reached when DeepSeek direct and then {@link
 * DEEPSEEK_INFRON_MAKORA_PROVIDER_ROUTE} have both failed retryably. Dearer per
 * token than Infron but backed by many independent upstreams and a balance that
 * is not one account's, which is exactly what a divert storm needs — see the
 * Infron route's doc for why the cheap lane cannot be the last one.
 *
 * Like its MiMo peer it names the LANE, not the upstream — that is {@link
 * DEEPSEEK_OPENROUTER_UPSTREAM_ORDER} below, so repointing the order also moves
 * every session already pinned here, with no migration.
 */
export const DEEPSEEK_OPENROUTER_PROVIDER_ROUTE =
  'deepseek/openrouter' satisfies ProviderRouteId
/**
 * The upstreams that serve {@link DEEPSEEK_OPENROUTER_PROVIDER_ROUTE},
 * preferred first.
 *
 * Chosen as *cheapest that still preserves the prompt cache*, which for an
 * agent workload are not the same axis. Cache-read price is what actually
 * drives this bill — a coding turn re-sends a long prefix every step, so most
 * input tokens are cache reads — and the OpenRouter catalog splits cleanly on
 * it (checked live 2026-08-04, per M):
 *
 *   streamlake/fp8   $0.0881 in  $0.0176 cache  $0.1761 out  fp8   384k max out
 *   baidu/fp8        $0.0882 in  $0.0176 cache  $0.1764 out  fp8   131k max out
 *   gmicloud/fp8     $0.0938 in  $0.0188 cache  $0.1876 out  fp8   no stated cap
 *   ── everything below is >=1.5x the cache-read price ──
 *   most of the tail  $0.14   in  $0.0280 cache  $0.2800 out
 *   parasail/coreweave/phala     $0.0700 cache  (4x)
 *   morph, mancer/fp4            NO cache read at all
 *
 * So the three cheapest on input are also the three cheapest on cache read;
 * there is no tradeoff to make here, which is why the list is short.
 *
 * DELIBERATELY NOT `deepseek` (OpenRouter's DeepSeek-first-party endpoint).
 * It had by far the best cache read of any entry here, and was tempting for
 * that alone, but it is the same upstream whose failure triggers this fallback,
 * reached through a middleman — pointing the lane there would divert an outage
 * onto itself. The Infron lane can use the 0731 model without this problem
 * because it pins independent Alibaba upstreams. (The price argument has since
 * evaporated anyway: DeepSeek's 2026-08-16 repricing put first-party cache
 * reads at $0.0070/M off-peak and $0.0140/M at peak, at or above the tail
 * quoted above. The routing reason is the one that still stands.)
 *
 * `deepinfra/fp4` is skipped despite sitting third on price: fp4 quantization,
 * and a 65,536-token output cap that would truncate long agent turns. fp8 is
 * the floor for this lane.
 *
 * THREE ENTRIES, and it must never go to one — see the identical warning on
 * {@link mimoOpenRouterProvider}. A pinned session has no health check and no
 * un-pin path, so a one-deep lane turns a single upstream blip into a wedged
 * session. That is not hypothetical here: this model's previous fallback was
 * pinned one-deep to `makora` and took out 1,160 requests across 191 users for
 * ~32h when it went offline (2026-07-26/27, #1045).
 *
 * Caveat on the third entry: `gmicloud/fp8` does not list `stop` in its
 * supported parameters. Without `require_parameters` OpenRouter drops the
 * unsupported field rather than refusing to route, so a turn served there does
 * not honor the global stop sequence. Accepted for depth — it only serves when
 * both fp8 upstreams above it are unavailable — but do not promote it.
 */
export const DEEPSEEK_OPENROUTER_UPSTREAM_ORDER = [
  'streamlake/fp8',
  'baidu/fp8',
  'gmicloud/fp8',
] as const

/**
 * The OpenRouter output cap this lane requests.
 *
 * Matches `streamlake/fp8`'s 384,000-token ceiling — the first upstream in the
 * order — so a caller's explicit budget can never make the preferred endpoint
 * ineligible. Slightly under DeepSeek direct's 393,216, same as the Infron lane
 * this replaces: keep fallback requests inside the contract of the route that
 * will actually serve them.
 */
export const DEEPSEEK_OPENROUTER_MAX_TOKENS = 384_000

/**
 * Fresh OpenRouter `provider` block for the DeepSeek V4 Flash lane.
 *
 * Returns a NEW object with a NEW array every call — these arrays get aliased
 * into an outgoing request body, and one downstream mutation would corrupt
 * routing process-wide (the bug `INFRON_PROVIDER_ORDER` was made
 * copy-on-assignment for in #1045).
 *
 * `allow_fallbacks: false` is what preserves the prompt cache: it holds the
 * session to this order instead of letting OpenRouter spread turns across
 * twenty endpoints that each keep their own cache. Cache fragmentation is the
 * expensive failure mode, not a slightly dearer per-token rate — measured on
 * the MiMo lane, a scattered fallback averaged 27.6k cache_read against ~150k
 * prompts, paying a full cold prefill per divert.
 */
export function deepseekOpenRouterProvider(): Record<string, unknown> {
  return {
    order: [...DEEPSEEK_OPENROUTER_UPSTREAM_ORDER],
    allow_fallbacks: false,
  }
}
