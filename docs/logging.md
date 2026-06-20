# Logging & Observability (Axiom)

All logs and analytics events flow into **one queryable place**: the Axiom
`freebuff` dataset — structured events you query with APL (Axiom Processing
Language). Raw container stdout (`render logs`) still exists for live tailing,
but is **not** in Axiom: only `logger.*` calls reach the dataset, never
`console.*` (see [Conventions](#conventions)).

> **Coding agents:** use the query scripts below (`scripts/logs/`) — they build
> safe APL with a required time window. Axiom bills on **ingested volume**, not
> bytes scanned per query, so broad queries are fine; the cost lever is at
> *ingest* time (see [Cost](#cost)).

## TL;DR for agents

```bash
# Recent prod errors from the web server (last 6h)
bun scripts/logs/query-logs.ts --since 6h --level error --service web

# Everything for one session today, including the data payload
bun scripts/logs/query-logs.ts --since 24h --session <client_session_id> --full

# Print the APL without running it
bun scripts/logs/query-logs.ts --since 7d --grep "ECONNRESET" --dry-run

# Which service/level is driving ingest volume (= cost)?
bun scripts/logs/logs-volume.ts --since 24h
```

## Architecture

```
 server (web, agent-runtime)         CLI client                 browser (freebuff-web)
   logger.info/.error(...)        logger.info/.error(...)       posthog.capture(...)
         │                               │                            │
         │ (in-process)                  │ POST /api/logs             │ POST /api/logs
         │                               │ (Bearer auth, batched)     │ (same-origin, batched)
         ▼                               ▼                            ▼
   enqueueLogRow() ──────────────► Axiom logs sink ◄──────── /api/logs route handlers
   (@codebuff/logging: wraps the @axiomhq/js batching client; enable + min-level gates)
         │
         ▼
   Axiom dataset `freebuff`
```

- **Server logs** (`web`, `agent-runtime`): the existing Pino `logger` is wired
  to *also* `enqueueLogRow()` in prod. No call-site changes — every existing
  `logger.*` call already flows to Axiom. See `web/src/util/logger.ts`.
- **CLI logs/events**: mirrored via `POST /api/logs` (still also sent to
  PostHog). Both `logger.*` calls *and* `trackEvent(...)` analytics are mirrored
  (`cli/src/utils/log-shipper.ts` + the mirror in `analytics.ts`). The shipper
  ships **even before login** — with no API key it posts anonymously
  (`user_id=null`, rate-limited), so pre-auth events like `cli.app_launched`
  reach Axiom and **install→login funnels are queryable**. Correlate pre/post
  login on `client_session_id` (the anonymous run id) or `fingerprint_id`.
- **Browser events**: a PostHog `before_send` tap mirrors captured events via
  same-origin `POST /api/logs`. No call-site changes. High-volume auto-events
  (session replay `$snapshot`, `$autocapture`, heatmaps, `$web_vitals`,
  `$pageleave`) are **not** mirrored to Axiom — they dominate ingest and bury
  queryable events; PostHog still keeps them. See `shouldMirrorAnalyticsEvent`
  in `common/src/util/log-mirror.ts` + `PostHogProvider.tsx`.

The sink lives in **`@codebuff/logging`** (`packages/logging/src/sink.ts`) and
wraps the `@axiomhq/js` batching client (background batching + retries, with an
`onError` hook → console so it never recurses into app logging). PostHog is
**kept** — clients still send to it for product analytics. Axiom is the unified,
SQL-queryable copy.

## The `freebuff` dataset

One dataset holds everything. An **event** is just a log row with `event`
populated. Each ingested event has these fields (`LogRow` →
`common/src/types/contracts/logs.ts`):

| field | notes |
| --- | --- |
| `_time` | event time (Axiom's time field) |
| `id` | UUID |
| `level` | `debug`/`info`/`warn`/`error`/`fatal` |
| `source` | `server`/`cli`/`browser` |
| `service` | `web`/`agent-runtime`/`freebuff-web`/`cli` |
| `env` | `dev`/`test`/`prod` |
| `event` | AnalyticsEvent name, else null |
| `message` | formatted log message |
| `user_id`, `client_session_id`, `client_request_id`, `fingerprint_id` | identity/correlation |
| `data` | the variable structured payload, stored as a **JSON string** (use `parse_json(data)` in APL to dig in) |

`data` is serialized to a single string field on purpose — it keeps the dataset's
field cardinality stable instead of exploding into thousands of auto-detected
columns.

## Cost

Axiom bills primarily by **ingested GB + retention**, and most plans include
query compute — so unlike BigQuery there is **no per-query bytes-billed cap to
set**. The levers that matter:

1. **Ingest volume** — controlled at the source:
   - `AXIOM_LOGS_MIN_LEVEL` (default `info`) drops `debug` before it's sent.
   - The CLI shipper skips `debug` and summarizes non-error payloads (mirrors
     the PostHog redaction), so we don't ship full payloads for routine logs.
   - Per-record `data` is truncated to ~64 KB (`MAX_LOG_DATA_BYTES`).
2. **Retention** — set on the Axiom dataset (in the Axiom UI), not in code.
3. **Query** — narrow `--since` windows are faster/cheaper even though they
   aren't separately billed.

`scripts/logs/logs-volume.ts` shows which `service`/`level` drives ingest so you
can raise the min level or sample a noisy source.

## Query scripts

| script | purpose |
| --- | --- |
| `scripts/logs/query-logs.ts` | general query (filters, `--full`, `--dry-run`) |
| `scripts/logs/logs-volume.ts` | ingest volume by service/level |
| `scripts/logs/lib.ts` | shared helpers (Axiom client, APL builders, time range) |

`query-logs.ts` flags: `--since`, `--from/--to`, `--level`, `--source`,
`--service`, `--event`, `--has-event`, `--user`, `--session`, `--request`,
`--grep`, `--count`, `--count-by <field>`, `--full`, `--limit`, `--dataset`,
`--json`, `--dry-run`.

## APL recipes

```bash
# Error rate spike triage: recent errors
bun scripts/logs/query-logs.ts --since 1h --level error --limit 200

# Trace a single agent run end-to-end
bun scripts/logs/query-logs.ts --since 24h --request <run_id> --full --json

# Did a new feature emit its events?
bun scripts/logs/query-logs.ts --since 2h --event api.feature_x_used --has-event

# Event volumes (which events are flowing?) and top users
bun scripts/logs/query-logs.ts --since 24h --has-event --count-by event
bun scripts/logs/query-logs.ts --since 24h --event cli.login --count-by user_id
```

### Funnel example: CLI install → login (last 7d)

`cli.app_launched` ships even pre-login (anonymously), so both ends of the
funnel are in Axiom. Correlate on `client_session_id` (the anonymous run id).

```kusto
['freebuff']
| where _time >= ago(7d) and source == "cli"
| where event in ("cli.app_launched", "cli.login")
| summarize launches  = dcountif(client_session_id, event == "cli.app_launched"),
            logins     = dcountif(client_session_id, event == "cli.login")
  by bin(_time, 1d)
| extend login_rate = round(100.0 * logins / launches, 1)
| sort by _time asc
```

Raw APL (e.g. in the Axiom console) — note the `parse_json` to read `data`:

```kusto
['freebuff']
| where _time >= ago(6h)
| where level == "error" and service == "web"
| extend d = parse_json(data)
| project _time, message, user_id, err = d.error
| sort by _time desc
| limit 100
```

## Adding fields / new log shapes

- **Just log structured data.** `logger.info({ user_id, foo, bar }, 'msg')` —
  `user_id`/`client_session_id`/`client_request_id`/`fingerprint_id` are promoted
  to top-level event fields; everything else is serialized into `data` (read via
  `parse_json(data).foo`). No schema change needed.
- **Promote a field to top-level** (so you can filter without `parse_json`) by
  adding it to `LogRow` (`common/src/types/contracts/logs.ts`) and mapping it in
  `web/src/util/logger.ts` / `common/src/util/log-ingest.ts` and the sink's
  `toEvent` (`packages/logging/src/sink.ts`). Axiom is schemaless — new fields
  appear automatically on next ingest.

## Conventions

Hard-won rules for logs that are actually useful when something breaks (each one
cost real debugging time when it was missing):

1. **`logger.*`, never `console.*`, for anything you'd want to query.** Only
   `logger.*` reaches Axiom; `console.log/error` goes to container stdout
   (`render logs`) and is invisible to the query scripts. A `console.error` in a
   request handler is, for observability purposes, a silent failure.
2. **Summarize payloads you redact — don't just drop them.** When you omit a
   request/response body for size or PII (e.g. `messagesOmitted: true`), attach a
   compact *shape* summary instead: counts, byte sizes, content-part types. The
   redaction reason doesn't apply to metadata *about* the payload, and that
   metadata is usually what triages the failure. `summarizeMessagesForLog()`
   (`web/src/llm-api/log-summary.ts`) does this for chat-completion messages —
   it turns an opaque `messageCount: 3` into "1 image, 78 bytes, image/png",
   which is the difference between "bad image" and "broken pipeline".
3. **Carry correlation keys across service boundaries.** When a request crosses
   into another service under a *service account* (e.g. freebuff chat → the
   completions backend, which sees the shared `freebuff-web-service` user), log
   the originating ids so you can pivot back to the real user, thread, and
   `run_id`. `client_request_id`/`run_id` are promoted pivot fields — emit them
   on both sides. For freebuff chat these ride in `codebuff_metadata`
   (`freebuff_chat_user_id` / `freebuff_chat_thread_id`).
4. **Surface the underlying error, not the user-facing one.** When you catch a
   provider/SDK error and return a generic "something went wrong" to the client,
   the *original* error (status, provider, message) still belongs in the
   structured `data`. A "please try again" with nothing behind it in Axiom is
   unactionable.
5. **Log the happy path for risky features, at `info`.** One structured line per
   image-chat ("Chat image attachments resolved", with sizes/types) is
   negligible volume but gives you a denominator and confirms the feature is
   exercised — cheaper than reconstructing it from errors. Reserve `debug`
   (dropped before ingest by default; see [Cost](#cost)) for genuinely
   high-volume detail.

## Configuration (env)

Runtime toggles (read directly from `process.env`):

| var | default | effect |
| --- | --- | --- |
| `AXIOM_API_TOKEN` | — | Axiom **ingest** token, used by the sink on the services. Required to enable. |
| `AXIOM_QUERY_TOKEN` | — | Axiom **query** token, used by the `scripts/logs/` query scripts (separate from the ingest token). |
| `AXIOM_ORG_ID` | — | only needed for a personal token |
| `AXIOM_DATASET` | `freebuff[-dev]` | dataset name |
| `AXIOM_LOGS_ENABLED` | on in prod | force the server/endpoint sink on/off (`true`/`false`) |
| `AXIOM_LOGS_MIN_LEVEL` | `info` | drop rows below this level before ingest |
| `CODEBUFF_SHIP_LOGS` | on outside dev/test | CLI → `/api/logs` shipping on/off |

Both the **`web`** and **`freebuff-web`** services need `AXIOM_API_TOKEN` (with
ingest permission). Without it the sink disables gracefully (logs are dropped, a
one-time console error is emitted). `freebuff-web` already uses Axiom elsewhere
(`AXIOM_API_TOKEN` in its Convex monitoring), so the token likely exists there.
The query scripts use a separate `AXIOM_QUERY_TOKEN` (query permission) — the
ingest token can't read.
