# CLI/local-agent/eval UX — code-search findings

## [HIGH] correctness / state mutation / API contract — duplicate same-type starts attach to the wrong optimistic agent card

- **Risk:** Two agents of the same type spawned concurrently can exchange prompts, params, nesting, IDs, streamed output, and final results when `subagent_start` events arrive out of request order. Users may see one file-picker/editor apparently performing another child’s task.
- **Fix:** Extend `subagent_start` with a spawn correlation field (`spawnToolCallId` + `spawnIndex`, or an opaque spawn token), match on it, and consume the exact optimistic entry. Keep base-type matching only as a guarded legacy fallback when exactly one candidate exists.
- **Evidence:** `findMatchingSpawnAgent` returns the first insertion-order entry whose base type matches (`cli/src/utils/spawn-agent-matcher.ts:11-24`). Optimistic blocks already store `spawnToolCallId` and `spawnIndex` (`cli/src/utils/sdk-event-handlers.ts:290-325`), but `PrintModeSubagentStart` exposes neither (`common/src/types/print-mode.ts:75-87`), and `handleSubagentStart` passes only `event.agentType` to the matcher (`cli/src/utils/sdk-event-handlers.ts:193-228`). Final spawn results do use index/ID correlation (`cli/src/utils/sdk-event-handlers.ts:424-445`), so start-time reconciliation is the inconsistent leg.

## [HIGH] security / UX — shipped external-CLI agents silently launch with unrestricted permission bypasses

- **Risk:** Selecting these agents starts third-party coding CLIs with approval and sandbox protections disabled, allowing prompt-injected or mistaken instructions to mutate anything available to the process. The structured result does not record a permission profile, and the user gets no per-run risk confirmation.
- **Fix:** Add explicit `read-only`, `workspace-write`, and `full-access` input profiles; default review/exploration to least privilege; require a visible confirmation before full access; include the selected profile in output and the agent card.
- **Evidence:** Codex is hardcoded to `-a never -s danger-full-access` in both definition and serialized handler (`.agents/codex-cli.ts:76-83,95-124`); Claude uses `--dangerously-skip-permissions` (`.agents/claude-code-cli.ts:5-21,40-45`); Gemini uses `--yolo` (`.agents/gemini-cli.ts:5-27,46-51`). `createCliAgent` exposes only work/review mode and no permission field (`.agents/lib/create-cli-agent.ts:20-62`).

## [MEDIUM] correctness / UX — local-agent source links use a second, narrower loader that disagrees with the SDK

- **Risk:** A valid `.tsx`, `.js`, `.mjs`, or `.cjs` agent can load and run but have no “Open file” link; regex scanning may also associate an ID with a comment/nested object or a different duplicate than the module the SDK actually selected.
- **Fix:** Use the SDK-provided `_sourceFilePath` on each loaded definition as the sole source of truth. Remove the regex directory rescan, or make the SDK return a typed public source-path field.
- **Evidence:** The SDK supports `.ts`, `.tsx`, `.js`, `.mjs`, and `.cjs` and records the actual module path as `_sourceFilePath` (`sdk/src/agents/load-agents.ts:142-157,243-246`). The CLI discards that field and rebuilds paths with `/id\s*:/` while accepting only `.ts` files (`cli/src/utils/local-agent-registry.ts:101-146`), then falls back to `filePath: ''` (`:152-157`). Existing CLI tests even describe non-TypeScript files as artifacts to ignore (`cli/src/__tests__/integration/local-agents.test.ts:292-316`), contradicting the SDK contract.

## [MEDIUM] correctness / state mutation — registry reinitialization does not invalidate derived UI listings

- **Risk:** If initialization is rerun after files or MCP config change, runtime definitions refresh while the `@` menu can continue returning the old cached array, so configuration and visible selection diverge.
- **Fix:** Clear `cachedAgentsByMode` and `cachedAgentsDir` at registry refresh boundaries; expose one supported reload operation that atomically returns agents, paths, MCP config, and diagnostics.
- **Evidence:** `initializeAgentRegistry` replaces `userAgentsCache`, `userAgentFilePaths`, and `mcpServersCache` (`cli/src/utils/local-agent-registry.ts:55-87`) but does not clear `cachedAgentsByMode`; `loadLocalAgents` returns the cached reference before reading refreshed state (`:232-249`) and populates it at `:299`. Only the test reset clears it (`:451-460`). The multi-initialize test checks deduplication but never caches a listing between changed initializations (`cli/src/__tests__/integration/local-agents.test.ts:1025-1051`).

## [MEDIUM] UX / API contract — every `spawn_agents` tool call is mislabeled as “Review”

- **Risk:** Discovery, research, implementation, testing, and debugging batches all appear as review stages. Collapsed histories become semantically misleading and users cannot tell why a batch exists or whether it is still queued/running/failed.
- **Fix:** Default to “Spawned N agents” and render structured phase/purpose when supplied; include queued/running/succeeded/failed counts and short per-agent prompt summaries.
- **Evidence:** `SpawnAgentsComponent` explicitly documents itself as “the reviewer stage,” hardcodes `const header = 'Review'`, and reduces all inputs to comma-separated types (`cli/src/components/tools/spawn-agents.tsx:8-46`). The runtime uses `spawn_agents` generically, and the CLI separately creates lifecycle-aware agent blocks for every requested child (`cli/src/utils/sdk-event-handlers.ts:290-330`). No focused renderer test was found.

