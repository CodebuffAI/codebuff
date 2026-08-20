# Self-serve ad network

A plan for owning the demand side of Freebuff's own ad slots: an advertiser
signs up, writes a text ad, picks who sees it, pays, and it appears in the CLI,
Desktop, Web, and Chat surfaces — with no salesperson and no third-party
network in the path.

**Scope decided up front:** first-party inventory only, but the ad-request API
is shaped as if it were external from day one so opening it to other AI apps
later is configuration rather than a rewrite. Gravity, Carbon, and ZeroClick
stay in the stack as *backfill below our own demand*, so fill rate and user
credit payouts never depend on direct demand ramping fast enough.

---

## 1. Where we are today

### We are a publisher, not a network

`cli/src/hooks/use-gravity-ad.ts` requests ads from an upstream network and
renders whatever comes back:

```ts
export type AdProvider = 'gravity' | 'carbon' | 'zeroclick'
export type AdSurface = 'waiting_room' | 'cli_chat'
```

The server normalizes all three onto one shape — `AdResponse` (`adText`,
`title`, `cta`, `url`, `favicon`, `clickUrl`, `impUrl`) — so the client is
already provider-agnostic. That normalization boundary is the single most
valuable thing we have: **a first-party network is one more `AdProvider` value
behind the same contract**, and no client needs to change to introduce it.

Supporting pieces that already work and should be reused as-is:

| Piece | File | What it gives us |
| --- | --- | --- |
| Slot positioning | `common/src/util/response-ad-positions.ts` | Where ads land inside a streamed response (`RESPONSE_AD_FIRST_NODE_COUNT`, `RESPONSE_AD_NODE_STEP`) |
| Lazy pool | `common/src/util/lazy-response-ads.ts` | Bounded per-response pool (`MAX_RESPONSE_AD_POOL_SIZE = 4`), dedupe by `impUrl`, no retry loops on no-fill |
| Rendering | `cli/src/components/ad-banner.tsx` | `AdCard` in `card` and `inline` variants, width-aware truncation, `Ad` disclosure |
| Bot-signal hygiene | `common/src/util/ad-user-agent.ts` | One rule for the UA presented to a provider on both auction and pixel |
| Payout hook | `common/src/types/grant.ts` | `GrantType = 'ad'` — impression revenue already flows back to users as credits |
| Telemetry | `common/src/constants/analytics-events.ts` | `ADS_FETCH_COMPLETED`, `ADS_IMPRESSION_RECORDED`, `ADS_CLICKED`, per-surface shown/clicked events |

### We already run a self-serve advertiser product

`common/src/constants/freebuff-ads.ts` is a complete self-serve marketplace —
for *social engagement boosting*, not for our own slots. It already has:

- Advertiser accounts gated behind manual approval
- A campaign lifecycle (`draft → pending_review → paused → active → ended`)
- Whole-dollar daily budgets on a `$5` ladder, normalized server-side because
  "the API is public and a hand-rolled request must not be able to buy
  $10.37/day"
- Stripe subscription billing behind a checked-in `AD_PRICING_ENABLED` flag
- An admin review queue behind `AD_CAMPAIGN_REVIEW_ENABLED`
- Per-campaign and per-advertiser limits, content length caps, showcase copy

**Roughly 60% of the advertiser-facing work is already built.** The new network
should extend this schema — same advertiser account, same billing customer,
same review queue, a second campaign *type* — not stand up a parallel one. An
advertiser boosting a launch post and an advertiser buying inline text ads is
the same company, and they should see one dashboard and one invoice.

### What is actually missing

1. An **ad server**: something that takes a request for a placement and decides
   which of our campaigns to return.
2. A **creative and targeting model** for text ads (the boost marketplace's unit
   is a social post URL, which is not a creative).
3. **Mediation**: choosing between our demand and the backfill networks on a
   per-request basis, with a floor price.
4. **Measurement an advertiser will pay for**: impressions, clicks, and
   conversions attributed back to a campaign.
