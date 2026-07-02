# Harness Audit Report

Session: `.agents/sessions/harness-audit-2026-06-30/`

Sources read: `COVERAGE-MATRIX.md` and all 15 markdown files under `findings/`. No project source files were read for this synthesis.

Findings considered: **123** shard finding entries. Deduplication merged two repeated issues: `code_search.cwd` symlink escape (S4/S8) and `NEXT_PUBLIC_OPENBUFF_APP_URL` docs/schema drift (S11/S15). Unique issues/patterns represented here: **121**.

## Top 10

1. `sdk/src/run.ts:827` — **Security** — **HIGH** — `run_terminal_command.cwd` can escape the project root, giving agents shell access outside the audited workspace.
2. `packages/agent-runtime/src/tools/handlers/tool/write-file.ts:154` — **Security / Correctness** — **HIGH** — truthy `basedOnRead` bypasses strict overwrite/freshness gates without validating the capability.
3. `packages/agent-runtime/src/run-programmatic-step.ts:296` — **Security** — **HIGH** — stringified `handleSteps` are executed via `new Function`, creating an RCE boundary if templates are ever untrusted.
4. `sdk/src/model-discovery.ts:122` — **Security** — **HIGH** — custom discovery endpoints can receive provider API keys cross-origin.
5. `common/src/mcp/client.ts:57` — **Security / State mutation / API/ABI** — **HIGH** — remote MCP client cache keys ignore headers, allowing stale/wrong Authorization reuse.
6. `cli/src/hooks/helpers/send-message.ts` lines `279–310` — **State mutation / Correctness** — **HIGH** — abort releases CLI chain locks while the old SDK stream can still mutate shared run state.
7. `evals/buffbench/agent-runner.ts` lines `62–145` — **State mutation / Error handling / Performance** — **HIGH** — eval timeouts reject the wrapper promise but do not abort underlying agents/processes.
8. `agents/base2/base2.ts:638` — **Security / Correctness** — **HIGH** — `<gate-state>` reuse trusts unscoped conversation text and can skip validation/review.
9. `packages/indexer/src/index-manager.ts:101` — **State mutation / Correctness** — **HIGH** — `markStale()` does not force the next `query()` to refresh, so index results can remain stale after edits.
10. `common/src/tools/list.ts:133` — **API/ABI contract breaks** — **HIGH** — SDK advertises client tools that `handleToolCall` cannot execute (`apply_smart_patch`, `ask_user`, `query_index`).

## Cross-cutting findings

- **Cancellation is mostly preflight-only, not propagation.** S4 reports runtime tool `AbortSignal` is checked before dispatch but not passed to client tools/child processes (`packages/agent-runtime/src/tools/tool-executor.ts:591`); S7 reports provider LLM requests and retry sleeps do not receive the run signal (`sdk/src/impl/llm.ts:735`); S9 reports CLI abort can release locks before old streams stop mutating shared refs; S13 reports eval task timeouts do not abort underlying runners/final checks. Treat cancellation as an end-to-end contract spanning CLI, runtime, SDK, providers, subprocesses, and eval workers.
- **Path containment is inconsistent across tool surfaces.** S2 flags `read_outline` path normalization (`packages/agent-runtime/src/tools/handlers/tool/read-outline.ts:25`); S4/S8 flag `code_search.cwd` symlink escape (`sdk/src/tools/code-search.ts:61` / `:45`); S4 flags terminal `cwd` project escape (`sdk/src/run.ts:827`); S5 flags gate path normalization allowing absolute non-cwd paths (`agents/base2/gate-paths.ts:15`). Consolidate on one realpath-aware project-boundary helper.
- **Schema/registry/handler drift appears in multiple layers.** S4 finds `check_job.kill_on_timeout` dropped by the runtime handler; S6 finds stale public tool aliases and undeclared programmatic `set_output` yields; S8 finds SDK client tool and `ToolHelpers` surface drift; S11/S15 find env contract drift; S14 finds `/setup` config merge dropping fields. Add generated registry consistency tests.
- **Freshness and cache invalidation are recurring failure modes.** S2 stale read/edit authorizations, S11 MCP header-insensitive client cache, S12 stale index/query/command concepts, and S14 fragmented config cache all show state keyed by incomplete freshness inputs.
- **UI/run state races cluster around shared mutable refs.** S9 identifies abort/queue/stream refs that can be released by stale owners; S10 identifies render-boundary and hot-render risks that magnify corrupted or malformed message state. Generation tokens/ownership checks should be used wherever async work writes shared refs.

