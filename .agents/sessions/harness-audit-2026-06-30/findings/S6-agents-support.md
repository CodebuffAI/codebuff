# Shard S6 — Support agents

**Auditor:** harness-audit-2026-06-30 / S6
**Scope:** `agents/file-explorer/**`, `agents/editor/**`, `agents/reviewer/**`, `agents/thinker/**`, `agents/researcher/**`, `agents/synthesizer/**`, `agents/debugger/**`, `agents/security-reviewer/**`, `agents/doc-writer/**`, `agents/test-writer/**`, `agents/git-committer/**`, `agents/general-agent/**`, `agents/librarian/**`, `agents/browser-use/**`, `agents/debug/**`, `agents/e2e/**`, plus `agents/basher.ts`, `agents/tmux-cli.ts`, `agents/context-pruner.ts`, `agents/constants.ts`; route/tool/depth references in `openbuff.d/routes.json`, `common/src/constants/agents.ts`, `common/src/tools/constants.ts`, `common/src/tools/list.ts`, `common/src/types/agent-template.ts`, `agents/types/agent-definition.ts`, and `packages/agent-runtime/src/tools/handlers/tool/spawn-agent-utils.ts` / `spawn-agent-inline.ts`.

**Files inspected:** 32 scoped support-agent files plus relevant route/tool/depth/type files. Source was not modified.

## Audit Domains Covered
1. **Security** — prompt/tool boundary, shell/browser agents, path/process tool exposure.
2. **Correctness** — model routing drift, spawn-depth behavior, deterministic `handleSteps` flows.
3. **State mutation** — parent/child message-history mutation, inline pruning, shared spawned-agent state.
4. **Error handling** — unsupported tool paths, spawn-depth rejection, missing-param behavior.
5. **Performance** — repeated inline context pruning, broad support-agent tool loops.
6. **Dependency hygiene** — hardcoded model/provider IDs and stale generated/public type surfaces.
7. **Test coverage gaps** — missing regression coverage for support-agent route/tool/depth invariants.
8. **API/ABI contract breaks** — public agent/tool template types, route contract, spawn-agent semantics.

## Findings

## [HIGH] Correctness / State mutation / Test coverage gaps — `agents/general-agent/general-agent.ts:95` + `packages/agent-runtime/src/tools/handlers/tool/spawn-agent-inline.ts:122` + `packages/agent-runtime/src/tools/handlers/tool/spawn-agent-utils.ts:529` — inline context pruning consumes spawn depth before the agent can act
- **Risk:** A `general-agent` spawned near the configured depth limit can fail before its first model step because it always yields `spawn_agent_inline` for `context-pruner`, and inline spawns go through the same `executeSubagent` depth gate as normal child agents. With the default `MAX_SPAWN_DEPTH_DEFAULT = 3`, a root → specialist → general-agent chain at depth 2 can make the general-agent's first inline pruner spawn depth 3, and a general-agent at depth 3 attempts depth 4 and is rejected before doing useful work. This turns context hygiene into a correctness failure and is easy to miss because the visible user request is for the general agent, not for a nested pruner.
- **Fix:** Treat `spawn_agent_inline` for infrastructure-only `context-pruner` as depth-neutral, or give `context-pruner` / inline maintenance agents an explicit exemption/override with tests. Add a regression where a depth-limit parent spawns `general-agent` and verifies the pre-step pruner does not prevent the child from running.
- **Evidence:** `agents/general-agent/general-agent.ts:95-103` says it runs `spawn_agent_inline` context-pruner before each step; `packages/agent-runtime/src/tools/handlers/tool/spawn-agent-inline.ts:122-143` calls `executeSubagent`; `packages/agent-runtime/src/tools/handlers/tool/spawn-agent-utils.ts:529-535` enforces `(agentTemplate.maxSpawnDepth ?? MAX_SPAWN_DEPTH_DEFAULT)` on every subagent; `common/src/constants/agents.ts:130` sets the default to `3`.

## [MEDIUM] API/ABI contract / Dependency hygiene / Correctness — `openbuff.d/routes.json:22` + `agents/file-explorer/glob-matcher.ts:36` + `agents/file-explorer/directory-lister.ts:33` + `agents/reviewer/code-reviewer.ts:111` — bundled support agents still carry hardcoded provider model IDs that conflict with route config
- **Risk:** `openbuff.d/routes.json` routes support agents such as `thinker`, `editor`, `code-reviewer`, `file-picker`, `code-searcher`, `directory-lister`, `glob-matcher`, `context-pruner`, `basher`, `browser-use`, `researcher-web`, `researcher-docs`, `librarian`, `tmux-cli`, `general-agent`, `synthesizer`, `test-writer`, `security-reviewer`, `debugger`, `doc-writer`, and `git-committer` to `pioneer/pioneer/auto`, but several support-agent definitions still embed Anthropic/alias model values. Even if runtime routing overrides the field, the stale declarations are a contract hazard for publishing, local template validation, snapshots, user-facing docs, and tests that read `definition.model` directly.
- **Fix:** Remove model literals from bundled support-agent definitions where the route is authoritative, or replace them with a generated/validated route alias and add a guard that bundled agent `model` fields either match `openbuff.d/routes.json` or are explicitly absent/documentation-only.
- **Evidence:** `openbuff.d/routes.json:22-45` maps scoped support agents to `pioneer/pioneer/auto`; `agents/file-explorer/glob-matcher.ts:36` and `agents/file-explorer/directory-lister.ts:33` hardcode `anthropic/claude-sonnet-4.5`; `agents/reviewer/code-reviewer.ts:111` hardcodes `anthropic/claude-opus-4.7`; `agents/editor/editor.ts:434` and `agents/general-agent/general-agent.ts:124` instantiate `model: 'opus'` variants despite the route table.