5. **Invalid-traffic defense** on inventory that has no browser and no
   viewport.

---

## 2. Components

### 2.1 Inventory and placement registry

Today `AdSurface` is two hardcoded strings mapped server-side to provider
placement ids. A network needs inventory as *data*, because advertisers target
it and we report on it.

A **placement** is the addressable unit: `(product, surface, format)`.

| Product | Surface | Format | Notes |
| --- | --- | --- | --- |
| CLI | `waiting_room` (landing screen) | `card`, up to 4 across | High attention, low volume — one shot per session start |
| CLI | `cli_chat` (inline in response) | `inline`, 4-line card | The volume driver; pool of 4 repeated across slots |
| CLI | above-input rotating slot | `card`, full width | Rotates every 60s while active |
| Desktop | thread inline + slot | mirrors CLI | Separate analytics namespace already exists |
| Web / Chat / Cloud | TBD | — | Each needs its own format spec before it can be sold |

Build:

- `ad_placement` table: stable id, product, surface, format, dimensions,
  eligibility rules, whether it accepts first-party demand, floor price.
- Placements are **seeded from checked-in constants**, following the existing
  convention — a placement's floor price is a pricing decision and should be
  visible in a diff, not editable in a dashboard where nobody can see it changed.
- An **inventory forecaster**: eligible-impressions-per-day per targeting
  segment. Without this the campaign builder cannot answer "what will $50/day
  actually get me", which is the one question every self-serve ad product gets
  wrong, per our own note in `freebuff-ads.ts`.

### 2.2 Advertiser console

Extends the existing advertiser account. Screens:

**Onboarding** — reuse the existing approved-advertiser gate. Company, website,
billing. The website URL should go through `normalizeUrlInput` for the same
reason it already does elsewhere: a missing scheme is forgivable, a wrong one
must not become invisible.

**Campaign builder** — the core new surface:

1. *Objective*: traffic (clicks) or awareness (impressions). Objective picks the
   default optimization, nothing else.
2. *Creative*: `title`, `adText`, `cta`, destination `url`, favicon. See §2.3.
3. *Targeting*: see §2.6.
4. *Budget & schedule*: daily rate on the existing `$5` ladder, start/end date,
   with `resolveCampaignEndDate`-style clamping.
5. *Forecast*: live estimated daily impressions and reach for the current
   targeting, from §2.1's forecaster. Recomputed as they narrow targeting — this
   is what makes narrow targeting feel like a tradeoff rather than a free win.
6. *Review & launch*.

**Creative preview** — non-negotiable, and specific to us. Our ads render into a
terminal at arbitrary width, and `getInlineAdLayout` silently truncates:

```ts
const MIN_INLINE_WIDTH_WITH_DESTINATION = 48
const maxLabelWidth = Math.max(0, Math.min(24, Math.floor(contentWidth / 3)))
```

An advertiser writing a 90-character `adText` in a wide browser field will ship
an ad that reads `Ship faster with…` on an 80-column terminal, and will blame us
for it. The builder must preview at **60, 80, 100, and 120 columns** and show
the character budget for the narrowest supported width. Enforce
`AD_MAX_*_CHARS`-style caps derived from the actual layout function, not
guessed.

**Dashboard** — spend, impressions, clicks, CTR, eCPC, by campaign / creative /
placement / day. Plus a delivery-health line explaining *why* a campaign
underdelivered (budget exhausted / targeting too narrow / no inventory /
paused / rejected). Underdelivery with no explanation is the number-one
self-serve support ticket.

**Billing** — invoices, payment method, spend caps, receipts. Reuses the Stripe
customer from the boost marketplace.

### 2.3 Creative model and policy

The format is unusually constrained, which is a feature: text-only means no
image review, no malvertising via creative, no ad-tech JS, and no latency from
asset serving.

