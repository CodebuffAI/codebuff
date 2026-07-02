# Referrals (unified design)

Status: **design / spec** (agreed 2026-06-26). This supersedes the per-program
referral system (`cli` / `web` / `glm`) in
`packages/billing/src/referral-program.ts`.

## Why we're changing it

Today there are three *parallel* referral programs sharing one `referral` table,
keyed by a `program` column:

- `cli` — codebuff Opus allowance. Bar: GitHub bright line (12-month account +
  6-month public repo) **+ full-access activation**.
- `web` — Freebuff Web tier ladder. Bar: GitHub account ≥ 4 months. No
  activation, no access-tier gate.
- `glm` — Freebuff CLI GLM 5.2 sessions. Bar: GitHub account ≥ 12 months. No
  activation, no access-tier gate.

Problems this creates:

1. **A user can be "referred" three times** (once per program), with three rows,
   three burn-once ledgers, and three different bars. There is no single notion
   of "who referred this person."
2. **Attribution is cookie-only.** The referrer is recorded only when the
   referred user hits a redemption hop with the `vly_referral_code` cookie still
   present. Clear the cookie, or first authenticate from a different browser, and
   the referral is lost.
3. **GLM (paid serverless time) isn't access-gated** by the *referred* user's
   tier — a VPN/limited-region signup still completes a GLM referral.
4. **Benefits are baked into the program**, so products can't independently
   decide what a referral is worth.

## Principles of the new design

1. **One referral per person, ever.** `referral_v2.referred_id` is the primary
   key. A user is referred at most once, tracked in a single row regardless of
   which product either party uses.