## [MEDIUM] UX / correctness — expanded dependency rows are absent from keyboard focus and scroll geometry

- **Risk:** In a large local-agent graph, expanded descendants add many visual rows while focus remains indexed only over top-level agents. Arrow navigation can scroll the wrong location or leave the focused row offscreen, and dependency entries cannot be reached or expanded by keyboard.
- **Fix:** Flatten top-level agents and visible dependency nodes into one keyboard-navigation model with measured row offsets; add left/right or Enter affordances for expansion and expose missing/cyclic dependencies in-row.
- **Evidence:** Focus scrolling assumes one line per `filteredAgents` item and computes `focusedTop = focusedIndex` (`cli/src/components/agent-checklist.tsx:194-215`), while `DepTree` inserts recursive rows after that top-level item (`:257-381`). `needsScroll` also compares only `filteredAgents.length` to height (`:227`), excluding expanded rows.

## [LOW] error handling / UX — catastrophic registry failures are log-only and erase all local-agent visibility

- **Risk:** A loader-level failure (as opposed to an ordinary bad file) replaces every user agent/path with empty caches and surfaces only a log warning, leaving the picker indistinguishable from “no agents configured.” File-path scan failures are also swallowed, hiding why links are missing.
- **Fix:** Retain the last known-good registry on refresh failure and surface typed startup/picker diagnostics with source path and retry/open actions.
- **Evidence:** The outer loader catch empties both caches and only calls `logger.warn` (`cli/src/utils/local-agent-registry.ts:55-69`); path reads/directories use empty catches (`:110-139`). `getLoadedAgentsData` returns `null` when nothing remains (`:433-444`), providing no error state to the UI.

## [LOW] performance / eval feedback — final checks are serial and timeout/cancellation collapse into exit code 1

- **Risk:** Independent eval checks consume wall time sequentially and a check aborted by the shared 60-minute signal is reported like an ordinary command failure, obscuring harness exhaustion versus product failure.
- **Fix:** Add typed outcomes and elapsed time; support per-check timeouts and bounded parallel groups while preserving explicit sequential groups for dependent commands.
- **Evidence:** Agent execution and final checks share one timeout signal (`evals/buffbench/agent-runner.ts:89-97,174-196`). `runFinalCheckCommands` awaits commands in a `for` loop and coerces nonnumeric abort codes to `1` (`:227-265`).

## [LOW] test coverage gap — spawn reconciliation and spawn renderer lack focused regression coverage

- **Risk:** Same-type batches, out-of-order starts, nested parents, cancellation-before-start, unmatched starts, and phase-neutral rendering can regress without a targeted failure.
- **Fix:** Add table-driven matcher/handler tests with two identical types across one and multiple batches, reversed starts, correlation metadata, nested parents, cancellation cleanup, and renderer snapshots/status assertions.
- **Evidence:** `cli/src/utils/__tests__/sdk-event-handlers.test.ts` covers failed finish state, but scoped search found no direct tests for `findMatchingSpawnAgent` or `SpawnAgentsComponent`; the event schema itself currently cannot express the required correlation.

## Rejected or narrowed candidates

- **Rejected:** “One invalid local-agent file clears the entire menu.” The SDK catches import/runtime/validation problems per file and continues (`sdk/src/agents/load-agents.ts:219-270`); CLI integration tests confirm a valid agent survives a syntax-error neighbor (`cli/src/__tests__/integration/local-agents.test.ts:920-954`). The remaining finding is only for catastrophic outer-loader failure and log-only diagnostics.
- **Narrowed:** Serial final checks are not inherently incorrect because commands may depend on earlier checks. The defect is lack of dependency/concurrency metadata and loss of timeout/cancel classification, so severity remains LOW.
- **Narrowed:** Cached listings are currently initialized mainly at startup (`cli/src/index.tsx:286-290`), so stale-cache impact is reload/development/future-watch UX rather than every ordinary run.

## Coverage across all 8 domains

- **Security:** unrestricted external CLI profiles verified; no credential text leak proven in the scoped renderers.
- **Correctness:** same-type spawn reconciliation, source-path contract mismatch, stale derived listings, and expanded-row geometry verified.
- **State mutation:** optimistic map consumption and registry cache invalidation traced through callers.
- **Error handling:** ordinary bad files are isolated; catastrophic registry failure and eval abort classification remain weak.
- **Performance:** expanded list geometry and serial final checks reviewed; no render-loop hotspot proven.
- **Dependency hygiene:** no undeclared or vulnerable package dependency established in this shard.
- **Test coverage:** focused matcher/renderer, JS-agent source-link, refresh-after-cache, keyboard-expanded-tree, and permission-profile tests are missing.
- **API/ABI contracts:** `subagent_start` lacks spawn correlation; SDK source-file support and CLI listing disagree; external CLI output lacks permission metadata; “Review” is a misleading generic tool semantic.
