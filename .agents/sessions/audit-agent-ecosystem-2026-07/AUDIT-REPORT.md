# Openbuff agent ecosystem audit

> **Implementation status:** All Top 10 and residual findings have been
> implemented and validated. See
> [IMPLEMENTATION-REPORT.md](./IMPLEMENTATION-REPORT.md) for source and test
> evidence. The original findings below are retained as the audit baseline.

## Executive summary

The audit found a capable agent system with strong final-review parsing, foreground spawn tests, filesystem containment, and broad gate/eval coverage. Its largest risks sit at trust and lifecycle boundaries: programmatic agents can bypass declared tools, terminal/browser/web actions rely heavily on prompt discipline, background work is not fully owned or cleaned up, and auxiliary quality agents are spawned without their results being interpreted.

## Top 10

### 1. [CRITICAL] Web direct-fetch is an SSRF boundary failure

- **Confidence:** High; independently verified by discovery and runtime pairs.
- **Risk:** Agent-controlled URLs can target loopback, private/LAN, link-local, metadata, or redirected internal endpoints; response bodies are fully buffered before truncation.
- **Evidence:** `common/src/tools/params/tool/web-search.ts:17-23` validates only URL syntax; `packages/agent-runtime/src/tools/handlers/tool/web-search.ts:67-105` directly fetches and calls `response.text()`.
- **Fix:** HTTP(S)-only policy, DNS/IP checks before and after redirects, reserved-address blocking, streamed byte cap, combined timeout/run AbortSignal.

### 2. [HIGH] Programmatic agents bypass declared tool permissions

- **Confidence:** High; explicit source behavior and documentation contradiction.
- **Risk:** A nominally read-only `handleSteps` agent can yield terminal, mutation, spawn, or network tools absent from `toolNames`.
- **Evidence:** `packages/agent-runtime/src/run-programmatic-step.ts:700-717,750-759` comments out availability enforcement; `docs/agents-and-tools.md:11` says templates define tool permissions.
- **Fix:** Enforce effective tool capabilities for all yielded calls; add narrow internal capabilities for trusted orchestrator operations.

### 3. [HIGH] Terminal and external-action approvals are prompt-only

- **Confidence:** High; repeated across execution, discovery, quality, and CLI shards.
- **Risk:** Basher/debugger/git-committer/browser/librarian and shipped third-party CLI agents can perform high-impact actions without an enforceable approval receipt. Codex/Claude/Gemini templates explicitly disable sandbox/approval protections.
- **Evidence:** `agents/basher.ts:79-139`; `agents/debugger/debugger.ts:60-67`; `agents/git-committer/git-committer.ts:43-106`; `.agents/codex-cli.ts:76-124`; `.agents/claude-code-cli.ts:5-45`; `.agents/gemini-cli.ts:5-51`.
- **Fix:** Central action classifier and scoped approval tokens; least-privilege profiles (`read-only`, `workspace-write`, `full-access`); dedicated git/browser mutation tools; visible per-run permission disclosure.

### 4. [HIGH] Auxiliary quality gates ignore outcomes and can report false success

- **Confidence:** High; orchestrator and quality pairs agree.
- **Risk:** Test-writer, doc-writer, or security-reviewer may crash, no-op, time out, or report a critical issue while orchestration proceeds. Telemetry declares reviewer/validation `passed` before execution.
- **Evidence:** `agents/base2/base2.ts:695-805` marks flags and yields without capturing results; success telemetry is emitted at `:711-718`, `:747-754`, and `:782-789`; final reviewer parsing exists at `:1278-1398`.
- **Fix:** Shared structured aux result/verdict, lifecycle states, post-result done flags, persisted blockers/crashes, and visible gate cards.

### 5. [HIGH] Background agents/processes lack complete lifecycle ownership

- **Confidence:** High; runtime and execution pairs agree.
- **Risk:** Mixed batches can start agents whose IDs are never returned; completed agent jobs retain full internal state indefinitely; cancellation/end-turn omit agent jobs; shell kill/timeout may leave descendants alive.
- **Evidence:** `spawn-agents.ts:95-203,349-390`; `background-agent-jobs.ts:76,161-215`; `check-background-agent.ts:61-109`; `sdk/src/tools/run-terminal-command.ts:248-301`; `sdk/src/tools/background-jobs.ts:327-343,504-519`.
- **Fix:** Atomic prevalidation, normalized/redacted job results, TTL/LRU/consume APIs, unified end-turn accounting/cancel, process-group termination with confirmed exit.

