# CLI/local-agent/eval UX audit — file-picker shard

## Compact inventory for paired code-searcher

- Selection/configuration: `agent-mode-toggle.tsx` switches top-level mode; `agent-checklist.tsx` searches/selects local agents and expands their spawnable dependency tree; `local-agent-registry.ts` merges bundled, project/parent/home agents and MCP config.
- Run display: `message-with-agents.tsx` renders message-tree children in responsive grids; `agent-branch-wrapper.tsx` / `agent-branch-item.tsx` render nested block-agent prompt, status, preview, body and selector summaries; `spawn-agents.tsx` renders the initiating tool call.
- Lifecycle: `message-block-helpers.ts` creates/moves nested agent blocks, attaches tool results, interruption notices, status/prompt metadata; `spawn-agent-matcher.ts` reconciles optimistic temporary blocks with runtime IDs.
- Local CLI agents: `.agents/lib/create-cli-agent.ts` shares schemas/prompts; individual Claude/Codex/Gemini/Openbuff definitions start tmux sessions and return structured results/captures/issues.
- Evaluation: `evals/buffbench/agent-runner.ts` runs agents under a 60-minute aggregate timeout and then sequential final checks; `plan-sharding-signals.ts` evaluates audit classification, parallelism, pair count and textual coverage.
- Tests found: strong registry integration and sharding-signal suites; component layout/message tests; only pure helper tests for mode toggle. No direct tests found for spawn reconciliation with duplicate agent types or the `spawn_agents` renderer semantics.

## [HIGH] Correctness / state mutation — cli/src/utils/spawn-agent-matcher.ts:11 — Concurrent same-type agents can be reconciled to the wrong optimistic card

- **Risk:** Matching uses only the base agent type and returns the first map entry, even though the block model already carries `spawnToolCallId` and `spawnIndex`; two concurrent `file-picker` (or other same-type) children can therefore exchange prompts, params, nesting, runtime IDs, and subsequent output depending on event arrival order.
- **Fix:** Key optimistic entries and start events by spawn tool-call ID plus index (or a runtime correlation token); use type only as a guarded legacy fallback and consume matched entries atomically.
- **Evidence:** `findMatchingSpawnAgent` normalizes `eventAgentType`, loops insertion order, and returns on `eventBaseName === storedBaseName` (lines 15-21), while `createAgentBlock` supports `spawnToolCallId`/`spawnIndex` at `message-block-helpers.ts:648-690` but this matcher ignores them.

## [HIGH] Correctness / state mutation — cli/src/utils/local-agent-registry.ts:55 — Registry reinitialization leaves mode listing caches stale

- **Risk:** Startup reloads (and any future watch/reload UX) replace `userAgentsCache`, paths, and MCP configuration but do not invalidate `cachedAgentsByMode`; after the first `loadLocalAgents()` call, added/removed/renamed agents and overrides can remain invisible until process restart or a test-only reset.
- **Fix:** Clear all derived listing/directory caches at the start or successful end of `initializeAgentRegistry`, and expose a supported reload API that returns validation diagnostics for the UI.
- **Evidence:** initialization assigns caches at lines 55-87; `loadLocalAgents` returns cached arrays at lines 242-249 and populates them at 299; only `__resetLocalAgentRegistryForTests` clears `cachedAgentsByMode` at lines 451-460.

## [MEDIUM] UX / API contract — cli/src/components/tools/spawn-agents.tsx:8 — Every agent spawn is presented as “Review”

- **Risk:** General research, file-picking, implementation, validation and orchestration spawns are mislabeled as a review stage, so users cannot understand plan execution or distinguish why concurrent agents are running; the collapsed history becomes a sequence of identical “Review” entries.
- **Fix:** Render a neutral “Spawned N agents” header by default and derive stage labels from explicit structured metadata (phase/purpose), with per-agent status counts and expandable prompt summaries.
- **Evidence:** the component hardcodes `const header = 'Review'` (line 23), shows only comma-joined types (24-28), and ignores prompts, status, results, failures and cancellation despite accepting prompts in its input type (18-20).

## [MEDIUM] UX / correctness — cli/src/components/agent-checklist.tsx:194 — Keyboard scrolling assumes every row is one line even when dependency trees expand

