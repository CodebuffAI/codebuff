# SPEC — BYOK-only CLI/SDK cleanup

## Overview
Openbuff must be unmistakably a local-first, BYOK-only CLI/SDK project. The repository currently still contains or references hosted Codebuff-era surfaces: web app, billing, credits, subscriptions, hosted fallback, dashboard/org flows, freebuff, and provider-credit language. Those signals cause agents and contributors to infer the wrong product shape.

This cleanup should make the repo read as: Openbuff is a CLI/SDK tool that runs with user-configured providers and user-owned credentials. There is no Openbuff-hosted backend fallback, Openbuff credit system, subscription requirement, required web dashboard, or product-hosted OAuth login. The only OAuth retained is provider/subscription OAuth for user-owned model access, such as ChatGPT/OpenAI subscription-style connections.

## Goals
- Create a rollback checkpoint before starting the cleanup by committing the current worktree exactly as requested by the user.
- Remove or quarantine non-CLI/non-SDK product surfaces, especially web, billing, credits, subscriptions, freebuff, hosted dashboard, hosted fallback, and org/repo management code.
- Preserve CLI, SDK, common tool schemas/utilities, agents, local provider configuration, plan artifacts, deterministic edit tooling, and tests required for those systems.
- Preserve provider OAuth only where it represents user-owned provider/subscription access, e.g. ChatGPT/OpenAI subscription OAuth. Do not preserve product-hosted auth/OAuth flows.
- Update docs, knowledge files, and agent prompts so BYOK-only is a hard invariant.
- Add static checks/tests that prevent reintroducing hosted/product-credit language in user-facing or agent-facing surfaces unless explicitly allowlisted as legacy compatibility.
- Rebuild bundled agents and CLI after code/docs cleanup.

## Non-goals
- Do not remove user-owned provider APIs or OAuth flows needed for provider/subscription authentication.
- Do not rename compatibility package names such as `@codebuff/*` unless doing so is part of a separately validated package migration.
- Do not break existing Openbuff CLI local provider configuration (`openbuff.json`, `OPENBUFF_*`, OpenAI-compatible/Anthropic-compatible providers, OpenRouter, Ollama/LM Studio, ChatGPT/Codex subscription OAuth where supported).
- Do not keep hosted/cloud code merely because upstream Codebuff used it.
- Do not attempt a full npm package identity migration in this cleanup unless it is required to keep CLI/SDK builds passing.

## Key requirements
1. **Rollback checkpoint**
   - Before any cleanup source edits, commit the current worktree.
   - Use a message that makes it clear this is a pre-cleanup checkpoint, e.g. `chore: checkpoint before byok cleanup`.
   - Verify status after commit and record the commit hash in STATUS.md.

2. **Repository identity invariant**
   - Add/strengthen this invariant in `AGENTS.md`, root `knowledge.md`, `cli/knowledge.md`, `README.md`, `CONTRIBUTING.md`, and relevant docs:
     - “Openbuff is BYOK-only and CLI/SDK-focused. There is no Openbuff-hosted backend fallback, credit balance, subscription, or required product OAuth login.”
   - Clarify compatibility aliases:
     - `@codebuff/*`, `CodebuffClient`, `CODEBUFF_*`, `codebuff.json`, and `codebuff --local` are compatibility surfaces only, not product direction.

3. **Remove non-CLI/non-SDK surfaces**
   - Remove the `web/` app if no remaining CLI/SDK build path depends on it.
   - Remove `packages/billing` and other hosted-only packages if no remaining CLI/SDK build path depends on them.
   - Remove or rewrite scripts that only exist for hosted billing/cloud analysis/freebuff.
   - Remove root package scripts that target web, billing, freebuff, hosted dashboard, hosted DB, hosted smoke tests, and hosted-only analytics.
   - Remove generated/config references that only support hosted web/billing.