## [MEDIUM] API/ABI contract / Error handling / Test coverage gaps — `agents/types/agent-definition.ts:380` + `common/src/tools/constants.ts:21` — public tool alias types are stale relative to the actual tool registry
- **Risk:** Custom-agent authors importing the public `agents/types/agent-definition.ts` convenience aliases get an incomplete/incorrect tool taxonomy: `FileEditingTools` only includes `read_files | write_file | str_replace`, `CodeAnalysisTools` omits `query_index`, `TerminalTools` includes `code_search` but omits `check_job`/`kill_job`/`read_logs`, `WebTools` omits `browser_logs`/`read_image`, and `AgentTools` omits `check_background_agent`/`spawn_agent_inline`. This is a generated/public API drift issue: agents can compile against stale guidance, avoid newer safer tools, or wrap tools in `spawn_agents` by mistake.
- **Fix:** Generate these category aliases from `common/src/tools/constants.ts` or delete them in favor of the canonical `ToolName` union plus documented categories. Add a consistency test that fails when `toolNames` changes without updating the public agent-definition template/types.
- **Evidence:** `agents/types/agent-definition.ts:380-405` defines the stale aliases; `common/src/tools/constants.ts:21-73` lists the current registry, including `query_index`, `read_outline`, `read_slices`, `replace_range`, `rewrite_symbol`, `edit_transaction`, `browser_logs`, `check_background_agent`, `check_job`, `kill_job`, `read_logs`, `spawn_agent_inline`, and other tools absent from those aliases.

## [MEDIUM] Correctness / Prompt drift / Tool-list freshness — `agents/editor/editor.ts:31` + `agents/editor/editor.ts:62` — editor exposes `set_output` but tells the model it must not use it
- **Risk:** The editor's declared `toolNames` includes `set_output`, and its programmatic `handleSteps` uses `set_output` to return changed-file metadata, but the model-facing prompt says `set_output in particular should not be used` and `Do not call any unsupported tools`. This contradiction makes tool behavior provider-dependent: a model can see an available tool while being told it is forbidden, and a future prompt/tool renderer or model may obey the registry instead of the prose, emitting premature structured output rather than edits.
- **Fix:** Split programmatic-only completion from model-visible tool availability, or keep `set_output` hidden from the model while still allowing `handleSteps` to yield it. Add a prompt/tool snapshot asserting no model-visible tool is contradicted by the agent instructions.
- **Evidence:** `agents/editor/editor.ts:31-40` includes `set_output` in `toolNames`; `agents/editor/editor.ts:62` says `set_output in particular should not be used`; `agents/editor/editor.ts:218-228` later yields `toolName: 'set_output'` from `handleSteps`.

## [LOW] API/ABI contract / Prompt drift / Dependency hygiene — `agents/basher.ts:60` + `agents/basher.ts:84` — basher's declared tool list omits the structured-output tool it yields
- **Risk:** `basher` declares only `run_terminal_command` in `toolNames`, but its deterministic `handleSteps` yields `set_output` on missing parameters and normal command completion. If runtime/tool-validation tightens so programmatic tool calls must be declared like model-visible tools, basher becomes a silent compatibility break; if not, the file still encodes an undocumented exception to the tool-list contract.
- **Fix:** Either add `set_output` to `basher.toolNames` and mark it as programmatic-only in prompt/rendering, or document/enforce that `handleSteps` may yield control/output tools absent from `toolNames`. Add a test that loads each support agent and validates every `handleSteps`-yielded tool is either declared or explicitly exempt.
- **Evidence:** `agents/basher.ts:60` has `toolNames: ['run_terminal_command']`; `agents/basher.ts:84-87` yields `set_output` for missing `command`; `agents/basher.ts:147-151` yields `set_output` for raw command output.

## Summary

| Audit domain | Findings |
|---|---|
| Security | No high-confidence source-level security issue found in this shard; shell/browser/path agents were reviewed for prompt/tool boundary drift. |
| Correctness | General-agent inline pruner depth failure; stale support-agent model declarations; editor/basher tool contradictions. |
| State mutation | Inline pruner mutates parent message history through `spawn_agent_inline` and can be blocked by depth accounting. |
| Error handling | Depth-limit rejection can surface before user work; basher missing-param output relies on undeclared `set_output`. |
| Performance | Repeated pre-step inline pruning is potentially expensive, but only reported where it intersects correctness/depth. |
| Dependency hygiene | Hardcoded Anthropic IDs/aliases conflict with route-driven model configuration; public tool aliases drift from registry. |
| Test coverage gaps | Missing regression coverage for route-vs-definition model drift, inline-pruner depth behavior, and handleSteps-yielded tool declarations. |
| API/ABI contract breaks | Public agent-definition tool aliases and bundled agent model/tool contracts are stale relative to canonical route/tool registries. |

**No source edits performed.** This file is the only artifact written for S6.