- **Fields**: `title` (short, bolded), `adText` (1–2 lines), `cta` (button
  text), `url` (destination), `favicon`. Exactly `AdResponse`, so the ad server
  emits the shape the clients already render.
- **Constraints**: length caps per width tier; no ALL CAPS; no unicode
  look-alikes or box-drawing characters (they break terminal layout and are a
  classic disguise vector); no `\x1b[` escape sequences — **critical**, since an
  unescaped ANSI sequence in `adText` can rewrite the user's terminal. This is
  a security control, not a style rule, and must be enforced server-side on
  ingest *and* on serve.
- **Destination**: HTTPS only, host must match the advertiser's verified
  domain or an approved subdomain, no open redirectors, re-crawled on a
  schedule so an approved destination cannot be swapped for something else
  after review.
- **Policy**: prohibited categories (adult, gambling, crypto tokens, malware,
  "AI girlfriend" spam, competitor impersonation), no fake-system-message
  styling — an ad that mimics agent output inside an agent transcript is the
  single worst thing we could allow on this inventory.
- **Review**: reuse the queue. Keep the two-gate structure from
  `AD_CAMPAIGN_REVIEW_ENABLED` — advertiser approved by hand always, creative
  review flag-controlled. Creative review matters more here than in the boost
  marketplace, because here we are the ones putting the words on screen.

### 2.4 Ad server (decisioning)

A single endpoint, already implied by the client contract:

```
POST /api/v1/ads/request  →  { ads: AdResponse[] }
```

Pipeline, in order:

1. **Authenticate & resolve context** — user, access tier, product, surface,
   placement, OS, geo, browser-like UA via `resolveAdProviderUserAgent`.
2. **Eligibility gates** — ads enabled for this user (`getAdsEnabled`;
   `IS_FREEBUFF` forces true), region, terminal too short, opt-out signals.
3. **Build targeting context** — §2.6.
4. **Candidate retrieval** — active, approved, funded campaigns whose targeting
   matches and whose placement matches. Must be an indexed query, not a scan;
   this runs on every inline slot.
5. **Filters** — daily budget remaining, pacing state, frequency cap, per-user
   dedupe, advertiser-level exclusions, already-served-in-this-response set.
6. **Rank** — §2.5.
7. **Floor check** — if the best first-party candidate's expected revenue is
   below the placement floor (what backfill nets us), fall through to §2.7.
8. **Emit** — one `AdResponse` per requested slot, each with a signed,
   single-use `impUrl` and `clickUrl`.
9. **Log** — auction record for reporting and dispute resolution.

**Latency budget: p99 under 150ms.** Inline ads are fetched lazily as a
response streams (`requestLazyResponseAds`); a slow ad server delays nothing
visible but does burn the slot, since `responseAdDisplayCount` only renders
what has loaded. Serve from a hot in-memory candidate index refreshed on
campaign change, not from a per-request join.

**Failure mode: always no-fill, never error.** `requestLazyResponseAds` already
treats a null result as a consumed attempt, which is exactly right — a
throwing ad server must degrade to an empty slot, never to a broken response.

### 2.5 Pricing and allocation

This is the decision with the most downstream consequences, and our codebase
already has an opinion worth carrying forward:

> Auctions are the right answer when supply is scarce and buyers differ in
> willingness to pay. Neither is true here at launch.
> — `common/src/constants/freebuff-ads.ts`

That reasoning holds for v1 of this network too, with one addition.

**Recommendation: flat external price, eCPM internal ledger.**

- **What the advertiser sees**: a whole-dollar daily rate that is simultaneously
  the price and the delivery cap, exactly like the boost marketplace. `$20/day`
  buys `$20/day` and up to N impressions a day, and the dashboard says so before
  they sign up. They can compute reach without an auction simulator.
- **What we compute internally**: every campaign carries an effective CPM
  derived from `daily_rate / delivered_impressions`. We need this regardless of
  what we show, because §2.7 must compare our demand against a backfill network
  that quotes in CPM. Without an internal eCPM there is no principled floor
  price and mediation becomes guesswork.
