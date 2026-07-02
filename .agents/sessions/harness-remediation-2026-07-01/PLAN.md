# Local-CLI Harness Remediation Plan

<!-- current-task: M9 final local-model closure -->

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

### M2 — Local process, cancellation, and async ownership reliability — done

Scope:
- CLI abort races, SDK/provider cancellation, runtime tool cancellation, background jobs, eval timeouts.

Tasks:
- [x] Define the local cancellation contract: run-scoped SDK/runtime/eval work receives `AbortSignal`; background jobs remain running unless an explicit kill path or `check_job` follow-timeout cleanup applies.
- [x] Thread `AbortSignal` through verified SDK `run` surfaces, LLM retry sleeps, model discovery, and eval runner/final-check execution.
- [x] Verified custom tools and runtime client-tool dispatch needed additional `AbortSignal` forwarding; implemented optional signal/context forwarding and focused SDK/runtime coverage.
- [x] Ensure `check_job.kill_on_timeout` schema value reaches runtime behavior without changing default timeout semantics unexpectedly.
- [x] Add generation/owner tokens for CLI stream/queue/checkpoint shared ref mutations.
- [x] Fix queue/watchdog/streamMessageId abort cleanup paths.
- [x] Make eval task timeouts and final checks abort/kill underlying processes where the eval contract requires cleanup.
- [x] Add provider/model-discovery abort, retry-sleep abort, CLI stale-stream/queue, `check_job`, SDK child-process, and eval timeout/external-runner abort regression tests.
- [x] Reconcile remaining background-job timeout contract coverage against M3 background-job offset work; timeout kill/keep-alive behavior is covered, while persisted read-offset recovery remains owned by M3.

Validation gate:
- Cancellation tests prove underlying work stops when the contract says it should for approved SDK, CLI, runtime `check_job`, and eval surfaces.
- Background job tests preserve expected long-running-job behavior.
- CLI queue/stream tests cover stale owner rejection.

### M3 — Freshness, index/cache invalidation, and local state correctness — todo

Scope:
- Stale index/query results, provider config cache, command concepts, background job offsets, gate/reviewer freshness.

Tasks:
- [x] Make `markStale()` force next `query()` refresh. (implemented with staleRefreshPending barrier and repeated-query coverage)
- [x] Add command-file freshness checks for command-mode index queries. (covered package script refresh after markStale)
- [x] Detect same-size/same-mtime content changes or document/implement a hash strategy. (updateMetadataIndex now verifies content hash with regression coverage)
- [x] Normalize extension casing and unify indexer/code-map language tables. (code-map exports frozen canonical extension list; indexer uses defensive Set; fileTypes normalize dot/casing)
- [x] Invalidate provider config cache on expanded `openbuff.d` fragment changes. (fragment dependency cache key + loader/dependency stack cleanup validated/reviewed)
- [x] Preserve/recover background job read offsets without duplicating historical output. (persisted readOffset recovery with clamp/fallback coverage validated/reviewed)
- [x] Rework gate/reviewer reuse only as needed to avoid stale local-file validation; avoid hosted trust framing. (conversation gate-state reuse requires matching content/status/validation fingerprint; focused tests/typecheck/hooks/review green)

Validation gate:
- Indexer/code-map freshness and command-mode tests pass.
- Provider config cache tests pass.
- Gate/reviewer tests prove stale local-file state is not reused after changes/failures.

### M4 — Local tool/schema/config contract alignment — todo

Scope:
- Tool lists, SDK helper surface, aliases, setup merge, validation toggles, docs-visible env/config contracts.

Tasks:
- [x] Generate/verify consistency among `common/src/tools/list.ts`, SDK dispatch, runtime handlers, SDK `ToolHelpers`, agent tool declarations, and programmatic tools. (validated via M4 registry/generated declaration/SDK dispatch checkpoints)
- [x] Remove unsupported SDK-local advertised tools or implement dispatch for them. (SDK unsupported-tool behavior now explicit unless override supplied)
- [x] Fix stale public tool aliases and unsupported-tool error paths while preserving intentional compatibility aliases. (intentional compatibility aliases documented; unsupported SDK paths covered)
- [x] Align editor/support-agent prompts with actual tool availability, including `set_output` exceptions. (set_output prompt/tool availability regression added)
- [x] Make `hasNoValidation` public option match runtime gates or update/remove the public contract. (runtime gate now uses captured option with serialized fallback; focused base2 tests and agents typecheck passed)
- [x] Preserve `/setup` fields such as `failoverModels` and `maxAgentSteps` during config merges. (writeProviderConfigFile merge preserves both fields; focused model-provider test and SDK typecheck passed)
- [x] Fix read-docs default description/schema mismatch. (description/schema regression covered in common tool-registration consistency test)
- [x] Update env/config/migration docs for implemented aliases and final local behavior. (docs updated and reviewer gate passed)