### 6. [HIGH] Step-cap exhaustion bypasses validation/review

- **Confidence:** High; source and existing test expectation confirm behavior.
- **Risk:** Dirty, incomplete work is moved to `final_response_allowed` and follow-up affordances are enabled without required gates.
- **Evidence:** `agents/base2/base2.ts:557-569`; unsafe pending-file expectation in `agents/__tests__/base2.test.ts:1010-1064`; completion contract in `docs/agents-and-tools.md:36-37`.
- **Fix:** Distinct `step_cap_reached` interrupted state, preserve pending gate state, disable green completion, resume gates first next turn.

### 7. [HIGH] Spawn identity is ambiguous for concurrent same-type agents

- **Confidence:** High; picker and searcher traced event/schema/CLI mismatch.
- **Risk:** Concurrent identical agent types can exchange optimistic cards, prompts, params, IDs, nesting, and streamed output.
- **Evidence:** `cli/src/utils/spawn-agent-matcher.ts:11-24` matches first base type; optimistic blocks store call/index metadata, but `common/src/types/print-mode.ts:75-87` start events lack it.
- **Fix:** Add opaque spawn correlation or tool-call ID + index to start events; consume exact entry; type fallback only when unique.

### 8. [HIGH] MCP secrets can leak through full-template logs

- **Confidence:** High; runtime pair verified mutation and logging sites.
- **Risk:** Resolved environment credentials become plaintext inside logged agent templates.
- **Evidence:** `sdk/src/agents/load-agents.ts:73-79,243-255`; full `agentTemplate` logs at `run-agent-step.ts:456-474` and `spawn-agent-utils.ts:448-456`.
- **Fix:** Resolve secrets only at launch or redact centrally; prohibit full template/config logging.

### 9. [HIGH] Runtime context pruning/status ignores resolved BYOK model capacity

- **Confidence:** Medium-high; capability is resolved but no audited connection into runtime loop was found.
- **Risk:** 8k/32k models may show a 190k budget and prune too late, causing emergency trims and misleading UX.
- **Evidence:** `run-agent-step.ts:835-838,1203-1236`; `util/context-pruning.ts:23-76`; resolved capability exists at `sdk/src/impl/model-provider.ts:152-154`.
- **Fix:** Propagate resolved context window into runtime, pruning, budgets, and status using one capability source.

### 10. [HIGH] Discovery/research side effects and provenance are under-specified

- **Confidence:** High for action boundaries; medium-high for research UX.
- **Risk:** Browser agents share global session state and can mutate external sites; librarian shells into untrusted clones; researcher-web can silently omit questions and loses claim-to-source linkage.
- **Evidence:** discovery shards cite `agents/browser-use/browser-use.ts:152-158`, `agents/librarian/librarian.ts:127-186`, and `agents/researcher/researcher-web.ts:275-387`.
- **Fix:** Per-run browser isolation and action policy, sandboxed/read-only clone inspection with owned cleanup, structured research results with question status, claim citations, date/source/locale/depth controls.

## Cross-cutting patterns

1. **Prompt policy substitutes for enforcement.** Terminal, git, browser, debugger, external CLI, and programmatic-tool safety depend on model compliance.
2. **Lifecycle identity/ownership is fragmented.** Optimistic spawn cards, background agents, shell jobs, browser sessions, temp clones/logs, cancellation, cost, and cleanup use separate contracts.
3. **Quality gates are asymmetric.** Code-reviewer has a robust verdict/crash contract; security/test/doc/debug agents use heterogeneous `last_message` output and are difficult to orchestrate safely.
4. **Docs and runtime contracts drift.** Examples include “pre-edit” security review running post-edit, per-package test commands using only the first package, configurable `maxSpawnDepth` not loadable, and git secret scanning described but not enforced.
5. **UX hides phase and failure semantics.** Every spawn tool renders as “Review”; invalid local agents are log-only; background agents/cost are absent at end-turn; timeout/cancel often collapse into generic failures.

## Priorities

### P0 — trust boundaries and data exposure