- **Allocation among competing first-party campaigns**: when two campaigns match
  the same request, rank by `eCPM × predicted_CTR`, tie-broken by pacing debt
  (whoever is furthest behind their daily target wins). This is a ranking rule,
  not an auction — nobody's price changes based on who else bid.
- **When to switch to an auction**: when a meaningful share of requests has more
  eligible demand than slots on a *specific targeting segment*. Instrument
  "eligible candidates per request" from day one so this is a number rather than
  a hunch. Until then an auction adds complexity and a worse advertiser
  experience for no revenue.

**Pacing** — spread delivery across the day rather than exhausting budget in the
first hour, because our traffic has a strong working-hours shape and a
front-loaded campaign only reaches early-timezone users. Standard approach: a
target delivery curve derived from historical hourly volume, with a per-campaign
throttle probability.

Other pricing factors to settle:

- **Minimum daily spend**: `AD_MIN_DAILY_BUDGET_CENTS` is $10 in the boost
  marketplace. Same floor is probably right — below that the delivery is noise.
- **Prepaid balance vs. subscription**: the boost marketplace charges a daily
  subscription. For ads, a **prepaid balance drawn down by delivery** is a
  better fit — it caps our exposure to chargebacks and matches how advertisers
  budget. This differs from the existing billing and is a real decision.
- **Refunds**: what happens to an unspent day, an over-delivered day, or a
  campaign rejected after it started serving.

### 2.6 Targeting and data

Our targeting signal is genuinely differentiated and genuinely sensitive. The
public data-use copy already states the boundary:

> We may analyze prompts and messages—including pasted content—to personalize
> ads… **Separate uploads and connected repositories are not provided to
> advertising providers.**

That sentence is the contract. Everything below has to stay inside it, and
because the copy is generated into the README and tested
(`freebuff-public-data-use-copy.test.ts`), a targeting feature that steps
outside it is a documentation bug as well as a legal one.

**Tier 1 — non-contextual, ship first:**

- Product and surface (CLI vs Desktop vs Web)
- OS and architecture
- Country / region, access tier (full vs limited)
- Model in use
- Account age, new vs returning
- Time of day

**Tier 2 — contextual, derived from the session:**

- Languages and frameworks detected in the working project
- Package-manager / toolchain signals
- Task category (debugging, scaffolding, refactor, research), derived from an
  agent classification of the prompt

**Tier 2 must be a bounded taxonomy, never free-text keywords.** The ad server
receives `{ languages: ['typescript'], task: 'debugging' }` — a fixed enum of a
few hundred values — and never prompt text. Classification happens on our side,
the result is what targets, and the raw prompt never reaches an advertiser or a
targeting log. This is the difference between "we personalize ads from your
prompts" (already disclosed) and "advertisers can query your prompts" (not
disclosed, and not something we should build).

**Never targetable:** repository contents, file contents, uploaded files, exact
prompt text, anything that could re-identify a user to an advertiser. Enforce
this in the type of the targeting context, so a future contributor cannot widen
it by accident.

**Controls:** honor `/ads disable` where it applies (`getAdsEnabled`), honor
recognized opt-out signals as the privacy copy promises, and give every user a
"why am I seeing this ad" affordance naming the targeting segment. In free mode
ads are mandatory, but *personalization* being mandatory is a separate and much
weaker claim — plan for a non-personalized fallback so opt-out means "untargeted
ads", not "no free tier".

### 2.7 Mediation and backfill

Our demand and three networks now compete for the same slot.

- **Waterfall with a floor, not a unified auction.** Our own campaigns get first
  look. If the best first-party candidate clears the placement's floor price, we
  serve it. Otherwise fall through the existing provider order.
- **The floor price is the point.** It must be set to the trailing eCPM the
  backfill networks actually net us on that placement — not a guess — because
  every impression we fill with underpriced first-party demand is credits a user
  does not receive (§2.8). Compute it from real settlement data, per placement,
  refreshed weekly.