Validation gate:
- Registry consistency test fails before/fixes after.
- SDK/common/docs tests or snapshots cover local contract drift.

### M5 — BYOK provider and MCP integration hygiene — todo

Scope:
- Provider discovery, custom endpoints, local API key handling, MCP client cache identity.

Tasks:
- [x] Reclassify provider/MCP findings as optional local integration correctness/secret-hygiene, not hosted security. (reclassified under local/BYOK model in SPEC/M0 tracker and M5 execution notes)
- [x] Do not blanket-block cross-origin/custom provider/model-discovery endpoints. (custom endpoints remain supported; discovery auth uses auto/provider/none rather than a blanket block)
- [x] Verify whether credentials are sent only to user-configured or otherwise expected endpoints. (validated discovery auth defaults for inferred, same-origin, cross-origin, opt-in, and opt-out cases)
- [x] If automatic discovery can send credentials to ambiguous endpoints, add explicit config/docs or a narrowly scoped opt-in that does not break user-configured provider URLs. (added discovery.auth config/docs and SDK regression coverage)
- [x] Include non-secret endpoint/header identity in remote MCP cache keys to avoid stale/wrong client reuse. (existing MCP cache identity tests validate header/env identity without raw secret exposure)
- [x] Redact provider keys, MCP Authorization headers, prompts, and cache snapshots in diagnostics/logs by default. (cache-debug sanitizer tests validate provider prompt/secret redaction across common and agent-runtime)

Validation gate:
- Tests cover intended custom provider endpoint behavior.
- Tests cover redaction and MCP cache identity without exposing raw secrets.
- No local BYOK/custom endpoint workflow is broken by default.

### M6 — Error handling, diagnostics, and bounded local resource use — todo

Scope:
- Parser diagnostics, malformed tool inputs, model discovery/final-check timeouts, unbounded buffers.

Tasks:
- [x] Surface tree-sitter parse failures in index/code-map diagnostics without breaking successful partial indexing. (completed and validated in code-map/indexer batch)
- [x] Add timeout/cancellation to model discovery fetches and eval final-check commands where appropriate. (model discovery timeout validated; eval final-check cancellation already validated in M2)
- [x] Return structured errors for malformed tool input parse failures instead of debug-only logs. (completed and validated in malformed STEP_TEXT batch)
- [x] Harden `format-value` and stream cleanup so error reporting cannot throw/silently swallow important failures. (completed and validated in format-value hardening batch)
- [x] Bound unterminated streamed XML/tool-call buffers with structured truncation/error behavior. (first batch: stream XML parser now bounds unterminated buffers and emits structured parser errors; targeted tests/typecheck passed)
- [x] Fix `initCommand` parsing semantics or make it explicit shell execution with safe docs/tests. (trusted shell semantics documented and covered by focused test)
- [x] Improve per-agent eval error summarization so one failed agent does not hide all agents for a commit. (completed and validated in BuffBench per-agent error summary batch)

Validation gate:
- Parser failure, malformed tool input, final-check timeout, bounded-buffer, and eval summary tests pass.

### M7 — Cleanup and local-CLI docs/code formatting — todo

Scope:
- Remove unnecessary hosted-product remnants and align docs/code comments with local CLI reality.

Tasks:
- [x] Search docs and prompts for hosted-product wording: backend, web app, billing, credits, subscription, auth server, CORS, cookies, accounts/tenants, API gateway. (completed in hosted-product wording audit; active misleading CLI wording fixed and guard passed)
- [x] Classify each hit as: current local behavior, compatibility/migration note, stale/removable, or unrelated. (classified as local/BYOK, compatibility/migration, provider-owned, test fixture, historical artifact, or stale active wording)
- [x] Update stale docs to consistently say Openbuff is local-first/BYOK/no backend/no billing/no hosted auth/web surface. (focused active docs/CLI wording updated; compatibility and provider-owned references preserved)
- [x] Remove unnecessary dead/stale code only after verifying no imports/references and no compatibility purpose. (no unnecessary dead/stale code removed; compatibility aliases intentionally preserved)
- [x] Keep intentional compatibility aliases documented rather than deleting them casually. (intentional compatibility aliases preserved and documented during M4/M7)
- [x] Run existing formatting/lint commands for touched docs/code; do not introduce new format tooling. (cli typecheck and wording guard passed for touched files)
- [x] Add a lightweight docs drift check if it can avoid blocking legitimate migration references. (existing BYOK wording guard used; no broader blocking drift check added)

Validation gate:
- Docs no longer imply a hosted backend/billing/auth model except in clearly marked historical/migration context.
- Removed code has reference searches proving it is unused or obsolete.
- Existing format/lint commands pass for touched files.

