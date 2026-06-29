# Environment Variables

## Quick Rules

- Public client env: `NEXT_PUBLIC_*` only, validated in `common/src/env-schema.ts` (used via `@codebuff/common/env`).
- LLM provider keys: validated in `packages/internal/src/env-schema.ts` (used via `@codebuff/internal/env`). The hosted-backend DB/auth/email server secrets have been removed from this repo.
- Runtime/OS env: pass typed snapshots instead of reading `process.env` throughout the codebase.
- `IPINFO_TOKEN` is only relevant to legacy/upstream hosted flows. Openbuff local/BYOK CLI usage does not require it.
- `CODEBUFF_FULL_TELEMETRY=true` or `CODEBUFF_FULL_TELEMETRY_IDS=user-id,email@example.com`
  disables client analytics sampling for targeted debugging. Use sparingly because it can send full CLI log payloads.

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

## Openbuff and Codebuff Environment Variables

Document only environment variables that are implemented in code. During the fork transition, several `CODEBUFF_*` names remain supported only as legacy compatibility aliases or existing internal names:

- `OPENBUFF_LOCAL_MODE` controls local/BYOK mode. `CODEBUFF_LOCAL_MODE` is NOT supported (removed in the BYOK purge).
- `OPENBUFF_PROVIDER_CONFIG` points to provider configuration JSON. `CODEBUFF_PROVIDER_CONFIG` is NOT supported (removed in the BYOK purge).
- `CODEBUFF_API_KEY` is a legacy upstream compatibility name for Codebuff API authentication and any live tests that still exercise that compatibility path. Openbuff local/BYOK provider mode does not require a Codebuff API key.
- `CODEBUFF_GIT_BASH_PATH` is the Windows bash path override used by the SDK terminal command helper.
- `CODEBUFF_CHATGPT_OAUTH_TOKEN` is the legacy ChatGPT OAuth token name. `OPENBUFF_CHATGPT_OAUTH_TOKEN` is implemented as an alias; the SDK resolves `CODEBUFF_CHATGPT_OAUTH_TOKEN ?? OPENBUFF_CHATGPT_OAUTH_TOKEN` (`sdk/src/env.ts`), so the legacy name takes precedence over the alias (reversed from the API-key ordering).

`CODEBUFF_API_KEY` functions as a runtime fallback (`OPENBUFF_API_KEY ?? CODEBUFF_API_KEY` in `sdk/src/env.ts`, Openbuff primary). `CODEBUFF_CHATGPT_OAUTH_TOKEN` also has an `OPENBUFF_*` alias but with reversed precedence (legacy name primary). `CODEBUFF_GIT_BASH_PATH` is the sole name with no Openbuff alias implemented.

Do not document an `OPENBUFF_*` alias unless the code implements it.

## Releases

Release scripts read `OPENBUFF_GITHUB_TOKEN` (primary) or `CODEBUFF_GITHUB_TOKEN` (compatibility fallback).