4. **CLI cleanup**
   - Remove CLI UI/components/hooks/state for Openbuff credits/out-of-credits/subscription prompts if they are no longer used.
   - Rewrite `/usage` and usage wording, if retained, to mean local token/provider usage only, not Openbuff credits.
   - Remove hosted fallback API messaging.
   - Keep provider setup and local model routing prominent.

5. **SDK cleanup**
   - Remove Openbuff credit consumption/account-balance assumptions.
   - Preserve model provider logic and provider-owned OAuth/subscription handling.
   - Make hosted compatibility code explicit if retained for legacy API compatibility, or remove it if not needed for CLI/SDK.

6. **Agent prompt cleanup**
   - Update base agent prompts (`agents/base2/base2.ts`, `agents/base2/base-deep.ts`, and any agent prompt templates) to state BYOK-only and CLI/SDK-focused.
   - Remove wording like “provider API credits” if it can be mistaken for Openbuff credits; use “provider billing/quota/token usage” instead.

7. **Static guardrails**
   - Add a focused test/script that scans user-facing docs/prompts/CLI UI for forbidden hosted-product terminology.
   - Forbidden by default: Openbuff credits, subscription, out-of-credits, hosted fallback, hosted backend, freebuff, Stripe billing, product OAuth login.
   - Allowlist only clearly marked legacy compatibility files, provider-owned OAuth/subscription docs, or archived migration notes.

8. **Validation and rebuild**
   - Run root typecheck.
   - Run full CLI tests.
   - Run focused SDK/common/agent tests touched by cleanup.
   - Run static guardrail test.
   - Rebuild bundled agents.
   - Rebuild CLI binary.
   - Run final CLI typecheck after regenerated bundled agents.

## Relevant systems and candidate files/directories
- Root identity/docs/config:
  - `README.md`
  - `README.zh-CN.md`
  - `CONTRIBUTING.md`
  - `AGENTS.md`
  - `knowledge.md`
  - `package.json`
  - `tsconfig.json`
  - `openbuff.json`
- CLI:
  - `cli/package.json`
  - `cli/knowledge.md`
  - `cli/src/**`
  - likely hosted/credits surfaces: `cli/src/components/out-of-credits-banner.tsx`, `cli/src/utils/usage-banner-state.ts`, `cli/src/hooks/use-activity-query.ts`, related tests/imports
- SDK:
  - `sdk/src/impl/llm.ts`
  - `sdk/src/impl/model-provider.ts`
  - `sdk/src/run.ts`
  - SDK tests around model provider/OAuth/local providers
- Agents:
  - `agents/base2/base2.ts`
  - `agents/base2/base-deep.ts`
  - agent tests and bundled generated output in CLI after rebuild
- Common/tooling:
  - `common/src/**`
  - `packages/agent-runtime/src/**`
- Hosted-only candidates:
  - `web/`
  - `packages/billing/`
  - `packages/bigquery/` if only usage analytics for hosted Codebuff
  - hosted-only scripts under `scripts/` such as credit grants, subscriber/profitability/usage email/export scripts, freebuff scripts, Stripe/Discord/web scripts
- Docs:
  - `docs/local-mode.md`
  - `docs/architecture.md`
  - `docs/request-flow.md`
  - `docs/codebuff-to-openbuff-migration.md`
  - `docs/openbuff-provider-model-setup-ux.md`
  - `docs/testing.md`

## Acceptance criteria
- A fresh reader or agent sees BYOK-only CLI/SDK as the dominant project invariant from README, AGENTS, knowledge files, and architecture docs.
- No active product path references Openbuff credits, Openbuff subscription, hosted fallback, hosted dashboard, or required Openbuff OAuth login.
- Hosted web/billing/freebuff surfaces are removed from active repo/package scripts, or explicitly archived/allowlisted if temporarily retained.
- Provider-owned OAuth/subscription behavior remains intact and documented as provider access, not Openbuff product auth.
- Static guardrail test fails if new user-facing/agent-facing hosted-product language is introduced outside allowlisted files.
- Typecheck, CLI tests, relevant focused tests, bundled-agent rebuild, CLI binary build, and final CLI typecheck pass.