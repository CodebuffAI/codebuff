# Local-CLI Harness Remediation Plan

<!-- current-task: M1 — Local filesystem and edit safety -->

Source audit: `.agents/sessions/harness-audit-2026-06-30/AUDIT-REPORT.md`
Session: `.agents/sessions/harness-remediation-2026-07-01/`
Controlling product model: `docs/architecture.md` — local-first CLI/SDK, BYOK, no hosted backend/web/billing/auth surface.

## Operating rules

- Treat the audit report as a raw findings inventory, not an authoritative severity list.
- Reclassify every finding against the local-CLI/BYOK model before implementation.
- Preserve intended local workflows: custom provider URLs, local model servers, remote/local MCP integrations, explicit user-configured commands, compatibility aliases.
- Drop or rewrite any guard that assumes hosted web/backend/billing/auth/CORS/cookie/account/tenant risk.
- Before implementation, re-read exact current source ranges for the finding being fixed; audit line numbers are hints, not edit anchors.
- Preserve unrelated dirty-tree changes. Do not revert, stage, or overwrite unrelated files.
- Fix exported symbols with reference searches and update all callers/tests.
- Prefer small PR-sized batches, each with tests and validation.
- Treat reviewer `BLOCKING:` findings and validation failures as controlling next actions.
- Update `STATUS.md` after each milestone checkpoint using `update_plan_status`.
- Append reusable lessons to `LESSONS.md` using `update_plan_status`.

## Milestones

### M0 — Local-model triage and tracker foundation — todo

Tasks:
- [x] Create or update a remediation tracker table with columns: finding id, source shard/domain, original severity, local classification, keep/downgrade/discard decision, files, owner milestone, status, tests, rationale. (created M0-LOCAL-TRIAGE-TRACKER.md)
- [x] Re-rank the audit Top 10 under local CLI risk: local filesystem/process/edit safety first; hosted-product assumptions downgraded or discarded. (recorded in tracker)
- [x] Identify recommendations that would break intended local workflows and mark them `drop` or `rewrite` before any code changes. (guard-breaking table added)
- [x] Determine whether existing dirty-tree changes already fix or partially fix listed findings. (overlap notes captured; exact verification deferred to owning milestones)
- [x] Establish validation commands per package from package scripts and docs. (commands recorded from package manifests/docs)

Validation gate:
- Tracker exists in session artifacts.
- Each Top 10 item has a local classification and milestone/defer/drop decision.
- Guard-breaking recommendations are explicitly listed with replacement framing.

### M1 — Local filesystem and edit safety — todo

Scope:
- Path containment and edit authorization findings that can cause local data loss or access outside promised project boundaries.

Tasks:
- [ ] Verify which tools promise project-root containment versus intentionally accepting explicit absolute/user-selected paths.
- [ ] Implement or reuse a realpath-aware containment helper only for project-local contracts.
- [ ] Cover `run_terminal_command.cwd`, `code_search.cwd`, `read_outline`, file/edit tools, and gate paths according to their verified contracts.
- [ ] Add symlink/absolute-path regression tests for surfaces that promise containment.
- [ ] Validate `basedOnRead` capability freshness before write authorization or stale-gate clearing.
- [ ] Fix failed read paths so they do not clear stale-edit guards or grant sticky edit authorization.
- [ ] Ensure invalid/stale capabilities cannot clear failed edit or strict gates.
- [ ] Require large-file `occurrenceIndex` edits to respect fresh anchors where applicable.

Validation gate:
- Deterministic edit tests pass.
- Symlink/project-boundary tests pass for the surfaces that promise containment.
- No intended explicit local-path workflow is blocked without a documented migration decision.

### M2 — Local process, cancellation, and async ownership reliability — todo

Scope:
- CLI abort races, SDK/provider cancellation, runtime tool cancellation, background jobs, eval timeouts.

Tasks:
- [ ] Define the local cancellation contract: what aborts immediately, what is left running unless explicitly killed, and what options control cleanup.
- [ ] Thread `AbortSignal` through SDK `run`, provider LLM calls, retry sleeps, model discovery, custom tools, and runtime client-tool dispatch where feasible.
- [ ] Ensure `check_job.kill_on_timeout` schema value reaches runtime behavior without changing default timeout semantics unexpectedly.
- [ ] Add generation/owner tokens for CLI stream/queue/checkpoint shared ref mutations.
- [ ] Fix queue/watchdog/streamMessageId abort cleanup paths.
- [ ] Make eval task timeouts and final checks abort/kill underlying processes where the eval contract requires cleanup.
- [ ] Add provider abort, retry-sleep abort, CLI stale-stream, background job timeout, and eval timeout regression tests.

Validation gate:
- Cancellation tests prove underlying work stops when the contract says it should.
- Background job tests preserve expected long-running-job behavior.
- CLI queue/stream tests cover stale owner rejection.

### M3 — Freshness, index/cache invalidation, and local state correctness — todo

Scope:
- Stale index/query results, provider config cache, command concepts, background job offsets, gate/reviewer freshness.

