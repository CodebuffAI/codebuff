# Local-CLI Harness Remediation Spec

Source audit: `.agents/sessions/harness-audit-2026-06-30/AUDIT-REPORT.md`
Coverage source: `.agents/sessions/harness-audit-2026-06-30/COVERAGE-MATRIX.md`
Updated: 2026-07-01

## Overview

Recalibrate the harness audit remediation around how Openbuff actually works: a local-first CLI/SDK with BYOK provider calls made directly from the user's machine, no hosted backend, no web app surface, no billing, and no Openbuff-managed API/security perimeter. Treat the audit as a raw findings inventory, not an authoritative severity/prioritization list.

The remediation program should keep findings that affect local filesystem safety, local process safety, stale edit/state correctness, local tool/schema contracts, CLI/runtime reliability, performance, and docs drift. It should downgrade or discard recommendations that assume a hosted web/backend/billing/auth product or introduce guards that would break current local/BYOK behavior.

## Controlling product model

- Openbuff is a local CLI plus SDK.
- All tools execute locally on the user's machine.
- LLM requests go directly from the user's machine to user-configured providers.
- API keys are local BYOK configuration/env values; Openbuff does not broker them through a hosted backend.
- Remote MCP and custom provider endpoints are optional local integrations chosen by the user.
- There is no hosted web surface, billing system, subscription/credit server, Openbuff API gateway, cookie/session auth, CORS boundary, or centralized account/tenant model in scope.

## Goals

- Re-triage every audit finding against the local-CLI/BYOK model.
- Keep and prioritize issues that can cause local data loss, edits outside the project, runaway local processes, stale edit authorization, hangs, inconsistent local tool behavior, or confusing docs.
- Remove, downgrade, or defer plan work that assumes hosted backend/web/billing/auth risks.
- Avoid adding restrictive guards that would break intended local workflows such as custom provider endpoints, local Ollama/OpenAI-compatible URLs, local MCP servers, explicit user cwd selection, and compatibility aliases.
- Add a cleanup/docs-formatting lane to remove unnecessary dead/stale code and align docs wording with the local CLI product model.
- Preserve unrelated dirty-tree work.

## Non-goals

- Do not implement a hosted-product security model.
- Do not add CORS/cookie/session/auth/billing/account/tenant guards.
- Do not block user-configured provider endpoints solely because they are cross-origin; this is expected BYOK/local behavior.
- Do not treat local provider API keys as Openbuff-hosted secrets; treat them as local user configuration that must not be accidentally logged or sent somewhere unintended by Openbuff defaults.
- Do not remove compatibility aliases or optional integrations without verifying current usage and migration impact.
- Do not rewrite the CLI UI or SDK architecture wholesale.
- Do not touch unrelated user changes in the dirty tree.

## Reclassification rules

Use these categories in the remediation tracker and status updates:

1. **Keep / high priority — local safety**
   - Path traversal, symlink escape, accidental access/edit outside the project root where a tool claims project containment.
   - Shell/subprocess cwd containment where the UI/tool contract promises project-local execution.
   - Destructive local edits without fresh read/capability validation.
   - Runaway background jobs, unbounded buffers, cancellation failures that keep local work running after abort/timeout.

2. **Keep / high priority — correctness/state**
   - Stale `basedOnRead` authorization, failed reads granting edit permission, stale reviewer/gate state, stale index/cache results after edits.
   - CLI stream ownership races and eval timeout races that can mutate state after cancellation.

3. **Keep / normal priority — contract/reliability/performance**
   - SDK/runtime/common tool-list drift.
   - Handler/schema mismatch.
   - Setup/config merge bugs.
   - Diagnostics, parse failures, error formatting, registry consistency, performance hot spots.

4. **Downgrade — optional local integration risk**
   - Remote MCP header cache keys, provider discovery auth, and custom endpoints. These matter as local integration correctness/secret-hygiene issues, not hosted security vulnerabilities. Fix only when the change preserves explicit user-configured workflows.

5. **Discard or defer as out of scope**
   - Hosted web/backend/billing/auth/CORS/cookie/account/tenant assumptions.
   - Guards that would prohibit intended local custom endpoints, local model servers, or explicit user-controlled integrations.

## Requirements

### R1 — Local filesystem and project-boundary safety

- Verify which tools promise project-root containment and enforce it consistently with realpath-aware checks.
- Preserve intended explicit local workflows; if a tool intentionally permits user-selected absolute paths, document that contract rather than silently breaking it.
- Prioritize `run_terminal_command.cwd`, `code_search.cwd`, `read_outline`, file/edit tools, and gate path normalization only where the current contract claims project-local behavior.
- Add symlink/absolute-path regression tests for the surfaces that promise containment.

### R2 — Local edit/state freshness

- Validate `basedOnRead` capabilities before authorizing writes or clearing stale/failed edit gates.
- Ensure failed reads and invalid/stale capabilities do not grant sticky edit authorization.
- Prevent stale gate/reviewer/index/cache state from authorizing or reporting on outdated local files.
- Fix `markStale()` and command-mode index freshness so retrieval reflects local edits.

### R3 — Local process and cancellation reliability

- Thread cancellation through local tool execution, SDK/provider requests, retry sleeps, subprocess/background jobs, and eval runners where feasible.
- Ensure abort/timeout stops underlying work when the tool contract says it should, not just wrapper promises.
- Preserve background job behavior users rely on; do not kill long-running user jobs unless the command/tool option explicitly asks for timeout cleanup.
- Fix `check_job.kill_on_timeout` behavior to match schema/docs without changing default semantics unexpectedly.

### R4 — Local tool/schema/config contract alignment