- Block SSRF/private-network fetches and cap streamed bodies.
- Enforce programmatic tool capabilities and centralized action approvals.
- Redact MCP/provider secrets and sanitize user-visible stack traces.
- Make security-review results blocking and machine-readable.
- Fix process-tree termination and background-agent ownership/cleanup.

### P1 — correctness and workflow integrity

- Preserve gates on step cap; implement bounded reviewer crash recovery/bypass.
- Add spawn correlation to start events and atomic batch prevalidation.
- Connect resolved BYOK model capacity to pruning/status.
- Replace broad automatic test/doc mutation with intent/contract-aware routing; route docs by package and tests by package-command map.
- Make editor completion structured and consumed; invoke debugger after repeated identical/unparseable validation failures.

### P2 — UX, performance, and contract polish

- Render neutral phase-aware spawn cards with status counts, prompts, results, errors, and cancellation.
- Unify local-agent loading/provenance; project precedence, reload invalidation, source links, and actionable diagnostics.
- Add structured researcher controls/citations and per-question budget outcomes.
- Bound file-lister subtree/context search output; own librarian clone/temp-log cleanup.
- Compact reviewer context and add bounded navigation; type eval timeout/cancel outcomes and bounded parallel check groups.

## Residual findings by area

### Orchestrator/quality

- Reviewer crash text advertises retry/fallback/bypass not represented in state (`base2.ts:1359-1396`).
- Doc-writer is hardwired to `docs/agents-and-tools.md`; most internal source edits trigger test/doc agents serially.
- Mixed-package test-writer uses the first package command only.
- Absolute gate paths outside cwd are not rejected; context-pruner is both internal-only and publicly spawnable.
- Git branch creation runs before dirty-tree inspection; `stage_all` and secret prevention are unsafe/prose-only.

### Execution/runtime

- Basher `what_to_summarize` labels rather than summarizes; its schema drifts from terminal params.
- Timeout/spawn failures reject outside the deterministic command-result schema; cancellation leaves background commands running.
- Basher full logs and librarian clones lack explicit retention/cleanup ownership.
- Invalid agent configuration can emit `prompt-error` and then continue.
- Home agents silently override project agents; `maxSpawnDepth` is advertised but not dynamically configurable.
- Code-search context flags can bypass memory/output guards; web-search timeout does not cancel underlying work and uses a fragile deep import.

### CLI/evals

- Registry refresh does not invalidate derived mode listings; the CLI source-path scanner supports fewer extensions than the SDK.
- Expanded dependency rows are outside keyboard focus/scroll geometry.
- External CLI permission profile is absent from structured results/cards.
- Eval final checks are serial without dependency metadata; timeout/cancel becomes exit code 1.
- Best-of-N editor E2E is excluded/stale and can pass vacuously.

### Discovery/research

- File-list graph retrieval is not directory-scoped and subtree requests can be 50× normal budget.
- File-picker accepts prose-like paths and can issue empty reads.
- Researcher-docs lacks structured source/version/failure output.
- Browser visual smoke captures screenshot/PDF/recording by default, increasing cost and artifact noise.

## Evidence, inference, and limits

- **Evidence:** Findings are based on paired file inventories and cross-file source searches with file/line citations. Repeated findings were de-duplicated; rejected/narrowed candidates in shard reports were not promoted.
- **Inference:** Exploitability and operational frequency were not measured live. BYOK context propagation is rated medium-high because no connection was found in the audited tree, not because every provider necessarily fails.
- **Limits:** No destructive browser/provider scenarios, dependency vulnerability scan, or production deployment tests were run. Generated artifacts, graveyard code, web UI, CI/release automation, and maintenance scripts were excluded except where needed to validate a contract.

## Coverage

Six complete picker/searcher shard pairs covered:

- Orchestrator core, plan/execute modes, validation/reviewer gates.
- Editor, basher, terminal/background execution.
- File discovery, code search, web/docs research, browser, librarian.
- Reviewer, security, debugger, test/doc writer, git committer.
- Agent runtime, SDK routing/contracts, permissions, cancellation, background work.
- CLI nested-agent UX, local-agent registry/templates, and eval feedback.

All eight audit domains were evaluated: security, correctness, state mutation, error handling, performance, dependency hygiene, test coverage, and API/ABI contracts. Full subsystem dispositions and exclusions are recorded in `COVERAGE-MATRIX.md`.