- **Risk:** Expanding an agent inserts arbitrarily many descendant rows, but focus scrolling still computes `focusedTop = focusedIndex * 1`; keyboard focus can move offscreen or scroll to the wrong visual agent, making large local-agent graphs difficult to configure.
- **Fix:** Measure row renderables or build a flattened visible-row model (agent and dependency rows) and scroll by actual offsets; include keyboard affordances for expand/collapse and announce dependency cycles/missing definitions.
- **Evidence:** the effect explicitly assumes `itemHeight = 1` at lines 194-215, while expanded recursive `DepTree` rows are inserted between checklist items at lines 365-377.

## [MEDIUM] Error handling / UX — cli/src/utils/local-agent-registry.ts:55 — Invalid local-agent configuration degrades to an empty menu with log-only feedback

- **Risk:** One SDK load failure clears every user agent and the CLI gives no actionable in-product file/schema diagnostic; unreadable files/directories during ID-to-path discovery are silently skipped, so “Open file” can disappear and users cannot tell whether an agent is invalid, shadowed, or inaccessible.
- **Fix:** Preserve successfully loaded agents, return per-file diagnostics (source, precedence, validation error), surface them in the agent picker/startup notice, and add a reload/fix action.
- **Evidence:** the catch replaces the complete cache with `{}` and only `logger.warn`s (61-69); path scanning swallows file and directory errors with empty catches (127-139); `LocalAgentInfo.filePath` falls back to an empty string (152-157).

## [MEDIUM] Security / feature gap — .agents/codex-cli.ts:81 — External CLI agents require blanket unsafe permission modes

- **Risk:** Codex, Claude, and Gemini automation is designed around disabling approval/sandbox protections, so a mistaken or prompt-injected task can perform unrestricted repository/system actions; the UX provides no per-run risk disclosure or safer selectable profile.
- **Fix:** Add explicit permission profiles (`read-only`, `workspace-write`, `full-access`), default smoke/review runs to the least privilege compatible with the task, require an acknowledged opt-in for full access, and record the chosen profile in structured results.
- **Evidence:** Codex starts with `-a never -s danger-full-access` and instructs always using it (lines 81-83); equivalent blanket flags are mandated in `.agents/claude-code-cli.ts:12` and `.agents/gemini-cli.ts:12`.

## [LOW] Performance / evaluation feedback — evals/buffbench/agent-runner.ts:174 — Final checks are serial and share only the agent’s aggregate timeout

- **Risk:** Independent checks run one-by-one, reducing eval throughput, and a late check inherits the nearly exhausted 60-minute outer signal; results do not distinguish timeout/abort from an ordinary exit code 1, weakening feedback about agent quality versus harness exhaustion.
- **Fix:** Define per-check timeout/concurrency metadata, run independent checks in a bounded pool, and emit typed outcomes (`passed`, `failed`, `timed_out`, `cancelled`) with elapsed time.
- **Evidence:** `runFinalCheckCommands` iterates `for (const command of commands)` and awaits each `execAsync` (lines 227-263); catch coerces nonnumeric abort/timeout codes to `1` (252-260); all work shares the outer 60-minute signal (89-97, 174-196).

## [LOW] Test coverage gap — cli/src/utils/spawn-agent-matcher.ts:11 — Critical optimistic-to-runtime reconciliation has no focused regression suite

- **Risk:** Ordering, duplicate-type concurrency, nested parents, namespaced types, cancellation-before-start, and unmatched events can regress while layout tests remain green.
- **Fix:** Add table-driven tests covering two identical agent types from one batch and different batches, out-of-order starts, correlation metadata, nested moves, unmatched starts, and cancellation cleanup; add renderer tests asserting phase-neutral labels and lifecycle summaries.
- **Evidence:** scoped test discovery found registry, mode-toggle, message/layout, and helper suites, but no test references to `findMatchingSpawnAgent` or `SpawnAgentsComponent`.

## 8-domain disposition

- Security: unsafe external-CLI permission defaults found; no credential rendering issue proven in this shard.
- Correctness: duplicate-type reconciliation and stale registry cache found.
- State mutation: derived registry cache invalidation and optimistic block identity covered.
- Error handling: local-agent failures are log-only; eval abort classification is lossy.
- Performance: sequential final checks and expanded-list calculation/scroll model reviewed.
- Dependency hygiene: no package-version/declaration issue established in the scoped files.
- Test coverage: reconciliation/renderer lifecycle gaps found; registry and sharding evaluator coverage are comparatively strong.
- API/ABI contracts: hardcoded “Review” is a misleading UI semantic contract; structured CLI output schema is shared, but lacks permission profile and typed cancellation/timeout fields.