2. **The referral code is stored, not just cookied.** It is carried through the
   auth flow and the referral row is written at signup, so attribution does not
   depend on a fragile browser cookie (see [Attribution](#attribution)).
3. **Activation is required.** A referral only counts once the referred user has
   actually used a product. (We don't need it to count the instant they connect
   GitHub.)
4. **One qualification bar:** GitHub account ≥ **4 months**, no public-repo
   requirement — and **derived, not stored** (see below).
5. **Tier-aware.** We record the access tier (`full` / `limited`) the referred
   user activated at; each product derives its own benefit from the per-tier
   counts.

## Data model

### `referral_v2` (one row per referred user)

| column | notes |
| --- | --- |
| `referred_id` | **PK** — referred at most once, ever |
| `referrer_id` | who referred them |
| `referred_github_user_id` | **UNIQUE**, nullable — burn-once anti-sybil key (replaces the two per-program `*_bonus_consumed` ledgers), and the join key for the derived age check |
| `created_at` | written at **signup** |
| `activated_at` | first product use |
| `activation_access_tier` | `full` \| `limited` — the **best** tier they've activated at |
| `revoked_at` | clawback for abuse (clears the referral from all counts) |

Note there is **no `qualified_at` column** — see below.

### Qualification is derived, not stored

A referral is *qualified* when the referred user's GitHub account is ≥ 4 months
old. That is a pure function of the immutable `github_account_created_at` already
cached in `referral_qualification` (keyed by GitHub user id). So we **derive** it
at read time:

```sql
... JOIN referral_qualification q ON q.github_user_id = r.referred_github_user_id
WHERE q.github_account_created_at <= now() - interval '4 months'
```

Why derive instead of storing a `qualified_at` flag:

- **No bar ambiguity.** A stored flag set by per-program evaluators meant
  different things (web = 4mo, glm = 12mo). Deriving makes the single 4-month
  bar the literal source of truth.
- **Ages in automatically.** Account age only increases, so a too-new referral
  becomes qualified the moment it crosses 4 months — **with no sweep to flip a
  flag.** This retires the entire periodic-sweep mechanism (and the class of
  bug where that sweep silently failed).

`referral_qualification` keeps its role as the GitHub-facts cache. Its two
per-program `*_bonus_consumed_*` columns are removed — burn-once now lives on
`referral_v2.referred_github_user_id` (unique).

A referral **counts** for benefits when it is activated
(`activated_at IS NOT NULL`), not revoked (`revoked_at IS NULL`), and qualified
(derived age ≥ 4 months).

## Lifecycle

```
  invite link clicked          signup (any product)         first product use
  /get-started?ref=CODE   ──►  referral_v2 row written  ──►  activated_at +
  (code captured + carried      (referrer bound here,         activation_access_tier
   through the auth flow)        durably)                      set (tier from the admit)

  qualified = derived live from the referred user's GitHub account age (≥ 4mo).
  No stored flag, no sweep.
```

### Attribution

The referral code is captured from `?ref=` and **carried through the sign-in
flow** (the OAuth `state` parameter / the CLI login URL), not only the
`vly_referral_code` cookie. On account creation (NextAuth `createUser` / first
authenticated hop) we resolve the code and write the `referral_v2` row. Because
the code rides the auth round-trip, attribution survives a cleared/blocked
cookie.

Inherent limit: clicking the link in browser A but first signing in from a
*different* browser B still can't be auto-attributed (the code never reaches B).
The escape hatch is letting the friend enter the code directly — a CLI prompt /
flag (`freebuff --referral CODE`) or a "have a code?" field — so a referral is
never permanently unrecoverable.

### Activation

Every product surface activates, always at the user's **verified** access tier
— the same IP/geo/privacy pipeline everywhere, so a VPN/datacenter/unsupported
-country user activates at `limited` (web-ladder credit, no GLM) and only a
verified-clean user activates at `full`:

- **CLI / desktop** — on free-session admission, at the admit's tier
  (`web/src/server/free-session/store.ts`).
- **Web chat (freebuff.com/chat)** — on each accepted signed-in message, at
  the sender's chat tier (`freebuff/web/src/app/api/chat/stream/route.ts`).
- **Web coding agent (freebuff.com/web)** — on convex-token mint (the app
  being open, refreshed ≤10 min), at the request's web tier; hard-blocked
  requests never activate (`syncWebReferralState` via the convex-token
  route). The CLI `/onboard` login hop calls the same sync WITHOUT
  activation — logging in is not product use.

Upgrade the tier `limited → full` if they later activate at full; never
downgrade. Chat/web activations leave no `free_session` rows; for
investigations, the tier checks persist `client_ip_hash` + privacy signals to
`free_mode_country_access_cache` (recent-window, per user+IP).

## Benefit policies (read-time, per product)

Single read model:

```ts
referralStats(referrerId) → {
  fullQualified:    // # counting referrals activated at 'full'
  limitedQualified: // # counting referrals activated at 'limited'
}
```

| Product | Benefit | Driven by |
| --- | --- | --- |
| **GLM 5.2 (Freebuff CLI)** | `min(fullQualified, 10)` weekly GLM sessions | `fullQualified` |
| **Freebuff CLI daily sessions** | `5 + min(limitedQualified, 3)` daily sessions (5 → 8 max) | `limitedQualified` |
| **Freebuff Web tiers** | existing tier ladder | `fullQualified + limitedQualified` |
| **Opus (codebuff CLI)** | daily Opus allowance | `fullQualified` |

Decision A: full-access referrals earn the premium reward (GLM); limited-access
referrals earn the smaller daily-session bump. A referrer can earn both by
referring both kinds of users.

**GLM stays full-access-only — a limited-access referrer cannot get GLM.** This
is a deliberate anti-abuse stance: letting limited/VPN-region users earn usable
GLM (paid serverless time) would be a large farming vector. The gate already
exists and we keep it — `resolveFreebuffModelForAccessTier` coerces a
limited-tier user's GLM request down to the limited model before admission, so a
limited user can never start a GLM session regardless of any referral
entitlement. A limited-access referrer's only reward is the **daily-session
bonus** (`limitedQualified`); they earn GLM only once they're themselves on full
access. (Earlier drafts proposed making GLM usable from any region — that idea is
dropped.)

## Migration (phased, no downtime, no lost access)

A clean **new table + cutover**, rather than mutating the live `referral` table's
primary key in place:

1. **Create `referral_v2`** (this phase) + the read model + benefit math.
   Inert until the next phase writes to it.
2. **Dual-write.** On the live paths, write `referral_v2` (attribution at signup;
   `activated_at` + tier on admit) alongside the existing per-`program` rows.
   Ship the auth-flow code carrying.
3. **Backfill + switch reads.** Backfill `referral_v2` from the old `referral`
   rows (one per `(referrer, referred)`, earliest `created_at`,
   `activation_access_tier` derived from `free_session_admit` history; resolve
   the rare multi-referrer case by keeping the earliest). Point every product's
   entitlement at `referralStats`, **grandfathering** existing GLM grants so no
   current referrer loses access. Add the supporting index then —
   `referral_v2 (referrer_id) WHERE activated_at IS NOT NULL AND revoked_at IS
   NULL` (deferred from phase 1 while the query is dormant).
4. **Drop** the old `referral` table + the `program` system. Optionally rename
   `referral_v2 → referral`.

A new table means a trivial rollback (keep the old one), no primary-key surgery
on a hot FK-referenced table, and the read model never needs transition-only
dedup (one row per `referred_id` from the start).

## Anti-abuse invariants

- **Burn-once per GitHub identity** (`referred_github_user_id` unique): one
  GitHub account is the referred party in at most one referral, ever — stops
  re-signup farming.
- **Referred at most once** (`referred_id` PK).
- **No self-referral (same user)** — `referrer_id = referred_id` is blocked in
  `recordReferralV2Attribution`. Note there is **no deterministic identity-level
  self-referral check, by design**: the `account` table keys a GitHub id to
  exactly one freebuff user, so a referred GitHub id can never also belong to the
  referrer (that case *is* the same-user check). A determined operator using a
  separate freebuff account + a separate aged GitHub is a sybil — bounded by
  burn-once (one reward per GitHub identity) and caught by the abuse sweep
  (`revoked_at`), not by a check here.
- **No reverse referrals** and the **30-day signup attribution window** are
  enforced in `recordReferralV2Attribution` (and the legacy redeem path).
- GLM requires the *referred* user to be a real **full-access** user (approved
  country, no VPN/proxy) — the strongest anti-farming gate.
- **Revocation is a process, not just a column.** A periodic abuse sweep sets
  `revoked_at` on suspicious clusters (shared-IP bursts, disposable-domain /
  email-alias farms, display-name farms — see `docs/freebuff-abuse-detection.md`).
  Without it, `revoked_at` never fires.