- Reconcile `common/src/tools/list.ts`, SDK dispatch, runtime handlers, programmatic tools, agent tool declarations, `ToolHelpers`, aliases, and docs.
- Treat mismatches as local contract correctness, not public hosted API security.
- Preserve compatibility aliases that are still intentionally supported.
- Fix `/setup` and provider config merge/cache issues without changing provider defaults unless needed for correctness.

### R5 — BYOK provider and MCP secret hygiene without breaking local integrations

- Do not blanket-block cross-origin/custom provider or model-discovery endpoints; local BYOK users need them.
- If provider auth headers are attached to discovery/custom endpoints, make the behavior explicit, configurable, and documented.
- Avoid logging raw provider keys, MCP Authorization headers, prompts, or cache snapshots by default.
- For remote MCP cache keys, include enough non-secret identity to avoid stale/wrong client reuse while redacting secrets in diagnostics.

### R6 — Error handling, diagnostics, and local reliability

- Surface parser/indexer failures as local diagnostics instead of silently producing empty maps.
- Bound malformed/unterminated streams and large buffers.
- Convert malformed tool inputs into structured validation errors where useful.
- Avoid raw internal stack/path dumps in user-facing output when a clearer local error can be shown.

### R7 — Cleanup and local-CLI documentation alignment

- Add a cleanup pass to identify and remove unnecessary stale code, dead docs, hosted-product remnants, and misleading backend/web/security wording.
- Update docs to consistently describe Openbuff as local-first, BYOK, no backend, no billing, no hosted auth/web surface.
- Format touched docs/code using existing repository commands only; do not introduce new format tooling.
- Keep compatibility/migration docs honest: legacy Codebuff aliases that still work should be documented as aliases, not removed from code without a migration decision.

### R8 — Tests and validation

- Add regression tests for kept high-priority local safety/correctness findings.
- Add contract consistency tests for registry/tool/schema drift where feasible.
- Add cancellation tests that assert underlying local work stops when expected.
- Add docs/wording checks only if they are low-friction and do not block legitimate compatibility references.

## Guard recommendations to drop or rewrite

Drop or rewrite these plan recommendations because they assume a hosted security model or risk breaking current local workflows:

- **Drop:** “Prevent cross-origin model discovery endpoints from receiving provider API keys by default” as a blanket rule.
  - **Replace with:** Document and test BYOK behavior; avoid sending credentials to implicit/default endpoints unexpectedly; redact keys in logs; consider an explicit opt-in only for ambiguous automatic discovery, not for user-configured provider URLs.

- **Drop:** Any CORS/cookie/session/account/billing/auth guard language.
  - **Replace with:** Local config/env validation, local secret redaction, and clear provider endpoint docs.

- **Rewrite:** “Remote MCP Authorization cache is HIGH security.”
  - **Replace with:** Optional local integration correctness/secret-hygiene issue. Include non-secret header fingerprint/config identity in cache keys; redact secrets.

- **Rewrite:** “Public API/ABI security exposure.”
  - **Replace with:** Local SDK/runtime/tool contract mismatch. Fix consistency without implying a hosted API boundary.

- **Rewrite cautiously:** “Realpath containment everywhere.”
  - **Replace with:** Enforce containment only on tools whose contract is project-local. Preserve explicit user-approved absolute/custom paths if such workflows exist, and document them.

- **Rewrite cautiously:** “Remove or hard-gate `new Function`.”
  - **Replace with:** Verify whether stringified programmatic handlers are only loaded from bundled/local trusted templates. If so, treat as local template trust hardening; do not break existing local agent templates without a migration path.

## Relevant systems and primary files

- Existing remediation artifacts: `.agents/sessions/harness-remediation-2026-07-01/{SPEC.md,PLAN.md,STATUS.md,LESSONS.md}`.
- Source audit artifacts: `.agents/sessions/harness-audit-2026-06-30/AUDIT-REPORT.md`, `COVERAGE-MATRIX.md`, `findings/*.md`.
- Architecture truth source: `docs/architecture.md`.
- Local tool execution and SDK: `sdk/src/run.ts`, `sdk/src/tools/**`, `sdk/src/model-discovery.ts`, `sdk/src/provider-config.ts`, `sdk/src/custom-tool.ts`.
- Runtime tools/edits/gates: `packages/agent-runtime/src/tools/**`, `packages/agent-runtime/src/process-str-replace.ts`, `packages/agent-runtime/src/run-programmatic-step.ts`, `agents/base2/**`.
- CLI local state: `cli/src/hooks/**`, `cli/src/chat.tsx`, `cli/src/components/**`.
- Shared contracts: `common/src/tools/**`, `common/src/env-schema.ts`, `common/src/mcp/client.ts`.
- Index/code-map: `packages/indexer/**`, `packages/code-map/**`.
- Cleanup/docs: `docs/**`, `README.md`, `cli/README.md`, `sdk/README.md`, `openbuff.d/**`, migration docs.

## Acceptance criteria

- Remediation tracker reclassifies all audit findings with local-CLI categories and explicit keep/downgrade/discard decisions.
- The Top 10 is re-ranked for local CLI risk before implementation starts.
- Hosted-product-only guards are removed from the plan or rewritten as local correctness/secret-hygiene tasks.
- No planned guard would block current intended local workflows without an explicit migration decision.
- Local safety/correctness high-priority items have targeted validation plans.
- Cleanup/docs milestone identifies unnecessary hosted-product remnants and formats touched files/docs with existing repo tooling.
- Final closure report maps every audit finding to fixed, downgraded, discarded, deferred, or accepted-debt status with rationale.

## Assumptions

- Existing dirty-tree work is intentional and must be preserved.
- Audit line numbers are approximate and must be re-verified before implementation.
- The architecture document’s local-first/BYOK/no-backend description is the controlling product model.
- Some audit findings remain real and important after reclassification; the issue is priority/framing, not total invalidation.
