# Environment Variables

## Quick Rules

- Public client env: `NEXT_PUBLIC_*` only, validated in `common/src/env-schema.ts` (used via `@codebuff/common/env`).
- Server secrets: validated in `packages/internal/src/env-schema.ts` (used via `@codebuff/internal/env`).
- Runtime/OS env: pass typed snapshots instead of reading `process.env` throughout the codebase.
- `IPINFO_TOKEN` is required; free-mode country gating uses it to check IPinfo privacy signals for VPN/proxy/Tor/relay/hosting traffic.
- `SPUR_TOKEN` is required; VPN/proxy/Tor/residential-proxy privacy signals use Spur Context API corroboration.
- `SCAMALYTICS_API_KEY` is required; when IPinfo reports privacy or hosting/service signals, free-mode gating also checks Scamalytics for a fraud score and proxy/Tor/VPN evidence. In allowlisted countries, full access requires both Spur and Scamalytics to return clean follow-up results. Provider failures, Scamalytics outages/API errors, ambiguous results, VPN/generic-proxy signals, and hosting/datacenter signals fall back to limited access. Residential proxy is blocked only when Scamalytics also reports residential/proxy evidence or a medium+ fraud score, as are Cloudflare Tor or Tor corroborated by another provider.
- `CODEBUFF_FULL_TELEMETRY=true` or `CODEBUFF_FULL_TELEMETRY_IDS=user-id,email@example.com`
  disables client analytics sampling for targeted debugging. Use sparingly because it can send full CLI log payloads.
- Axiom logs sink toggles (runtime, read directly from `process.env` like
  `CODEBUFF_FULL_TELEMETRY`; not in the typed schema). See `docs/logging.md`:
  - `AXIOM_API_TOKEN` — Axiom token (ingest on the services, query for the scripts). Required to enable.
  - `AXIOM_ORG_ID` — only needed for a personal token.
  - `AXIOM_DATASET` (default `codebuff-logs[-dev]`) — dataset name.
  - `AXIOM_LOGS_ENABLED` (`true`/`false`, default: on in prod) — server/endpoint sink on/off.
  - `AXIOM_LOGS_MIN_LEVEL` (default `info`) — drop rows below this level before ingest.
  - `CODEBUFF_SHIP_LOGS` (`true`/`false`, default: on outside dev/test) — CLI → `/api/logs` shipping.
  - Both the `web` and `freebuff-web` services need `AXIOM_API_TOKEN`; without it the sink disables gracefully.

## Env DI Helpers

- Base contracts: `common/src/types/contracts/env.ts` (`BaseEnv`, `BaseCiEnv`, `ClientEnv`, `CiEnv`)
- Helpers: `common/src/env-process.ts`, `common/src/env-ci.ts`
- Test helpers: `common/src/testing-env-process.ts`, `common/src/testing-env-ci.ts`
- CLI: `cli/src/utils/env.ts` (`getCliEnv`)
- CLI test helpers: `cli/src/testing/env.ts` (`createTestCliEnv`)
- SDK: `sdk/src/env.ts` (`getSdkEnv`)
- SDK test helpers: `sdk/src/testing/env.ts` (`createTestSdkEnv`)

## Loading Order

Bun loads (highest precedence last):

- `.env.local` (Infisical-synced secrets, gitignored)
- `.env.development.local` (worktree overrides like ports, gitignored)

## Releases

Release scripts read `CODEBUFF_GITHUB_TOKEN`.
