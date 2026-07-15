# Agent ecosystem audit implementation report

Status: **implemented and validated**
Baseline implementation: `3beab44c5 feat: harden read/write orchestration`
Follow-up state: current working tree (post-audit reconciliation)

This report closes the findings in [AUDIT-REPORT.md](./AUDIT-REPORT.md). The
baseline commit contains the large read/write/index/context and orchestration
architecture changes; the current working tree contains the final residual
agent, gate, browser, approval, indexing, background, CLI, and evaluator fixes.

## Top 10 closure

| #   | Finding                                          | Status | Implementation evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Web direct-fetch SSRF boundary                   | Closed | `web-search-utils.ts` now enforces HTTP(S), blocks reserved/private DNS and IP targets before and after redirects, combines cancellation/timeout, and streams through a byte cap. Deep `open-websearch` was replaced with bounded DuckDuckGo HTML retrieval. Covered by `web-search-security.test.ts`.                                                                                                                                                                                         |
| 2   | Programmatic agents bypass declared tools        | Closed | `run-programmatic-step.ts` enforces the union of visible and explicitly declared hidden programmatic capabilities. Undeclared yielded tools terminate with a structured error and never execute. Covered by `run-programmatic-step.test.ts` and agent reachability tests.                                                                                                                                                                                                                      |
| 3   | Terminal/external approvals are prompt-only      | Closed | SDK terminal execution now classifies high-impact actions, evaluates static policy first, and atomically consumes exact repository/workspace/root-run/snapshot/action/target approval receipts. Default-branch push remains unconditionally denied. External CLI results disclose `permissionProfile: "tmux-test"`; browser mutation requires an explicit interaction policy. Covered by harness-enforcement, terminal-policy, run-terminal-command, browser-policy, and CLI rendering tests.  |
| 4   | Auxiliary quality gates ignore outcomes          | Closed | Base2 captures structured test/doc/security receipts, records lifecycle state only after completion, carries blockers forward, groups test routing by workspace, and validates before the final reviewer. Covered by gate aux unit tests and both gate lifecycle E2E suites.                                                                                                                                                                                                                   |
| 5   | Background work lacks lifecycle ownership        | Closed | Agent and shell jobs now carry client/root-run/parent-run/agent ownership, bounded output/cursors/consumer counts, persistence/recovery, cancellation, TTL/consumption behavior, and end-turn accounting. Default subagent lifetime is bounded to 30 minutes unless explicitly overridden. Covered by runtime background, end-turn, check-job, SDK background, timeout, and recovery tests.                                                                                                    |
| 6   | Step-cap exhaustion bypasses gates               | Closed | Step exhaustion produces a resumable `STEP_CAP_REACHED` checkpoint and preserves pending validation/review state instead of manufacturing successful finalization. Covered by `main-prompt.test.ts` and Base2 state tests.                                                                                                                                                                                                                                                                     |
| 7   | Same-type concurrent spawn identity is ambiguous | Closed | Spawn events carry tool-call/index correlation; CLI matching consumes exact correlated entries and only uses type fallback when unique. Covered by `spawn-agent-matcher.test.ts`, nested streaming tests, and SDK event tests.                                                                                                                                                                                                                                                                 |
| 8   | MCP secrets can leak through template logs       | Closed | MCP cache identity hashes resolved headers/env, runtime logging avoids full resolved templates, and secret-bearing provider/template structures are centrally redacted. Covered by MCP client cache/redaction tests and runtime logging contract tests.                                                                                                                                                                                                                                        |
| 9   | Pruning ignores resolved model capacity          | Closed | Resolved per-model `contextWindowTokens` flows into each run, semantic trigger/target budgets, provider request trimming, telemetry, and CLI status. Child agents start with their own unresolved window and resolve independently. Typed task memory, pinned blockers/open questions, structured handoffs, and repeated-compaction preservation prevent amnesia. Covered from 8k through 1M windows by context-pruner, loop-agent, task-memory, spawn-history, and LLM context-window suites. |
| 10  | Discovery/research side effects and provenance   | Closed | Browser state is owner-keyed and interaction defaults read-only; Librarian clones are runtime-owned and cleaned from trusted history unless explicitly retained; web/docs researchers return structured question/source/version/failure evidence; query indexing supports real path-prefix filtering; file discovery is scope-safe and bounded. Covered by browser ownership/policy, Librarian cleanup, query schema/indexer, researcher, file-picker, and specialist contract tests.          |

## Residual finding closure

### Orchestrator and quality

| Finding                                                 | Resolution                                                                                                                                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewer crash text did not match state                 | Reviewer protocol failures now have an explicit bounded reviewer-only retry, a stopped/blocked state after the second failure, and an explicit challenge-bound bypass. Protocol failures are never sent to repair-editor. |
| Doc writer was hardwired and aux routing was over-broad | Aux routing uses affected source/workspace evidence and project-aware doc/test targets; generated aux files do not reopen the same snapshot indefinitely.                                                                 |
| Mixed-package test writer used one command              | Targets are grouped by nearest workspace and test command; build-only commands are rejected as test evidence.                                                                                                             |
| Absolute gate paths and public context-pruner           | Gate paths are normalized/contained. Context-pruner remains runtime-declared but is removed from model-visible tools, prompts, and stream metadata.                                                                       |
| Git branch/staging/secret policy                        | Dirty-state inspection precedes branch mutation; staging is path-scoped; high-impact git operations are centrally classified and approval-gated; direct default-branch push is prohibited.                                |

