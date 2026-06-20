# Freebuff Abuse Detection

How to find, judge, and action accounts abusing free mode. Companion to
[`freebuff-waiting-room.md`](./freebuff-waiting-room.md) (sessions, admission,
quotas) — this doc is the **operational playbook** for the recurring problem of
people scripting the free endpoint instead of coding through the CLI.

## The core abuse: scripting the raw endpoint

Free mode is meant to be used through the freebuff CLI, which runs an agent loop
(root orchestrator + subagents) and creates `agent_run` / `agent_step` rows.
Abusers instead call the OpenAI-compatible `POST /api/v1/chat/completions`
endpoint directly with `codebuff_metadata.cost_mode = 'free'`, using it as a
free LLM proxy for non-coding apps (chatbots, release-notes generators,
translation, essay mills) — often reselling premium models.

### Why the per-session caps don't stop it

The **5 premium-sessions/Pacific-day** cap (`FREEBUFF_PREMIUM_SESSION_LIMIT`) is
enforced only at **session admission** (`canStartSession` in
`web/src/server/free-session/public-api.ts`) and on the **agent-run path**
(`triggerGates` → `rateLimiter` in the freebuff Convex backend). Two gaps let
direct callers around it:

1. A direct chat-completions call never creates an `agent_run`, so the agent-run
   cap is never consulted.
2. The session cap limits the **number of sessions**, not messages. One admitted
   session (default ~60 min + 30 min grace) permits **unlimited** premium
   messages, and a session keys on `userId + active_instance_id` — **not**
   `client_id` — so a single session can proxy unlimited downstream callers.

Net effect: within the rules, one account could fire thousands of premium
messages/day for free.

### What plugs it (enforced at the endpoint, bypass-proof)

Both live in `web/src/app/api/v1/chat/completions/_post.ts`:

- **Premium-model daily cap** — `FREE_MODE_PREMIUM_RATE_LIMITS.PER_DAY` (1200)
  in `free-mode-rate-limiter.ts`, checked on every free-mode premium request
  regardless of the agent-run path. Burst is bounded by the existing
  model-agnostic windows (`FREE_MODE_RATE_LIMITS`: ≤350/30min, ≤2000/5h,
  4000/day).
- **CLI-required gate** — free-mode **root**-agent requests must carry the CLI's
  "You are Buffy" system prompt (`requestHasFreebuffSystemMarker`). Missing →
  `403 free_mode_cli_required` (a friendly nudge to `npm i -g freebuff`, **not**
  a ban). Scoped to root agents; subagents are constrained by the agent-hierarchy
  gate.

## The `/abuse` admin dashboard

`freebuff.com/abuse` is the interactive review console. It's admin-gated
server-side (`@codebuff.com` accounts or allow-listed emails — see
`isCodebuffAdmin` in `packages/internal/src/utils/auth.ts`) and surfaces
**two** signal sets with **checkbox + "Ban selected"** buttons (banning
flips `banned=true` and clears `free_session` rows, same as
`scripts/ban-freebuff-bots.ts`):

1. **API / proxy abuse** (primary) — the strong request-level scanner,
   `identifyApiAbuseSuspects`, ported from
   `scripts/find-freebuff-api-suspects.ts`. Scores accounts over a lookback
   window (`?hours=`, `?minScore=`, default 7d/30) on the proxy-fanout and
   farm fingerprints, with per-row **expandable detail**: avg/max
   clients-per-run, no-agent-step %, max run duration, models/agents used,
   and the top sample runs (msgs/clients/steps/status/duration). This is the
   one that actually catches resellers.
2. **Active-session behavioral suspects** (secondary) — `identifyBotSuspects`,
   the coarse 24/7-usage/volume/region/GitHub-age heuristics over currently
   admitted sessions, plus signup clusters.

The detection core lives in `@codebuff/internal/freebuff-abuse`
(`identifyApiAbuseSuspects`, `identifyBotSuspects`, `banSuspects`,
`formatSweepReport`), with the pure proxy/farm scorer split into
`@codebuff/internal/freebuff-abuse-scoring` (`scoreApiAbuse`, unit-tested).
It's the single source of truth shared by the dashboard
(`freebuff/web/src/app/api/admin/abuse/route.ts`), the legacy codebuff.com
bot-sweep endpoint (`web/src/app/api/admin/bot-sweep/route.ts`), and the
`scripts/find-freebuff-api-suspects.ts` CLI (now a thin wrapper that calls
`identifyApiAbuseSuspects` — no duplicated SQL or scoring).

> The **hourly bot-sweep email** (`.github/workflows/bot-sweep.yml`) was
> disabled 2026-06-17 — it was ignored in practice. The endpoint still
> works via `workflow_dispatch` if you want the email back; the dashboard
> is the intended replacement.