Tasks:
- [ ] Make `markStale()` force next `query()` refresh.
- [ ] Add command-file freshness checks for command-mode index queries.
- [ ] Detect same-size/same-mtime content changes or document/implement a hash strategy.
- [ ] Normalize extension casing and unify indexer/code-map language tables.
- [ ] Invalidate provider config cache on expanded `openbuff.d` fragment changes.
- [ ] Preserve/recover background job read offsets without duplicating historical output.
- [ ] Rework gate/reviewer reuse only as needed to avoid stale local-file validation; avoid hosted trust framing.

Validation gate:
- Indexer/code-map freshness and command-mode tests pass.
- Provider config cache tests pass.
- Gate/reviewer tests prove stale local-file state is not reused after changes/failures.

### M4 — Local tool/schema/config contract alignment — todo

Scope:
- Tool lists, SDK helper surface, aliases, setup merge, validation toggles, docs-visible env/config contracts.

Tasks:
- [ ] Generate/verify consistency among `common/src/tools/list.ts`, SDK dispatch, runtime handlers, SDK `ToolHelpers`, agent tool declarations, and programmatic tools.
- [ ] Remove unsupported SDK-local advertised tools or implement dispatch for them.
- [ ] Fix stale public tool aliases and unsupported-tool error paths while preserving intentional compatibility aliases.
- [ ] Align editor/support-agent prompts with actual tool availability, including `set_output` exceptions.
- [ ] Make `hasNoValidation` public option match runtime gates or update/remove the public contract.
- [ ] Preserve `/setup` fields such as `failoverModels` and `maxAgentSteps` during config merges.
- [ ] Fix read-docs default description/schema mismatch.
- [ ] Update env/config/migration docs for implemented aliases and final local behavior.

Validation gate:
- Registry consistency test fails before/fixes after.
- SDK/common/docs tests or snapshots cover local contract drift.

### M5 — BYOK provider and MCP integration hygiene — todo

Scope:
- Provider discovery, custom endpoints, local API key handling, MCP client cache identity.

Tasks:
- [ ] Reclassify provider/MCP findings as optional local integration correctness/secret-hygiene, not hosted security.
- [ ] Do not blanket-block cross-origin/custom provider/model-discovery endpoints.
- [ ] Verify whether credentials are sent only to user-configured or otherwise expected endpoints.
- [ ] If automatic discovery can send credentials to ambiguous endpoints, add explicit config/docs or a narrowly scoped opt-in that does not break user-configured provider URLs.
- [ ] Include non-secret endpoint/header identity in remote MCP cache keys to avoid stale/wrong client reuse.
- [ ] Redact provider keys, MCP Authorization headers, prompts, and cache snapshots in diagnostics/logs by default.

Validation gate:
- Tests cover intended custom provider endpoint behavior.
- Tests cover redaction and MCP cache identity without exposing raw secrets.
- No local BYOK/custom endpoint workflow is broken by default.

### M6 — Error handling, diagnostics, and bounded local resource use — todo

Scope:
- Parser diagnostics, malformed tool inputs, model discovery/final-check timeouts, unbounded buffers.

Tasks:
- [ ] Surface tree-sitter parse failures in index/code-map diagnostics without breaking successful partial indexing.
- [ ] Add timeout/cancellation to model discovery fetches and eval final-check commands where appropriate.
- [ ] Return structured errors for malformed tool input parse failures instead of debug-only logs.
- [ ] Harden `format-value` and stream cleanup so error reporting cannot throw/silently swallow important failures.
- [ ] Bound unterminated streamed XML/tool-call buffers with structured truncation/error behavior.
- [ ] Fix `initCommand` parsing semantics or make it explicit shell execution with safe docs/tests.
- [ ] Improve per-agent eval error summarization so one failed agent does not hide all agents for a commit.

Validation gate:
- Parser failure, malformed tool input, final-check timeout, bounded-buffer, and eval summary tests pass.

### M7 — Cleanup and local-CLI docs/code formatting — todo

Scope:
- Remove unnecessary hosted-product remnants and align docs/code comments with local CLI reality.

Tasks:
- [ ] Search docs and prompts for hosted-product wording: backend, web app, billing, credits, subscription, auth server, CORS, cookies, accounts/tenants, API gateway.
- [ ] Classify each hit as: current local behavior, compatibility/migration note, stale/removable, or unrelated.
- [ ] Update stale docs to consistently say Openbuff is local-first/BYOK/no backend/no billing/no hosted auth/web surface.
- [ ] Remove unnecessary dead/stale code only after verifying no imports/references and no compatibility purpose.
- [ ] Keep intentional compatibility aliases documented rather than deleting them casually.
- [ ] Run existing formatting/lint commands for touched docs/code; do not introduce new format tooling.
- [ ] Add a lightweight docs drift check if it can avoid blocking legitimate migration references.

Validation gate:
- Docs no longer imply a hosted backend/billing/auth model except in clearly marked historical/migration context.
- Removed code has reference searches proving it is unused or obsolete.
- Existing format/lint commands pass for touched files.