- **The provider order stays server-owned.** The client comment already says
  *"The server owns fallback ordering"* — keep it that way; a client that picks
  providers is a client that can't be fixed without a release.
- **Blend limits.** A user should not see four of the same advertiser's ads in
  one response. `MAX_RESPONSE_AD_POOL_SIZE` bounds distinct ads per response but
  `getResponseAdForSlot` deliberately *repeats* the pool across slots, so
  advertiser-level diversity has to be enforced when the pool is built, not when
  it is rendered.
- **Instrument fill rate per source** so "we replaced Gravity with our own
  demand and revenue went down" is detectable within a day.

### 2.8 Publisher economics — the user credit loop

This is the constraint that makes our network different from a normal one:
**ad revenue is paid back to users as credits** (`GrantType = 'ad'`; the
impression endpoint returns `creditsGranted`), and those credits are what fund
free model access.

Consequences to design around:

1. **Our own demand must clear the backfill floor**, or launching the network
   quietly cuts user payouts and shortens free sessions. This is the single
   biggest risk in the whole project and the reason §2.7's floor is
   data-derived.
2. **Revenue-share ratio** for first-party demand needs an explicit decision:
   same share as backfill, or a different one since we keep the margin the
   network used to take? Recommendation: pass through *more* on first-party
   demand — it is the visible user-facing benefit of doing this at all, and it
   makes the migration a win for users rather than a neutral one.
3. **Credit grants must be idempotent per impression.** They already are, by
   `impUrl` dedupe client-side (`claimAdImpression`) plus server-side dedupe.
   Keep both; a first-party `impUrl` we mint ourselves makes server-side dedupe
   trivial and should be single-use by construction.

### 2.9 Measurement, tracking, attribution

**Impression.** Fires from `AdCard`'s mount effect. Be honest internally about
what that means: a terminal has no viewport API, an ad can scroll out of
scrollback unseen, and there is no viewability signal. Define the sold unit as a
*rendered impression* and say so in the advertiser terms. Do not invent a
"viewable impression" metric we cannot measure.

**Click.** `POST /api/v1/ads/click`, then `safeOpen(ad.clickUrl)`. First-party
`clickUrl` should be a signed redirect through our domain carrying campaign,
creative, placement, and a click id — that gives us click confirmation
independent of the client and gives the advertiser a parameter to attribute on.

**Conversion.** Needed for anyone spending meaningfully.

- A lightweight JS pixel and a server-side postback endpoint, keyed on click id.
- A hashed end-user identifier, following the pattern already used for Gravity
  Index (`packages/agent-runtime/src/tools/handlers/tool/gravity-index.ts`
  hashes the identifier server-side before it leaves us). Reuse that shape
  rather than inventing a second one.
- Attribution window and model as explicit, documented settings
  (recommend: 7-day click, last-touch — simple and defensible).

**Reporting pipeline.** Raw event log → hourly rollups → advertiser-facing
aggregates. Advertisers see near-real-time approximate numbers and a finalized
figure after a reconciliation window (recommend 24–48h) during which invalid
traffic is stripped. Say which is which in the UI; a number that silently drops
overnight destroys trust faster than a delayed number.

### 2.10 Invalid traffic and fraud

Our inventory is a CLI. Every conventional web IVT signal is absent, and the
attack is different: the fraudster is a *user* farming impression credits, not a
bot farm inflating a publisher's numbers.

- **Impression fraud**: scripted clients cycling sessions to mint `'ad'` grants.
  Defenses: authenticated ad requests (already), server-minted single-use
  `impUrl`, per-user hourly impression caps, dwell/activity requirements — the
  hook already gates on `isUserActive` and `MAX_ADS_AFTER_ACTIVITY`, which is
  the right instinct and should become a server-enforced rule rather than a
  client-side one.
- **Click fraud**: click-to-impression ratio outliers per user, per campaign,
  per region.