## Security

### HIGH

- `sdk/src/run.ts:827` — `run_terminal_command.cwd` can escape the project root. Resolve cwd with the same realpath containment helper as file tools before starting sync/background commands.
- `packages/agent-runtime/src/tools/handlers/tool/write-file.ts:154` — `basedOnRead` bypasses strict overwrite gates without freshness validation. Decode and validate capabilities before authorizing writes.
- `packages/agent-runtime/src/run-programmatic-step.ts:296` — stringified `handleSteps` executed via `new Function`. Restrict string handlers to trusted local templates or require explicit consent.
- `sdk/src/model-discovery.ts:122` — custom model-discovery endpoint can receive configured provider API keys cross-origin. Only attach auth to same-origin discovery endpoints unless explicitly opted in.
- `common/src/mcp/client.ts:57` — remote MCP cache key ignores headers. Include normalized headers in `hashConfig()` for HTTP/SSE clients.
- `agents/base2/base2.ts:638` — conversation `<gate-state>` reuse trusts unscoped message text. Accept gate passes only from runtime-owned state or nonce/fingerprint-bound messages.

### MEDIUM

- `sdk/src/tools/code-search.ts:61` / `sdk/src/tools/code-search.ts:45` — `code_search.cwd` uses lexical checks and can follow in-project symlinks outside the repo. Deduplicated from S4 and S8.
- `packages/agent-runtime/src/tools/handlers/tool/read-outline.ts:25` — `read_outline` path is not normalized before file access.
- `agents/base2/gate-paths.ts:15` — gate path normalizer claims project containment but allows absolute non-cwd paths.
- `packages/agent-runtime/src/util/cache-debug.ts:241` — full cache-debug snapshots persist prompts/message history in the repo.
- `packages/code-map/src/init-node.ts:21` — missing-WASM path downloads executable parser WASM from public CDNs without integrity verification.
- `evals/buffbench/setup-test-repo.ts` lines `108–155` — GitHub token prefixes/lengths and inherited git diagnostics can leak authentication metadata in eval logs.

### LOW

- `scripts/generate-tool-definitions.ts:47` — Prettier shell command interpolates absolute paths into a shell command string.
- `packages/agent-runtime/src/run-agent-step.ts:~1438` — user-facing errors can include raw stack traces and internal paths.

## Correctness

### HIGH

- `packages/agent-runtime/src/tools/handlers/tool/str-replace.ts:75` — invalid `basedOnRead` can clear failed-edit/strict gates and then be auto-stripped by `processStrReplace`.
- `agents/base2/base2.ts:769` — static background reviewer can be reused after validation failure and review stale code.
- `packages/indexer/src/query.ts:140` — `mode: 'commands'` scores persisted command concepts without a command-file freshness check.
- `evals/buffbench/run-plan-sharding-eval.ts` lines `40–45` — plan-sharding eval default prompt bypasses the M10 broad-audit gates it is intended to test.
- `evals/buffbench/plan-sharding-signals.ts` lines `340–374` — repeated `spawn_agents` agent types collapse to one in early/truncated traces.
- `evals/buffbench/plan-sharding-signals.ts` lines `560–735` — coverage/subsystem enumeration validates prompt tokens, not planner output.

### MEDIUM / MEDIUM-HIGH