## Detection scripts

All read-only; run against prod via Infisical. Live in `scripts/`.

| Script | Purpose | Example |
|---|---|---|
| `find-freebuff-api-suspects.ts` | Scores **individual accounts** by proxy/farm request fingerprints over a lookback window. **Start here.** | `infisical run --env=prod --silent -- bun scripts/find-freebuff-api-suspects.ts --hours 336 --min-score 50` |
| `find-freebuff-sock-clusters.ts` | Groups **accounts into rings** by two shared-identity signals: `fingerprint_id` and `client_ip_hash`. Catches coordinated socks the per-account scorer sees one-at-a-time. | `… bun scripts/find-freebuff-sock-clusters.ts --min-users 4 --only-unbanned` |
| `investigate-id-spike.ts` | Investigates a **live-counter / admission spike** straight off `free_session` + `free_session_admit` (no message rows needed, so it sees the idle-session farm the suspect scorer misses): admissions-per-hour histogram, per-country breakdown for a time window, then the target-country cohort with per-account flags (new-acct, IP/fingerprint sharing, fanout, null-repo, msgs==runs). **Start here when "country X spiked at time T".** | `… bun scripts/investigate-id-spike.ts --country ID --from "2026-06-20T06:00:00Z" --to "2026-06-20T11:00:00Z"` |
| `inspect-freebuff-traces.ts` | Dumps stored request/response traces, `repo_url`, agent-step counts, models/agents for specific emails. Use to **confirm** before banning. | `… bun scripts/inspect-freebuff-traces.ts a@b.com c@d.com` |
| `top-freebuff-users.ts` | Raw volume leaderboard for a given agent (message counts, tokens, time-of-day). | `… bun scripts/top-freebuff-users.ts 336 50 base2-free` |
| `ban-freebuff-bots.ts` | Bans an email list (`banned=true` + clears `free_session`). **Dry-runs by default**; `--commit` to apply. | `… bun scripts/ban-freebuff-bots.ts list.txt` then `… --commit` |
| `unban-freebuff-users.ts` | Reverses bans by email. | `… bun scripts/unban-freebuff-users.ts a@b.com` |

## The signals (data model)

Detection keys off four tables (`packages/internal/src/db/schema.ts`):

- **`message`** — per LLM call: `client_id`, `client_request_id` (= run id),
  `agent_id`, `model`, `repo_url`, `request`/`response` JSON, `credits`.
- **`agent_run`** — `total_steps`, status.
- **`agent_step`** — one row per real agent step, joined to `message` by
  `message_id`.
- **`free_session`** — one row per admitted session: `user_id`, `status`
  (`active`/expired), `client_ip_hash` (hashed egress IP), `country_code` /
  `geoip_country`, `active_instance_id`. **The only table that sees an
  admit-and-idle farm** — those accounts never write a `message` row (see the
  idle-session fingerprint below).

The first three are message-driven and feed the suspect/cluster scanners; the
table below contrasts a real coding session against scripted abuse on those rows.

| Signal | Real CLI coding | Scripted abuse |
|---|---|---|
| `client_id` per run | one, reused across the session | a distinct id **per message** (proxy), or msgs==runs (single-shot) |
| `agent_step` rows | one per message (`msgs ≈ steps`) | ~0 (`msgs_with_agent_step ≈ 0`) |
| `repo_url` | set | almost always null |
| messages per run | many (a coding session) | 1 (single-shot) or thousands held open |
| system prompt | starts with "You are Buffy" | arbitrary app/proxy prompt |
| trace content | code, tool calls, file context | app-backend output (JSON APIs, chat, essays), often non-English, no code |

### Three fingerprints

- **Proxy fanout** — many distinct `client_id`s inside one run held open for
  hours/days; ~0 agent steps; null `repo_url`. A reseller forwarding many users
  through one freebuff session. Strongest single tell: `maxClientIdsPerRun` in
  the dozens-to-thousands.
- **Bulk / farm** — `messageCount == runCount` (one message per run), ~0 agent
  steps, often coordinated same-day account batches with bot-generated display
  names. Single-shot completion scripting.
- **Idle-session farm (admit-and-hold)** — accounts that get admitted, then send
  **~0 messages**. They consume admission slots and inflate the "live now"
  counter without ever calling the LLM, and (because they write no `message` row)
  they are **invisible to the message-driven scanners** — you only see them in
  `free_session`. The 2026-06-20 ID farm was 605 accounts on one `client_ip_hash`,
  all `status='active'` on `deepseek-v4-flash`, most with zero messages. Detect it
  directly off `free_session`, or with `scripts/investigate-id-spike.ts`:

  ```sql
  -- one IP holding hundreds of idle active sessions = farm
  SELECT left(client_ip_hash,12) AS ip, COUNT(*) sessions,
         mode() WITHIN GROUP (ORDER BY split_part(u.email,'@',2)) AS top_domain
  FROM free_session fs JOIN "user" u ON u.id = fs.user_id
  WHERE fs.status='active'
  GROUP BY 1 HAVING COUNT(*) >= 50 ORDER BY 2 DESC;
  ```

