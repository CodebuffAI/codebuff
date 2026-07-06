# Freebuff Runner

Long-lived Bun worker that executes Freebuff agent turns off Convex action
compute (design: `docs/freebuff-render-harness.md`). It subscribes to
runner-dispatched `queued` rows in `freebuff_agent_runs`, claims them with a
CAS mutation, runs the codebuff SDK harness in-process, and streams batched
events back through `recordRunEventBatch`.

## Rollout

Dispatch is gated by the `freebuff_runner_enabled` feature flag
(`convex/featureFlags.ts`), which now DEFAULTS ON for Freebuff, Codex, and
Claude Code sends. Kill switch: create a feature_flags row with that key and
rollout_strategy 'disabled' — sends instantly fall back to the legacy Convex
action (Freebuff) / workflow (Codex/Claude) paths. Runs queued while no runner
is alive are reaped by the sweep cron after 10 minutes.

⚠️ DEPLOY ORDER: bring this Render worker up (with prod env) BEFORE pushing
the Convex deploy that defaults the flag on, or sends will queue with nothing
to claim them.

## Environment

- `CONVEX_URL` — deployment URL (e.g. https://<name>.convex.cloud)
- `CONVEX_DEPLOY_KEY` — deploy/admin key for that deployment (internal
  functions + subscriptions). Keep scoped to this service's env.
- `AXIOM_API_TOKEN` (+ optional `AXIOM_ORG_ID`, `AXIOM_DATASET`,
  `AXIOM_LOGS_ENABLED`) — ships runner lifecycle / claim / crash logs into the
  unified `freebuff` dataset as `service=freebuff-runner`.
- `CODEBUFF_API_KEY` — Freebuff Web service account PAT
  (docs/freebuff-web-service-account.md)
- `NEXT_PUBLIC_CODEBUFF_APP_URL` — Codebuff backend base URL for the SDK
  (`https://www.codebuff.com` in prod; without it the SDK may use a bundled
  dev URL and fail with "Network request failed")
- `DAYTONA_API_KEY` (+ `DAYTONA_API_KEY_LEGACY` / `DAYTONA_API_KEY_NEW`,
  `DAYTONA_SNAPSHOT_ID`) — sandbox access, same values as the Convex env
- `VLY_INTEGRATION_KEY`, `VLY_SANDBOX_USAGE_*`, `VLY_STATS_SCRIPTS_URL` —
  optional, same semantics as the Convex env
- Codex / Claude Code runs additionally need (copy from Convex env):
  - `BYOK_ENCRYPTION_KEY` / `CODEX_AUTH_ENCRYPTION_KEY` /
    `CONVEX_TOKEN_ENCRYPTION_KEY` — decrypt user BYOK keys and stored ChatGPT
    OAuth payloads (byokAuth/codexAuth read whichever is set)
  - `CODEX_AUTH_HASH_SALT` — optional, falls back to the encryption secret
  - `GITHUB_APP_PRIVATE_KEY` — refresh `origin` auth on connected-repo
    (Freebuff Cloud) projects before CLI runs
- `RUNNER_MAX_CONCURRENT_RUNS` — claim cap per instance (default 25; work is
  I/O-bound so instances multiplex many runs)
- `FREEBUFF_TURN_LIMIT_MS` — wall-clock limit per turn (default 60 min; must
  stay under `RUNNER_TURN_DEADLINE_MS` in `timeLimits.ts`, which the message
  watchdog uses)

## Render service

Background worker (no public port), same repo:

- Build command: `bun install`
- Start command: `bun --cwd freebuff/runner start`
- Instances: start with 1–2. Scale on claim latency, not CPU.
- Graceful shutdown: on SIGTERM the worker stops claiming, aborts active
  turns, persists full-context resume state to Convex storage, and requeues
  the runs; the replacement instance resumes them mid-turn. Render's ~30s
  grace is enough (persist takes <5s per run).

## Local dev

```bash
# assemble env (see README section above), then:
bun --cwd freebuff/runner dev
```

Point `CONVEX_URL`/`CONVEX_DEPLOY_KEY` at your dev deployment, enable the
`freebuff_runner_enabled` flag there, and send a Freebuff message from the web
app — the local runner claims and executes it.

## Code layout

- `src/main.ts` — queue subscription, CAS claim loop, concurrency cap,
  per-run cancel subscription, SIGTERM requeue
- `src/runTurn.ts` — the turn loop (port of the Convex action
  `executeFreebuff.runFreebuffAgent`, minus the 10-minute continuation
  machinery)
- `src/eventBatcher.ts` — batches all stream events into one
  `recordRunEventBatch` mutation per ~2s + 30s heartbeats
- `src/convexBridge.ts` — RunnerCtx (runQuery/runMutation/runAction/storage)
  over ConvexHttpClient + websocket subscription client
- `src/harness.ts` / `src/webcontainerTools.ts` — ctx-free harness logic
  copied from the action file; the action path stays untouched during rollout
  and is deleted (with these copies unified) once the runner is at 100%