- `agents/base2/base2.ts:35` — `hasNoValidation` is prompt-only while runtime gates still key off hard-coded agent IDs.
- `agents/base2/base2.ts:1061` — static-review join waits only for `LOOKS_GOOD` although `NON_BLOCKING` is accepted.
- `cli/src/hooks/use-message-queue.ts` lines `60–195` — queue processing mixes stale closure state and mutable refs.
- `cli/src/hooks/use-message-queue.ts` lines `220–230` — `stopStreaming` sets idle status without clearing `streamMessageIdRef`, creating a queue hang path.
- `cli/src/hooks/use-send-message.ts` lines `~115–130` — stale `previousRunStateRef` can be written back after clear/resume races.
- `cli/src/hooks/use-suggestion-engine.ts` lines `~500–540` — file-tree refresh depends only on mention activation and ignores query changes.
- `cli/src/hooks/use-input-history.ts` lines `58–66` — `setTimeout(0)` navigation flags can race input-mode reset effects.
- `packages/agent-runtime/src/util/messages.ts:315` — kept messages can make trimming return over budget.
- `packages/agent-runtime/src/tools/tool-executor.ts:~470` — queued `tool_start` emission ignores barrier rejection.
- `packages/agent-runtime/src/tools/stream-parser.ts:~530` — abort snapshot can drop or orphan tool results.
- `packages/agent-runtime/src/run-agent-step.ts:~870` — `/compact` can irreversibly overwrite history with empty/garbage summary.
- `sdk/src/impl/llm.ts:1134` — BYOK cost accounting reads stale `providerMetadata.codebuff` rather than the new `openbuff` namespace.
- `sdk/src/tools/background-jobs.ts:421` — recovered shell jobs reset `readOffset` to zero and duplicate old output.
- `sdk/src/provider-config.ts:989` — fragmented `openbuff.d` edits do not invalidate provider config cache.
- `evals/buffbench/run-buffbench.ts` lines `474–528` — any one agent error excludes all agents for the commit from summaries.
- `evals/buffbench/judge.ts` lines `225–267` — judge prompt omits generated task `spec`, breaking generation/scoring parity.
- `packages/indexer/src/metadata-indexer.ts:159` — same-size/same-mtime content mutations are never hashed.
- `packages/code-map/src/languages.ts:280` — indexer lowercases extensions but code-map lookup is case-sensitive.
- `packages/indexer/src/metadata-indexer.ts:20` / `packages/code-map/src/languages.ts:121` — indexer/code-map supported language sets drift.
- `packages/agent-runtime/src/process-str-replace.ts:291` — `occurrenceIndex` bypasses large-file freshness anchors.
- `scripts/check-tool-registration.ts:49` — tool registration guard can pass on incidental substring matches.

### LOW

- `sdk/src/tools/glob.ts:34` — invalid `glob.cwd` silently broadens to the whole project.
- `packages/agent-runtime/src/run-agent-step.ts:~552` — malformed best-of-N JSON silently degrades to one candidate.
- `packages/agent-runtime/src/main-prompt.ts:~95` — unknown cost mode silently falls back to `base2`.
- `packages/agent-runtime/src/util/simplify-tool-results.ts:28` — `read_files` error entries can be simplified into content omissions.
- `cli/src/project-files.ts` lines `27–35` — `getCurrentChatId()` auto-generates on first read before resumed chat id may be set.
- `cli/src/hooks/use-chat-state.ts` lines `132–144` — comma-joined streaming agent key can collide if IDs contain commas.
- `cli/src/components/command-palette-screen.tsx` lines `37–40` — command palette searches only the first 50 flattened file entries.
- `cli/src/hooks/use-searchable-list.ts` lines `62–83` — focus clamping is length-based, not item-identity based.

## State mutation

### HIGH

- `packages/agent-runtime/src/tools/handlers/tool/read-files.ts:70` — failed reads clear stale-edit guards and grant sticky edit authorization.
- `cli/src/hooks/helpers/send-message.ts` lines `279–310` — abort releases chain/queue locks while old `client.run()` can still mutate shared stream refs.
- `packages/indexer/src/index-manager.ts:101` — `markStale()` does not make the next `query()` refresh.
- `sdk/src/impl/llm.ts:735` — run cancellation is not propagated into provider LLM requests or retry sleeps.
- `evals/buffbench/agent-runner.ts` lines `62–145` — timed-out eval tasks can continue mutating repos/logs after being marked errored.

### MEDIUM

- `packages/agent-runtime/src/tools/stream-parser.ts:~330` — same-path write barrier cleanup depends on fragile microtask ordering.
- `packages/agent-runtime/src/util/messages.ts:171` — singleton replacement message object is reused across histories.
- `packages/indexer/src/metadata-indexer.ts:159` — unchanged metadata prevents content hash refresh.
- `common/src/mcp/client.ts:57` — header-insensitive MCP cache reuses stale authenticated clients.
- `sdk/src/provider-config.ts:989` — config cache ignores expanded fragment freshness.
- `cli/src/hooks/use-message-queue.ts` lines `130–185` — watchdog is not cleared by abort-path queue release.
- `cli/src/hooks/use-send-message.ts` lines `~510–560` — checkpoint/resume state is not atomically consumed.

