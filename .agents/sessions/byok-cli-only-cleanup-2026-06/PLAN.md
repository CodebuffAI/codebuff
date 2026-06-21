# PLAN — BYOK-only CLI/SDK cleanup

## Current status
- Status: planned, not implemented.
- Source changes: none from this plan session.
- Durable artifacts:
  - SPEC.md created.
  - PLAN.md created here.
  - STATUS.md and LESSONS.md must be kept current during execution.

## Execution rules
- First implementation action must be the requested rollback checkpoint commit of the current worktree.
- After each milestone, update `.agents/sessions/byok-cli-only-cleanup-2026-06/STATUS.md` with `update_plan_status`.
- Add newly discovered gotchas/decisions to `.agents/sessions/byok-cli-only-cleanup-2026-06/LESSONS.md` with `update_plan_status`.
- If scope changes materially, rewrite SPEC.md and PLAN.md with `create_plan` before continuing.
- Do not remove provider-owned OAuth/subscription support. Only remove product-hosted Openbuff/Codebuff auth, billing, credit, and dashboard surfaces.

## Milestone 0 — Rollback checkpoint
Status: todo

Tasks:
- Verify current git status and staged state.
- Commit the current worktree before any cleanup edits.
- Suggested commit message: `chore: checkpoint before byok cleanup`.
- Record commit hash in STATUS.md.

Validation:
- `git status` shows cleanup work will start from a new checkpoint commit.
- STATUS.md records checkpoint hash and timestamp.

Risks:
- Worktree is large and contains many unrelated changes. Commit must include the whole current state unless user narrows scope.

## Milestone 1 — Dependency and surface inventory
Status: todo

Tasks:
- Build an explicit removal map:
  - Keep: `cli/`, `sdk/`, `common/`, `agents/`, `packages/agent-runtime/`, local provider config, deterministic edit tooling, tests required for those systems.
  - Remove candidates: `web/`, `packages/billing/`, hosted analytics packages, freebuff scripts, hosted-only scripts, hosted-only docs/content.
  - Review before deleting: any package imported by CLI/SDK/agents/common/runtime.
- Use code search for imports into `web/`, `packages/billing`, hosted scripts, and credit/subscription UI.
- Identify package.json scripts that reference removed surfaces.

Validation:
- Produce a checklist of directories/scripts to remove vs retain.
- Confirm no retained package imports from a removed directory.

## Milestone 2 — Remove hosted product surfaces
Status: todo

Tasks:
- Remove `web/` if inventory confirms it is not required by CLI/SDK builds.
- Remove `packages/billing/` and hosted-only billing/credit packages if unreferenced by retained systems.
- Remove freebuff, Stripe, hosted dashboard, org/repo management, hosted analytics, hosted DB, hosted Discord registration, and credit grant scripts where they are not CLI/SDK relevant.
- Update root workspace/package scripts and configs to no longer reference removed surfaces.
- Update tsconfig/project references if they include removed packages.

Validation:
- `bun install` should not be required unless package manifests changed in a way that needs lockfile updates; if package manifests change, update lockfile with the project package manager.
- `bun run typecheck` progresses without missing removed package references.

Risks:
- Root package scripts may assume web packages exist.
- Lockfile may need regeneration after package removals.

## Milestone 3 — CLI hosted-credit cleanup
Status: todo

Tasks:
- Remove credit/out-of-credit/subscription banners, hooks, state, commands, and tests from CLI if they represent Openbuff product credits.
- Reword `/usage` and related UI to provider token/quota usage only if retained.
- Remove hosted fallback copy from CLI docs/help/setup.
- Ensure `/setup` and provider flows lead with `openbuff.json`, `OPENBUFF_*`, and user-owned provider credentials.

Candidate files:
- `cli/src/components/out-of-credits-banner.tsx`
- `cli/src/hooks/use-activity-query.ts`
- `cli/src/utils/usage-banner-state.ts`
- CLI tests referencing credits/subscriptions/hosted fallback
- `cli/package.json` hosted env/script defaults

Validation:
- Full CLI tests pass.
- CLI typecheck passes.
- Optional tmux smoke confirms setup/help wording reads BYOK-only.

## Milestone 4 — SDK/provider cleanup
Status: todo

Tasks:
- Remove SDK Openbuff credit consumption or balance assumptions.
- Preserve provider-owned OAuth/subscription flows such as ChatGPT/OpenAI subscription OAuth.
- Rename/reword ambiguous credit helpers to provider cost/quota/token terminology where retained.
- Ensure model-provider tests cover local/BYOK provider config and provider-owned OAuth exception.