The suspect scorer in `find-freebuff-api-suspects.ts` encodes the first two
fingerprints, with dampeners for tenured accounts and a "real-steps"
legit-power-user signal — read its scoring comment block before tuning
thresholds. For the third, see the SQL above. Prevention for all three is the
open work in [Mitigation gap](#mitigation-gap-idle-session-farms-evade-every-current-cap).

### Cross-account ring signals (`find-freebuff-sock-clusters.ts`)

The per-account scorer judges one account at a time; rings hide by keeping each
member under the per-account caps. Two **shared-identity** signals group accounts
into rings. Both feed human review — neither is a ban-on-sight, and (per the
investigation on 2026-06-10) **neither is wired into a request-time rate limit**:

- **`fingerprint_id` sharing** — accounts whose CLI `session` rows point at the
  same `fingerprint.id`. A farm run from one CLI install shares one
  fingerprint_id (the BPS ring = 8 accounts/1 fp all banned; STT Bandung = 9/1).
  Distinct real machines get distinct fingerprint_ids, so a university/shared-NAT
  does **not** cluster here — **but** baked-image cloud environments (Google
  Cloud Qwiklabs, Codespaces, Docker) share one fingerprint across many unrelated
  real users. The discriminator is **account-creation span**: a farm registers
  its accounts in minutes-to-hours (the `FARM?`/TIGHT flag = ≥4 accounts within
  48h); a shared cloud env accretes real users over weeks-to-months (`qwiklabs.net`
  over 16 days, 0 banned). `sig_hash` is null for ~2/3 of fingerprints, so key on
  `fingerprint_id`, not `sig_hash`. Two more caveats: it's defeated by per-account
  fingerprint rotation, and a tight cluster is **not** proof of botting — it also
  catches one developer (or a small team) running several accounts to multiply the
  free quota, who may be doing entirely real coding. Always trace-confirm content
  before actioning a cluster (see playbook step 3).
- **`client_ip_hash` sharing** — accounts sharing an egress IP hash. Catches
  IP-stable farms, but **high false-positive**: universities, bootcamps, and CGNAT
  carriers legitimately share one IP across many users (measured: many 10–120-user
  IPs with **0** banned). Three discriminators separate a farm from a shared NAT:
  - **Banned-% + domain diversity** — high banned-% with one/two domains = farm;
    low banned-% with diverse/edu domains = shared NAT (review, do **not** bulk-ban).
  - **Disposable domain + shared display-name token** — the strongest tell. The
    2026-06-20 farm was 749 accounts on two throwaway domains (`@guzeil.com`,
    `@gmosel.com`) registered in a 3-day burst, every display name ending in the
    **same token** (`rosacloegraysonsteven`) — a name-template artifact no
    shared-NAT cohort produces. One/two disposable domains **plus** a repeated name
    token = farm, regardless of message volume.
  - **Concurrent active-session count** — a NAT spreads users across time (a
    handful active at any instant); a farm holds hundreds of `status='active'`
    sessions on one hash *simultaneously*. This is also the basis for the proposed
    fix (see [Mitigation gap](#mitigation-gap-idle-session-farms-evade-every-current-cap)).

  A hard per-IP *request* rate limit was rejected — it throttles legit
  shared-network users on every call for catches detection already makes. A per-IP
  *concurrent-session* cap does not have that problem (Mitigation gap).

## Judgment / escalation playbook

0. **If the trigger is a live-counter / country spike** ("country X jumped at
   time T"), start with `investigate-id-spike.ts`, **not** the suspect scan — the
   spike may be an idle-session farm with zero messages, which the message-driven
   suspect/cluster scans cannot see. The spike tool reads `free_session` directly
   and gives you the offending IP, domains, and cohort. Then proceed to step 1 for
   the accounts that *do* have message activity (e.g. co-resident proxy resellers).
1. **Run the suspect scan** (`--min-score 50` is a good ban-candidate cut;
   `--min-score 1 --json` to see the whole scored population).
2. **Run the cluster scan** (`find-freebuff-sock-clusters.ts --only-unbanned`)
   to catch coordinated rings that hide under the per-account caps. Triage the
   `FARM?`/TIGHT fingerprint clusters and high-banned-% IP clusters; **ignore**
   wide-span 0-banned fingerprint clusters (cloud envs) and low-banned-% diverse
   IP clusters (shared NAT/edu).
3. **Confirm with traces** (`inspect-freebuff-traces.ts`) — verify null
   `repo_url`, ~0 agent steps, and non-coding response content. Account display
   names are often self-incriminating (numbered "dummy"/"proxy" handles,
   bot-generated CamelCase, shared names across a ring). **This step is
   load-bearing for cluster hits**: a shared fingerprint also flags real coders
   multi-accounting (observed 2026-06-10 — several tight clusters turned out to
   be genuine Android/web dev with ~100% agent-step coverage). Never bulk-ban a
   cluster on the identity signal alone; trace-confirm non-coding content first.
4. **Ban the high-confidence set** — `ban-freebuff-bots.ts` (dry-run first, then
   `--commit`). High confidence = proxy fanout (`maxClientIdsPerRun ≥ 10` and
   ≥90% missing steps) or bulk/farm (`≥400 msgs`, ≥95% missing steps).
5. **Hold for manual review** — tenured accounts (>60d), corporate/edu domains
   (real identity), and low-volume accounts. Same fingerprint, higher false-ban
   cost. Check these by hand.
6. **Watch the escalation tell** — now that the CLI-required gate is live, a
   caller who **injects the "You are Buffy" marker but still produces no agent
   steps** is deliberately evading detection → strong ban signal. The suspect
   scan's missing-step ratio surfaces these.

## Operational hygiene

- **Do not commit account identifiers** (emails) to the repo. Keep ban lists and
  raw scan output as out-of-band operational records. Redacted, count-only
  summaries (methodology + category counts) are fine — see
  `scripts/FREEBUFF_ABUSE_FINDINGS.md`.
- Bans are **reversible** (`unban-freebuff-users.ts`); when unsure, lean on the
  friendly `free_mode_cli_required` gate (which only blocks, never bans) and the
  manual-review bucket rather than a hard ban.

## Tuning knobs

| Knob | Where | Note |
|---|---|---|
| `FREE_MODE_PREMIUM_RATE_LIMITS.PER_DAY` | `free-mode-rate-limiter.ts` | Premium messages/day/user. Sized for ~5 premium sessions. |
| `FREE_MODE_RATE_LIMITS` | `free-mode-rate-limiter.ts` | Model-agnostic burst/volume windows. |
| `FREEBUFF_PREMIUM_SESSION_LIMIT` | `common/src/constants/freebuff-models.ts` | Premium sessions/Pacific-day at admission. |
| Suspect score thresholds | `find-freebuff-api-suspects.ts` (`getScore`) | Proxy/farm cutoffs and dampeners. |

## Mitigation gap: idle-session farms evade every current cap

The 2026-06-20 ID farm exposed a structural hole. Every existing cap is keyed on
something an admit-and-idle farm never produces:

- `FREEBUFF_PREMIUM_SESSION_LIMIT` is **per-user** — N farm accounts get `N × 5`
  sessions, and one admitted session holds a slot all day for free.
- `FREE_MODE_*_RATE_LIMITS` fire on **messages** — an idle account sends none.
- The suspect/cluster scanners read message tables — a zero-message account has
  nothing to score (see the idle-session fingerprint).

So a single IP held ~605 concurrent sessions undetected, surfacing only as an
inflated "live now" counter. Banning works but is reactive — the farm re-registers.

**The lever — per-`client_ip_hash` concurrent active-session cap at admission**
(in `requestSession`, `web/src/server/free-session/public-api.ts`). A cap on
*simultaneous active sessions per egress hash* targets the exact farm shape
(hundreds concurrent from one hash) while leaving shared NATs (a few concurrent,
spread over time) untouched — which is why it works where the rejected per-IP
*request* limit didn't. Rollout:

1. **Log-only first (shipped).** At each fresh instant-admission `requestSession`
   counts the active sessions sharing the admission's `client_ip_hash` and emits
   `metric = "freebuff_ip_session_cap"` to the freebuff Axiom dataset —
   `activeForIp` is the post-admit concurrency, `wouldBlock` flags admissions the
   current `FREEBUFF_IP_SESSION_CAP` guess (default 30) would reject. **Nothing is
   blocked yet** (`enforced: false`). To keep volume down the log only fires once
   the hash reaches `IP_SESSION_LOG_FLOOR` (5) concurrent sessions. Reclaims and
   takeovers are not sampled (they hold an existing slot). Use the logged
   distribution to find the real shared-NAT ceiling and set the cap above it.
2. **Enforce as a soft gate (next).** Flip the log-only branch to reject over-cap
   *fresh* admissions with a friendly `free_mode_cli_required`-style response so an
   over-cap NAT user gets a nudge, never a ban. Add a partial index on
   `free_session (client_ip_hash) WHERE status='active'` when enforcing, since the
   count then gates the hot path.