- **Non-browser clients**: `isBrowserLikeAdUserAgent` already exists for the
  backfill networks' benefit; for our own network the equivalent check is
  "does this request come from a real Freebuff client build", which is a
  stronger signal we should use.
- **Advertiser-side fraud**: destination swapping after approval, cloaking
  (serving different content to our crawler than to users) — re-crawl
  destinations from residential-looking egress on a schedule.
- **Reconciliation**: IVT stripped before finalized reporting and before
  billing, with the advertiser credited automatically rather than on request.

### 2.11 Admin and operations

Extends `/web/admin/advertisers`:

- Advertiser approval queue (exists), creative review queue (exists in shape)
- Campaign spot-check list, force-pause, force-end
- Placement floor-price editor with an audit trail
- Fill-rate and revenue dashboard by source (us vs each backfill network)
- IVT review queue and per-user ban tooling
- Credit/refund issuance
- A kill switch per placement and a global one — flag-controlled, checked in

### 2.12 Client-side changes

Deliberately small, which is the payoff of the existing normalization layer:

- Add `'freebuff'` to `AdProvider`. Nothing in the render path changes.
- Extend `AdSurface` beyond the two legacy strings to real placement ids, with
  the legacy values kept as aliases — the existing comment is explicit that
  `waiting_room` is a wire name that must not be renamed.
- Send richer, bounded targeting context on the ad request.
- Add the "why this ad" affordance and, where applicable, a personalization
  opt-out.
- Enforce ANSI-stripping on `adText`/`title`/`cta` at render time as
  defense-in-depth, even though the server also enforces it on ingest.

---

## 3. Data model sketch

```
advertiser              (exists) id, company, website, status, stripe_customer_id
ad_campaign_v2          id, advertiser_id, name, objective, status, daily_budget_cents,
                        start_date, end_date, pacing_state, created_at
ad_creative             id, campaign_id, title, ad_text, cta, destination_url,
                        favicon_url, status, review_notes
ad_targeting            campaign_id, dimension, operator, values[]   -- bounded enums only
ad_placement            id, product, surface, format, floor_cpm_cents, enabled
ad_campaign_placement   campaign_id, placement_id                    -- opt-in per placement
ad_auction_log          request_id, user_hash, placement_id, candidates_considered,
                        winner_campaign_id | backfill_provider, floor_cents, ts
ad_impression_v2        id, creative_id, campaign_id, placement_id, user_hash,
                        imp_token, ts, ivt_status, revenue_cents, credits_granted
ad_click_v2             id, impression_id, click_token, ts, ivt_status
ad_conversion           id, click_id, advertiser_event, value_cents, ts
ad_spend_ledger         campaign_id, date, spend_cents, impressions, clicks, finalized_at
```

Note the `_v2` suffixes: the boost marketplace already owns `ad_campaign` and
`ad_engagement`. Sharing the advertiser and billing tables while keeping
campaign types in separate tables avoids a nullable-column mess where half the
fields are meaningless for either type.

---

## 4. Factors — the decisions this plan does not make for you

| Factor | Options | Recommendation |
| --- | --- | --- |
| **Pricing model** | Flat daily / CPM / CPC / auction | Flat daily external, eCPM internal ledger. Revisit when eligible-candidates-per-request shows real competition. |
| **Billing** | Daily subscription (as boost) / prepaid balance | Prepaid balance drawn down by delivery. Caps chargeback exposure, matches advertiser mental model. |
| **Minimum spend** | $10/day / higher / none | $10/day, matching `AD_MIN_DAILY_BUDGET_CENTS`. |
| **Self-serve trust gate** | Open signup / manual approval (as today) / hybrid | Keep manual advertiser approval at launch. It is the gate that makes creative review optional rather than mandatory. Automate later on spend history. |
| **First-party rev share** | Same as backfill / higher | Higher. It is the user-visible reason to do this. |
| **Backfill relationship** | Keep all three / drop the weakest | Keep all three initially; the floor price will naturally starve the weak ones. |
| **Contextual targeting depth** | Tier 1 only / Tier 1+2 | Tier 1 at launch, Tier 2 once the bounded taxonomy and its privacy review are done. Tier 2 is the differentiator but it is also the thing that can go badly wrong. |
| **Conversion tracking** | None / pixel / pixel + postback | Pixel + postback, reusing the hashed-identifier pattern from Gravity Index. |
| **Frequency cap** | Per response / per session / per day | Per user per day per campaign, plus per-advertiser diversity within a response pool. |
| **Impression definition** | Rendered / dwell-qualified | Rendered, stated plainly. Do not sell viewability we cannot measure. |
| **Multi-publisher** | Now / later / never | Later, but shape the request API for it now. |