### LOW

- `packages/agent-runtime/src/run-programmatic-step.ts:~470` — generator registry owner mappings can race with `clearAll`.
- `agents/base2/base2.ts:932` — escalation state lacks the same marker/telemetry tests as repair-incomplete.
- `packages/code-map/src/languages.ts:144` — `setWasmDir()` cannot reliably affect already cached language configs.
- `cli/src/project-files.ts` lines `13–25` — module-level project root resolver can leak across tests/module instances.

## Error handling

### HIGH

- `packages/indexer/src/metadata-indexer.ts:119` / `packages/code-map/src/parse.ts:252` — tree-sitter failures are swallowed into empty symbols/calls.
- `evals/buffbench/agent-runner.ts` lines `162–194` — final check commands have no timeout or cancellation path.

### MEDIUM

- `packages/agent-runtime/src/tool-stream-parser.ts:121` — malformed tool input parse errors go only to `console.debug`.
- `packages/agent-runtime/src/tools/tool-executor.ts:591` — abort signal is checked only before client-tool dispatch.
- `packages/agent-runtime/src/tools/handlers/tool/check-job.ts:23` — `kill_on_timeout` is accepted by schema/SDK but dropped by runtime handler.
- `sdk/src/model-discovery.ts:280` — model discovery fetches have no timeout or cancellation path.
- `agents/base2/base2.ts:1061` — static-review wait contract can timeout on accepted verdicts.
- `evals/buffbench/run-buffbench.ts` lines `610–650` — commit-level error filtering hides per-agent success/failure distinctions.
- `evals/buffbench/setup-test-repo.ts` lines `255–275` — `initCommand.split(' ')` misparses quoted/compound setup commands.
- `agents/types/agent-definition.ts:380` — stale tool aliases create confusing unsupported-tool/error paths for custom agents.

### LOW

- `packages/agent-runtime/src/util/format-value.ts:2` — error formatter can throw while building validation errors.
- `packages/agent-runtime/src/tools/stream-parser.ts:~525` — generator cleanup errors from `streamWithTags.return()` are swallowed.
- `cli/src/hooks/use-exit-handler.ts` lines `65–95` — Ctrl-C warning timer is not stored/cleaned up.
- `cli/src/hooks/use-clipboard.ts` lines `60–125` — async copy completion can update state after unmount.

## Performance

### HIGH

- `evals/buffbench/agent-runner.ts` lines `62–145` — non-aborted task timeouts can leave expensive model/CLI work running.

### MEDIUM

- `packages/agent-runtime/src/util/stream-xml-parser.ts:83` — unterminated streamed tool calls buffer unbounded text.
- `sdk/src/model-discovery.ts:280` — no timeout/cancel on arbitrary discovery endpoints can hang setup flows.
- `cli/src/hooks/use-chat-streaming.ts` lines `113–122` — unstable timer object dependency can cause extra renders during ask-user pauses.
- `cli/src/hooks/use-chat-keyboard.ts` lines `300–340` — keyboard listener is rebound on broad state/handler changes during streaming.
- `cli/src/chat.tsx` lines `~1244–1260` — chat keyboard handlers over-include large arrays, causing render churn.
- `cli/src/components/shimmer-text.tsx` lines `147–153` — each shimmer starts an interval; empty text can tick with `NaN` state.
- `cli/src/components/prompt-history-search-screen.tsx` lines `95–103` — history/file overlays perform synchronous heavy work on mount/keystroke.
- `cli/src/components/message-with-agents.tsx` lines `104–153` — markdown/copy text is recomputed in render despite memo wrappers.
- `cli/src/components/agent-checklist.tsx` lines `156–188` — scroll math/recomputed dependency trees ignore expanded rows.

### LOW