Candidate files:
- `sdk/src/impl/llm.ts`
- `sdk/src/impl/model-provider.ts`
- `sdk/src/run.ts`
- `sdk/src/__tests__/model-provider.test.ts`
- `sdk/src/__tests__/run-handle-event.test.ts`

Validation:
- SDK focused tests pass.
- Root typecheck passes.

## Milestone 5 — Documentation and agent prompt invariant
Status: todo

Tasks:
- Update README, README.zh-CN, CONTRIBUTING, AGENTS, root knowledge, CLI knowledge, and core docs to state the hard invariant:
  - Openbuff is BYOK-only and CLI/SDK-focused.
  - No Openbuff-hosted backend fallback.
  - No Openbuff credits or subscription.
  - No required product OAuth login.
  - Provider-owned OAuth/subscription connections are allowed.
- Clarify compatibility aliases as legacy compatibility only:
  - `@codebuff/*`, `CodebuffClient`, `CODEBUFF_*`, `codebuff.json`, and `codebuff --local`.
- Update architecture/request-flow docs to remove hosted/cloud product framing.

Candidate files:
- `README.md`
- `README.zh-CN.md`
- `CONTRIBUTING.md`
- `AGENTS.md`
- `knowledge.md`
- `cli/knowledge.md`
- `docs/local-mode.md`
- `docs/architecture.md`
- `docs/request-flow.md`
- `docs/codebuff-to-openbuff-migration.md`
- `docs/openbuff-provider-model-setup-ux.md`

Validation:
- Static guardrail test passes.
- Docs no longer instruct users to configure hosted backend/credits for CLI usage.

## Milestone 6 — Static guardrails
Status: todo

Tasks:
- Add a focused test/script that scans active user-facing and agent-facing surfaces for forbidden hosted-product language.
- Default forbidden terms or patterns:
  - `Openbuff credits`, `out of credits`, `subscription`, `Stripe`, `billing`, `freebuff`, `hosted fallback`, `hosted backend`, product `OAuth login`, hosted dashboard.
- Allowlist:
  - Provider billing/quota/token usage.
  - Provider-owned OAuth/subscription docs.
  - Explicitly marked legacy compatibility/migration notes.
  - Archived files, if any are intentionally retained.
- Wire the guardrail into an existing test package if practical.

Validation:
- Guardrail test fails before allowlist cleanup for active hosted wording and passes after cleanup.
- Full test suite remains stable.

## Milestone 7 — Rebuild and final validation
Status: todo

Tasks:
- Run root typecheck.
- Run full CLI tests.
- Run relevant SDK/common/agent/runtime focused tests touched by cleanup.
- Run static guardrail test.
- Rebuild bundled agents: `bun run --cwd=cli prebuild:agents`.
- Rebuild CLI binary: `bun run --cwd=cli build:binary`.
- Run final CLI typecheck after regenerated bundled agents.

Validation gates:
- `bun run typecheck`
- `bun run --cwd=cli test`
- `bun run --cwd=cli typecheck`
- focused SDK/common/agent tests based on touched files
- bundled-agent rebuild succeeds
- CLI binary rebuild succeeds

## Dependencies and ordering constraints
- Milestone 0 must happen before source cleanup.
- Milestone 1 must happen before deleting directories/packages.
- Milestone 2 should happen before docs/prompt final wording where possible, so docs match final shape.
- Milestone 6 should happen after most wording cleanup but before final validation.
- Milestone 7 happens last, after generated files are updated.

## Open questions
- Whether to delete hosted-only directories entirely or move them to an archive. User explicitly allowed removal if unrelated to CLI, so default is deletion after dependency verification.
- Whether to keep any `web/` content docs as static docs source. Default is delete web app; migrate only essential docs to `docs/`/README if needed.
- Whether `packages/bigquery` or hosted analytics scripts have any CLI/SDK value. Default is remove unless dependency inventory proves otherwise.

## Resume instructions
1. Open `.agents/sessions/byok-cli-only-cleanup-2026-06/STATUS.md`.
2. Continue at the first unchecked task.
3. Before implementation, perform Milestone 0 checkpoint commit.
4. After each milestone, update STATUS.md with `update_plan_status`.
5. Add gotchas/decisions to LESSONS.md with `update_plan_status`.
6. If a validation fails, follow read → targeted fix → rerun same validation.