# Changelog

All notable changes to the @openbuff/sdk package will be documented in this file.

## [0.11.0] - 2026-06-29

First public release of `@openbuff/sdk` (forked lineage from Codebuff SDK; see `docs/codebuff-to-openbuff-migration.md`).

### Added — Provider layer

- Multi-provider router with per-model failover chains and retry config (`ProviderConfig`, `RetryConfig`). Honors provider-declared `context.windowTokens` with a safe fallback when absent.
- New built-in tools: `git_branch`, `git_status`, `apply_patch`, `str_replace` (with `edit_transaction` atomic batch), `read_subtree`, `read_outline`, `read_image`, `query_index`, `code_search`, `run_terminal_command`, `list_directory`, `glob`, `file_picker`.
- Cost accounting + token usage tracking per run, surfaced in `RunResult.output`.
- `skillsDir` SDK option to load custom skills from a directory.
- `code_map` indexer: tree-sitter-powered symbol extraction with `query_index` graph edges, reference/blast-radius mode, and deterministic `.openbuff.d/indexing.json` schema.

### Added — Agent runtime

- `base2` orchestrator with a validation/reviewer gate, gate-repair loop, coverage verdicts, craftsmanship prompt sections, and session-state `AgentOutput` schema.
- Bundled agents: `debugger`, `doc-writer`, `git-committer`, `security-reviewer`, `test-writer`, `librarian`, `context-pruner`, `researcher`, `thinker`, `synthesizer`.
- Subagent timeouts, background agents, budget enforcement, and parallel I/O for `read_files` / `read_image`.
- `handleSteps` generators now receive `hitStepCap` in `TNext` so orchestrators can break out on the step cap instead of falling through to the gate.

### Fixed

- `suggest_followups` is now retracted mid-step the moment a file-changing tool executes (both in `base2`'s edits-detected blocks and in `tool-executor.ts`), preventing same-step follow-up suggestions after edits.
- Step-cap early-return no longer causes an infinite validation/reviewer gate loop: `runAgentStep` returns `hitStepCap`, threaded through `loopAgentSteps` → `runProgrammaticStep` → `generator.next({ hitStepCap })`, and `base2` breaks out of its `while(true)` when it fires.
- `runAgentStep` resolves the agent's model from `agentId` before failover, fixing the "Agent run error: undefined" regression.
- `prebuild-agents.ts` requires only `definition.id` (not `definition.model`), so all 30 valid agents bundle into the CLI binary instead of just the two with hardcoded models.
- `write_file` is deterministic — no longer expands `// ... rest of the function ...` snippets. Use `str_replace` or `apply_patch` for partial edits.
- Provider config honors `context.windowTokens`; missing values fall back to a safe default.

### Changed

- Removed `isLocalMode` / `localMode` flag and the `LOCAL_MODE_API_KEY` sentinel; local-mode plumbing and hosted-backend DB/auth/email surfaces purged.
- Debug-log message history capped to the last 50 messages to bound memory.
- Removed dead `_sendSubagentChunk` and per-iteration `cloneDeep`.

## [0.10.7]

- New code editing tool `apply_patch` which works well with Codex models (e.g. openai/gpt-5.3-codex)
- `write_file` is now a deterministic tool that creates or replaces the file. Previously, it also accepted edit snippet comments which could expand to keep a portion of the previous file, e.g. "// ... rest of the function ...". That behavior is removed to keep things simple. `str_replace` or `apply_patch` should be used if not overwriting the whole file.

## [0.10.6]

Added `skillsDir` parameter to specify a directory to load skills from.

## [0.10.5]

Fixed a bug with missing tool calls/results.

## [0.10.4]

Updated with various agent runtime improvements.

## [0.10.1]

More reliable tool calls!

## [0.10.0]

Lots of changes in the implementation, including native tool calls under the hood. Minimal changes in the public API.

## [0.4.3]

### Added

- Exported `processToolCallBuffer` and state helpers so SDK consumers can strip `<codebuff_tool_call>` segments mid-stream.
- CLI now consumes the shared helper to avoid leaking XML when responses arrive without token streaming.
- Extra regression tests covering multi-chunk tool-call payloads based on the CLI log case ("I'll help you commit").

## [0.4.2]

### Added

- XML tool call filtering in stream chunks - filters out `<codebuff_tool_call>` tags while preserving response text
- Stateful parser handles tags split across chunk boundaries
- 50-character safety buffer for split tag detection
- Comprehensive unit tests (17 test cases)

## [0.3.1]

- `CodebuffClient.run` now does not return `null`. Instead, the `CodebuffClient.run(...).output.type` will be `'error'`.

## [0.3.0]

- New more intuitive interface for `CodebuffClient` and `CodebuffClient.run`.

## [0.1.30]

Types updates.

## [0.1.20]

- You can now retrieve the output of an agent in `result.output` if result is the output of an awaited `client.run(...)` call.
- cwd is optional in the CodebuffClient constructor.
- You can pass in `extraToolResults` into a run() call to include more info to the agent.

## [0.1.17]

### Added

- You can now get an API key from the [Codebuff website](https://www.codebuff.com/profile?tab=api-keys)!
- You can provide your own custom tools!

### Updated

- Updated types and docs

## [0.1.9] - 2025-08-13

### Added

- `closeConnection` method in `CodebuffClient`

### Changed

- Automatic parsing of `knowledgeFiles` if not provided

### Fixed

- `maxAgentSteps` resets every run
- `CodebuffClient` no longer requires binary to be installed

## [0.1.8] - 2025-08-13

### Added

- `withAdditionalMessage` and `withMessageHistory` functions
  - Add images, files, or other messages to a previous run
  - Modify the history of any run
- `initialSessionState` and `generateInitialRunState` functions
  - Create a SessionState or RunState object from scratch

### Removed

- `getInitialSessionState` function

## [0.1.7] - 2025-08-12

### Updated types! AgentConfig has been renamed to AgentDefinition.

## [0.1.5] - 2025-08-09

### Added

- Complete `CodebuffClient`
- Better docs
- New `run()` api

## [0.0.1] - 2025-08-05

### Added

- Initial release of the Codebuff SDK
- `CodebuffClient` class for interacting with Codebuff agents
- `runNewChat` method for starting new chat sessions
- TypeScript support with full type definitions
- Support for all Codebuff agent types
- Event streaming for real-time responses