- `packages/agent-runtime/src/tools/tool-executor.ts:~640` — `getMCPToolData` with `cloneDeep` runs per custom tool call.
- `packages/indexer/src/metadata-indexer.ts:192` — every incremental code edit re-scores all code files.
- `cli/src/hooks/use-input-history.ts` lines `60–75` — synchronous history disk read happens on every send.
- `sdk/src/__tests__/glob.test.ts:13` / related tests — mocked filesystem boundaries leave integration performance/behavior untested.

## Dependency hygiene

### MEDIUM

- `openbuff.d/routes.json:22` / `agents/file-explorer/glob-matcher.ts:36` — bundled support agents carry hardcoded provider model IDs that conflict with route config.
- `packages/code-map/src/init-node.ts:21` — parser WASM self-healing downloads executable code from CDNs without integrity verification.
- `evals/buffbench/eval-task-generator.ts` lines `1–24` — eval task generation imports helper agents from `agents-graveyard`.
- `agents/base2/base2.ts:2649` — escalation prompt helper is inline-only, unlike extracted repair helpers.

### LOW

- `packages/agent-runtime/src/util/messages.ts:6` — full lodash import for one `isEqual` helper.
- `agents/base2/gate-state.ts:52` — `MAX_REPAIR_ROUNDS` is documented in public state comments but not exported as a shared constant.
- `agents/basher.ts:60` — basher tool list omits the structured-output tool it yields, creating an undocumented contract exception.

## Test coverage gaps

### HIGH

- `evals/buffbench/plan-sharding-signals.ts` lines `512–526` — no test ensures the default plan-sharding prompt triggers broad-audit minimum shard gates.
- `evals/buffbench/plan-sharding-signals.ts` lines `443–452` — no repeated-agent-type batch test for M10 pair counting.
- `packages/indexer/src/index-manager.test.ts:5` — `markStale()` test does not assert query freshness changes.

### MEDIUM

- `agents/general-agent/general-agent.ts:95` — no regression ensures inline `context-pruner` does not consume spawn depth before `general-agent` acts.
- `agents/base2/base2.ts:932` — escalation success/failure state lacks marker/telemetry coverage.
- `agents/base2/base2.ts:2649` — escalation prompt lacks parity/unit tests.
- `sdk/src/__tests__/run-cancellation.test.ts` — cancellation tests do not assert provider-request abort or abortable retry sleep.
- `sdk/src/__tests__/code-search.test.ts:19` — search-tool tests mock ripgrep instead of exercising vendored binary/path boundaries.
- `packages/indexer/src/metadata-indexer.test.ts:35` — tests do not cover same-size/same-mtime mutation or command freshness.
- `evals/buffbench/__tests__/proposals.test.ts` — no smoke test validates eval helper agents/tools against current local agent registry.
- `common/src/tools/params/tool/read-docs.ts:24` — documented defaults lack schema snapshot/parse coverage.

### LOW

- `packages/agent-runtime/src/tool-stream-parser.ts` — no abort-buffer flush unit test.
- `packages/agent-runtime/src/util/agent-output.ts:63` — output shaping lacks nearby tests for externally visible output modes.
- `scripts/check-tool-registration.ts:49` — raw substring guard lacks negative test coverage.

## API/ABI contract breaks

### HIGH

- `common/src/tools/list.ts:133` — SDK exposes client tool variants that SDK dispatch cannot execute.
- `common/src/tools/list.ts:133` / `sdk/src/run.ts:899` — unsupported SDK-local tools fail at runtime unless removed or implemented.
- `evals/buffbench/plan-sharding-signals.ts` lines `560–735` — eval coverage API claims planner-output coverage but derives it from prompt tokens.

### MEDIUM / MEDIUM-HIGH