Cross-cutting factors that affect everything above:

- **Volume is the gating input.** Every economic decision here — floor price,
  minimum spend, whether an auction is ever warranted — depends on daily
  eligible impressions per placement. Get that number and its targeting
  breakdown before finalizing pricing.
- **Advertiser demand is unproven.** We have never sold this inventory
  directly. The boost marketplace's advertiser list is the warmest possible
  starting demand and should be the design partner set.
- **Regulatory**: clear "Ad" disclosure (already present), advertising choices
  and opt-out signals where required, children's-data considerations (likely
  n/a), and per-region rules if we target by geo.
- **Reputational**: this inventory sits inside an agent transcript that users
  trust. One ad that reads like agent output does more damage than a quarter of
  ad revenue is worth. That is the argument for keeping creative review on.

---

## 5. Phasing

**Phase 0 — Measure (1–2 weeks).**
Instrument eligible impressions per placement and per Tier 1 targeting segment;
compute trailing eCPM per placement per backfill provider. No product work. This
phase produces the floor prices and the forecaster's training data, and every
later decision depends on it.

**Phase 1 — Serve one ad (3–4 weeks).**
`'freebuff'` provider, placement registry, minimal ad server with Tier 1
targeting, first-party `impUrl`/`clickUrl` minting, waterfall with a static
floor. Demand is a hand-inserted house ad. Success: our own ad renders in the
CLI and pays a user credits, and backfill still fills everything else.

**Phase 2 — Self-serve advertiser console (4–6 weeks).**
Campaign builder with multi-width creative preview, Tier 1 targeting, prepaid
billing, creative review queue, advertiser dashboard. Open to a handful of
design-partner advertisers from the boost marketplace, invite-only.

**Phase 3 — Make it work economically (3–4 weeks).**
Pacing, frequency capping, forecaster, data-derived per-placement floors,
IVT detection and reconciliation, finalized-vs-live reporting. Success: we can
tell whether first-party demand is accretive to user credits, and it is.

**Phase 4 — Differentiate (4–6 weeks).**
Tier 2 contextual targeting behind its privacy review, conversion tracking,
optimization toward clicks, "why this ad" and personalization controls.

**Phase 5 — Open up.**
General self-serve signup with automated approval on low spend; then, if the
economics hold, the publisher SDK and multi-publisher expansion the request API
was already shaped for.

---

## 6. Open questions

1. **What is daily eligible impression volume today, per placement?** Everything
   in §4 is provisional until this is known.
2. **What do the backfill networks actually net us per thousand impressions,
   per placement?** This is the floor, and therefore the launch criterion.
3. **Prepaid balance vs. the existing daily-subscription billing** — divergence
   from the boost marketplace needs a deliberate yes.
4. **Does first-party demand pay users more?** If we cannot commit to that, the
   user-facing story for this project is weak and the migration is a pure margin
   grab.
5. **Who owns creative review at volume**, and what is the SLA? A 48-hour review
   on a 7-day campaign is a quarter of the flight.
6. **Which surfaces beyond CLI ship first** — Desktop shares the render path and
   is nearly free; Web and Chat need their own format specs.