### Execution and runtime

| Finding                                                    | Resolution                                                                                                                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basher labeled rather than summarized                      | Basher now performs deterministic semantic line extraction while preserving command/CWD/exit/job/log metadata and a structured result.                                             |
| Timeout/spawn errors escaped deterministic results         | Subagent timeout/cancellation is bounded and abort-aware; shell timeout/cancel paths return structured results and terminate owned work.                                           |
| Basher logs and Librarian clones lacked ownership          | Full-log retention is explicit; non-retained logs are deleted. Librarian cleanup derives its target only from trusted programmatic history and a validated URL-derived owned path. |
| Invalid agent configuration continued after `prompt-error` | Invalid configuration is terminal for the prompt; execution no longer emits a second start/finish sequence.                                                                        |
| Home/project precedence and `maxSpawnDepth` drift          | Executable project agents require explicit trust, project precedence is deterministic, and dynamic/template configuration carries `maxSpawnDepth`.                                 |
| Code-search guards and web cancellation                    | Search outputs/flags are bounded; web retrieval is direct, abortable, timeout-aware, redirect-revalidated, and byte-capped.                                                        |

### CLI and evaluations

| Finding                                              | Resolution                                                                                                                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry refresh/listing and source-extension drift  | Derived mode listings invalidate with registry refresh and CLI source discovery matches the SDK-supported agent extensions.                                                                        |
| Expanded dependency rows were not keyboard reachable | Expanded dependency rows are flattened into focus/scroll order and covered by component tests.                                                                                                     |
| External CLI permission profile was hidden           | Structured output now includes `outputKind: "external-cli"` and `permissionProfile: "tmux-test"`; CLI rendering displays it.                                                                       |
| Eval checks were serial and collapsed timeout/cancel | Object-form checks support stable IDs, dependencies, bounded parallelism, per-check timeout, skipped/configuration-error states, and duration evidence; legacy strings retain sequential behavior. |
| Best-of-N E2E was stale/vacuous                      | The obsolete E2E file is deleted, removed IDs are guarded by reachability tests, and the stale TypeScript exclusion has been removed.                                                              |

### Discovery and research

| Finding                                                                   | Resolution                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| File-list retrieval ignored directory scope and oversized subtree budgets | `query_index.pathPrefixes` filters lexical, semantic, and related-file candidates before ranking; file-lister/picker results are scope-validated and capped to eight high-relevance files. |
| File-picker accepted prose/empty reads                                    | Candidate parsing rejects prose-like, unsafe, non-file, and out-of-scope paths; empty safe results stop without issuing a read.                                                            |
| Researcher-docs lacked source/version/failure output                      | It now returns structured `status`, `answer`, `source`, `version`, and optional `failure`, using Context7 metadata without guessing.                                                       |
| Browser smoke always generated screenshot/PDF/recording                   | Browser evidence is proportional: screenshot for visual checks, PDF only for print/PDF behavior, and recording only for time-based or explicitly requested evidence.                       |

## Architectural outcomes

- Workspace mutation is serialized through the broker with revision/hash CAS,
  authoritative commit receipts, journaling, rollback evidence, and
  reconciliation.
- Orchestration state is replayable through typed ledger, plan, workflow,
  discovery, lease, handoff, and receipt contracts.
- Agent selection accounts for capabilities, real writable path scope, leases,
  dependencies, model context minima, and current workspace revision.
- Context is isolated per agent/model and shared through compact typed handoffs,
  evidence, receipts, and task memory rather than copied parent histories.
- Gate snapshot attestation uses a single-line opaque hash. File details remain a
  separate review input. Attestation failures retry the reviewer once and then
  stop; they do not create source repair loops.

## Validation evidence

All validations below passed on the reconciled working tree:

- TypeScript: agents, common, agent-runtime, indexer, SDK, CLI, and evals.
- Common: **723 passed**.
- Agent runtime: **1060 passed**.
- Indexer: **180 passed**.
- SDK: **923 passed, 1 skipped** (the skip is a pre-existing TODO integration case).
- Shipped agent unit suite: **591 passed**, plus **2 passed** specialist audit-contract tests.
- CLI: **2434 passed, 16 skipped** (environment-dependent tmux/clipboard/performance cases).
- Evals: **224 passed**.
- Focused residual cross-package suite: **303 passed**.
- Gate lifecycle/aux regression suite: **49 passed**.
- `git diff --check`: clean.

There are no remaining source-level blockers from this audit. Reviewer
attestation failures are now protocol state, not repair findings; a fresh
matching reviewer receipt clears code findings, while repeated protocol failure
halts after the bounded retry instead of looping.