- `agents/base2/base2.ts:35` — `hasNoValidation` public option does not control runtime gates.
- `agents/types/agent-definition.ts:380` — public tool alias types are stale relative to actual tool registry.
- `agents/editor/editor.ts:31` / `agents/editor/editor.ts:62` — editor exposes `set_output` while prompt says not to use it.
- `sdk/src/tools/index.ts:13` — `ToolHelpers` does not mirror SDK runtime tool surface.
- `sdk/src/custom-tool.ts:16` — custom SDK tools cannot observe run cancellation.
- `sdk/src/provider-config.ts:1964` — `/setup` merge drops existing `failoverModels` and `maxAgentSteps`.
- `docs/configuration.md:93` — docs say agent template models are ignored, but runtime uses them as last-resort requested model.
- `docs/architecture.md:187` — compatibility docs omit still-supported ChatGPT OAuth token alias.
- `common/src/env-schema.ts:8` / `docs/environment-variables.md:33` — implemented `NEXT_PUBLIC_OPENBUFF_APP_URL` is absent from env docs. Deduplicated from S11 and S15.
- `common/src/env-schema.ts:8` / `docs/codebuff-to-openbuff-migration.md:104–109` — migration docs contradict implemented public app URL alias behavior.
- `evals/buffbench/eval-task-generator.ts` lines `31–46` — task `spec` is generated/stored but omitted from judge rubric.
- `evals/buffbench/setup-test-repo.ts` lines `255–275` — `initCommand: string` contract is not shell-compatible despite being user-authored config.
- `packages/indexer/src/metadata-indexer.ts:20` — indexer/code-map extension tables drift, changing public `query_index` symbol behavior by language.

### LOW

- `packages/agent-runtime/src/util/agent-output.ts:88` — `all_messages` output silently drops the first message.
- `packages/code-map/src/languages.ts:144` — `setWasmDir()` public API is effectively pre-initialization-only but not documented/enforced.
- `common/src/tools/params/tool/read-docs.ts:24` — schema default (`10_000`) disagrees with description (`20_000`).
- `agents/base2/gate-state.ts:52` — repair-round public state comment relies on non-exported local constant.
- `agents/basher.ts:60` — programmatic `set_output` yield is absent from declared tool list.

## Coverage

Coverage source: `.agents/sessions/harness-audit-2026-06-30/COVERAGE-MATRIX.md`.

The coverage matrix states that all 8 audit domains were evaluated by all 15 shards and that every top-level entry from the structural map was either audited or explicitly marked out of scope.

| Shard | Scope | Findings file | Covered |
| --- | --- | --- | --- |
| S1 | agent-runtime: loop & streaming | `findings/S1-runtime-loop.md` | yes |
| S2 | agent-runtime: deterministic edits & reads | `findings/S2-runtime-edits.md` | yes |
| S3 | agent-runtime: context, tokens, pruning | `findings/S3-runtime-context.md` | yes |
| S4 | agent-runtime: tools/handlers (file/edit/search) | `findings/S4-runtime-tools.md` | yes |
| S5 | agents: base2 family + gate lifecycle | `findings/S5-agents-base2-gates.md` | yes |
| S6 | agents: support agents | `findings/S6-agents-support.md` | yes |
| S7 | SDK: client, run, providers, failover | `findings/S7-sdk-providers.md` | yes |
| S8 | SDK: tools surface + tests | `findings/S8-sdk-tools.md` | yes |
| S9 | CLI: streaming, hooks, send-message | `findings/S9-cli-streaming.md` | yes |
| S10 | CLI: components & screens | `findings/S10-cli-components.md` | yes |
| S11 | common: schemas, types, utilities | `findings/S11-common-schemas.md` | yes |
| S12 | packages/indexer + packages/code-map | `findings/S12-indexer-code-map.md` | yes |
| S13 | evals/buffbench harness | `findings/S13-evals-harness.md` | yes |
| S14 | scripts, guards, openbuff.d config surface | `findings/S14-scripts-config.md` | yes |
| S15 | docs drift against implementation | `findings/S15-docs-drift.md` | yes |

Out-of-scope handling from `COVERAGE-MATRIX.md`: audited top-level entries included `cli/`, `packages/`, `sdk/`, `common/`, `agents/`, `evals/`, `scripts/`, `docs/`, `openbuff.d/`, `openbuff.json`, and `package.json`. Entries such as lockfiles, local tool state, graveyard/dead code, session artifacts, CI metadata, backup configs, local binaries, general README/policy/platform docs, lint/compiler/format configs, scratch files, legal notices, and local environment metadata were marked out of scope with reasons in the matrix.

## Synthesis notes

- Locations are preserved from shard files where available, including approximate line markers such as `~470`.
- Findings that lacked enough evidence in the shard text were not promoted beyond the shard-provided claim.
- Several low-severity UI lifecycle observations from S9/S10 are summarized under their owning domain rather than expanded individually; the source finding files remain the implementation backlog for exhaustive per-hook details.