### M8 — Evals and plan-sharding correctness — todo

Scope:
- Eval harness claims, plan-sharding signal detection, judge/task parity.

Tasks:
- [x] Make plan-sharding default prompt exercise broad-audit minimum shard gates. (default broad-audit prompt updated in run-plan-sharding-eval)
- [x] Count repeated `spawn_agents` agent types correctly in traces. (duplicate requested agent types preserved and counted)
- [x] Validate planner-output coverage rather than prompt-token presence. (live runner now applies planner-output domain coverage)
- [x] Include generated task `spec` in judge rubric and scoring parity tests. (judge prompt includes generated task spec with parity coverage)
- [x] Add registry smoke test for eval helper agents/tools against current local agent registry. (generateEvalTask registers current helper agents with smoke coverage)
- [x] Fix run summary filtering so per-agent outcomes remain visible when one agent errors. (completed during M6 eval per-agent summarization batch)

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


<!-- update_plan_status:appended -->
## M4 closure and M5 start — 2026-07-02T17:01:17.616Z

M4 local tool/schema/config contract alignment is now reconciled as complete based on validated checkpoints:

- `read_docs` schema/default/generated declaration drift covered by common consistency tests.
- `hasNoValidation` runtime gate behavior aligned and covered by agents tests.
- `/setup` config merge preserves `failoverModels` and `maxAgentSteps` with SDK coverage.
- SDK override/unsupported-tool behavior covered, including validation boundary for overridden native client tools.
- Generated agent tool declarations checked against canonical tool names/descriptions.
- `set_output` model-visible prompt/tool availability drift fixed with reachability coverage.
- Env/config/migration docs updated for implemented compatibility aliases and current local behavior.

Next checkpoint: begin M5 BYOK provider and MCP integration hygiene by scoping provider discovery/custom endpoint credential behavior, diagnostics redaction, and MCP cache identity without breaking user-configured local/BYOK workflows.


<!-- update_plan_status:appended -->
## M5 complete; M6 next — 2026-07-02T18:30:49.565Z

M5 BYOK provider and MCP integration hygiene is implementation-complete and validated. Provider discovery auth now preserves local custom endpoint workflows while making credential behavior explicit/configurable; remote MCP cache identity/redaction coverage is present and validated; combined configured hooks passed for common, SDK, and agent-runtime. Next milestone: M6 error handling, diagnostics, and bounded local resource use.


<!-- update_plan_status:appended -->
## M6 partial completion — 2026-07-02T18:38:40.413Z

First M6 batch completed and validated: bounded unterminated streamed XML/tool-call buffers with structured error surfacing. Remaining M6 items include tree-sitter/indexer parse diagnostics, model discovery/eval final-check timeouts, malformed tool input structured errors, format-value/stream cleanup hardening, initCommand semantics, and eval error summarization.


<!-- update_plan_status:appended -->
## M6 parse diagnostics checkpoint — 2026-07-02T19:08:02.930Z

M6 parse diagnostics is complete and validated. Continuing M6 from the next incomplete isolated diagnostics/resource-bound surface; completed M5, bounded XML, malformed STEP_TEXT diagnostics, and code-map/indexer parse diagnostics should not be revisited unless validation/review points back there.


<!-- update_plan_status:appended -->
## M6 Timeout Task Completed — 2026-07-02T19:18:03.741Z

Model discovery fetch timeout is now implemented and validated; eval final-check cancellation was previously completed in M2 and referenced in STATUS. Marking the combined M6 timeout/cancellation task complete.


<!-- update_plan_status:appended -->
## M6 InitCommand Task Completed — 2026-07-02T19:23:48.105Z

The `initCommand` semantics task is implemented and validated. Marking it complete after focused BuffBench test/typecheck pass.


<!-- update_plan_status:appended -->
## M6 completion reconciliation — 2026-07-02T19:30:26.383Z

M6 implementation batches now completed and validated: parse diagnostics, model discovery timeout, malformed tool input structured errors, format-value hardening, bounded streamed XML/tool-call buffers, initCommand shell semantics, and per-agent eval error summarization. Remaining PLAN checkboxes for format-value and eval summary should be treated as done based on recorded STATUS validation.


<!-- update_plan_status:appended -->
## M7/M8 reconciliation; M9 next — 2026-07-02T20:40:09.345Z

Reconciled completed M7/M8 checkpoint state against recorded STATUS entries after the automated gate passed. M7 hosted-product wording audit and M8 eval/plan-sharding correctness items are now treated as complete based on prior targeted validations and reviewer gate approval. Next durable checkpoint is M9 final local-model closure: sweep remaining findings/debt, run registry/drift checks and relevant validation, update the tracker, and produce the final closure report.