### M8 — Evals and plan-sharding correctness — todo

Scope:
- Eval harness claims, plan-sharding signal detection, judge/task parity.

Tasks:
- [ ] Make plan-sharding default prompt exercise broad-audit minimum shard gates.
- [ ] Count repeated `spawn_agents` agent types correctly in traces.
- [ ] Validate planner-output coverage rather than prompt-token presence.
- [ ] Include generated task `spec` in judge rubric and scoring parity tests.
- [ ] Add registry smoke test for eval helper agents/tools against current local agent registry.
- [ ] Fix run summary filtering so per-agent outcomes remain visible when one agent errors.

Validation gate:
- Buffbench targeted tests pass.
- Plan-sharding signal tests cover repeated-agent and output-coverage cases.

### M9 — Final local-model closure — todo

Scope:
- Final verification, accepted debt, closure report.

Tasks:
- [ ] Sweep remaining LOW findings: fix opportunistically, downgrade, discard as hosted-model false positives, or record accepted-debt rationale.
- [ ] Run generated registry/drift checks.
- [ ] Run relevant package validation suites.
- [ ] Update remediation tracker with final resolution/test links.
- [ ] Produce a final closure report mapping every audit finding to fixed/downgraded/discarded/deferred/accepted status.
- [ ] Confirm no planned/implemented guard breaks intended local CLI/BYOK workflows.

Validation gate:
- No untriaged findings remain.
- Final closure report exists in session artifacts.
- Validation summary is recorded in `STATUS.md`.

## Guard-breaking recommendations to remove from the old plan

- Blanket cross-origin provider/model-discovery credential blocking: replace with BYOK-aware explicit behavior, redaction, and narrow safeguards for implicit endpoints only.
- Hosted auth/CORS/cookie/billing/account/tenant guards: remove as out of scope.
- “Public API security” language for SDK/tool drift: rewrite as local contract correctness.
- Remote MCP Authorization as hosted HIGH security: rewrite as optional local integration cache correctness/secret-hygiene.
- Universal realpath containment: narrow to tools whose contract promises project-local paths; document explicit absolute/local workflows.
- Hard-breaking `new Function` removal: first verify trust source and current local agent template requirements; use migration-compatible hardening.

## Dependencies and ordering

- M0 must happen first; no remediation should start from the old severity labels without local reclassification.
- M1 should precede broad cleanup because local data-loss/path/edit safety is the highest local risk.
- M2 can run after M0 and partly in parallel with M3 if ownership boundaries are clear.
- M4 should precede docs closure because docs must reflect final tool/config contracts.
- M5 should land before docs cleanup for provider/MCP wording.
- M7 cleanup/docs should not delete compatibility aliases or optional integrations before M4/M5 verify them.
- M9 final closure depends on all prior milestone tracker updates.

## Risks and blockers

- Existing dirty-tree edits may overlap with audit findings; verify before editing.
- Some audit findings are real but mislabeled; avoid discarding due to bad wording alone.
- Some guards that sound safer could break local BYOK/custom endpoint workflows.
- Public compatibility aliases may look stale but still be intentional.
- Cancellation propagation may require changes across package boundaries and test harnesses.
- Formatting/docs cleanup can become broad; keep it scoped to local-CLI truth and touched/remediated areas.

## Validation strategy

- Use focused tests per milestone first, then broader package checks.
- For path changes, include real filesystem symlink tests where the contract promises containment.
- For cancellation changes, assert side effects stop after abort when expected, not just promise rejection.
- For registry/schema changes, prefer generated consistency tests that fail on future drift.
- For provider/MCP changes, test both redaction/cache identity and successful custom endpoint workflows.
- For cleanup/docs, run repo-native format/lint commands and targeted wording searches.
- For CLI lifecycle changes, add hook/unit tests and use tmux visual testing only if UI rendering changes.

## Checkpoint/update rules

- `STATUS.md`: update after each milestone starts, completes, blocks, or changes scope.
- `LESSONS.md`: append local-model reclassification decisions, false-positive rationales, validation command discoveries, and compatibility gotchas.
- `PLAN.md`: revise via `create_plan` if milestone ordering or scope materially changes.
- `SPEC.md`: revise via `create_plan` only if goals/requirements/acceptance criteria change.

<!-- update_plan_status:appended -->
## M0 completion note — 2026-07-01T05:52:32.171Z

M0 tracker created at `.agents/sessions/harness-remediation-2026-07-01/M0-LOCAL-TRIAGE-TRACKER.md`. It reclassifies audit families under the local CLI/BYOK model, re-ranks the Top 10, lists guard-breaking recommendations to drop/rewrite, notes dirty-tree overlap, and records validation commands.


<!-- update_plan_status:appended -->
## M1 start — 2026-07-01T06:05:33.124Z

Starting M1 — local filesystem and edit safety. First checkpoint: read the M0 tracker and current dirty-tree-overlapping deterministic edit/source ranges, then choose the smallest safe implementation batch.

