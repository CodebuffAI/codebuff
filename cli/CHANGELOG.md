# Changelog

All notable changes to the `@openbuff/cli` package will be documented in this file.

## [Unreleased] - 2026-07-06

### Added

- The `code-reviewer` gate now recognizes an embedded JSON verdict object emitted after a prose preamble (e.g. `"I now have full context. … {\"verdict\":\"LOOKS_GOOD\",…}"`). The new `extractEmbeddedJsonVerdict` helper in `agents/base2/gate-reviewer.ts` tracks brace depth with `\"`-escape and JSON-string-boundary awareness so a `}` inside a string value does not prematurely close the object, uses the last embedded verdict when a reviewer echoes a prior `BLOCKING` before a final `LOOKS_GOOD`, and rejects truncated/unknown/`coverage:"missing"` verdicts. The inline `base2.handleSteps` mirror is kept in sync and parity-tested in `agents/__tests__/gate-reviewer.test.ts`. Documented in `docs/agents-and-tools.md` under a new "## Reviewer verdict contract" section.

### Fixed

- Inline reviewers now receive the orchestrator history as read context without copying their private file reads, tool results, and `set_output` transcript back into the parent prompt. Deliberate `set_messages` control-plane rewrites and context-pruner compaction still propagate.
- Structured reviewer results are bounded before entering parent history, while retaining verdicts, snapshots, findings, corrections, dimensions, and representative evidence.
- Semantic compaction preserves a larger beginning-and-end task contract and next action so trailing instructions survive long pasted diagnostics.
- `edit_transaction` now strongly requests real edit arrays, continues to repair complete legacy JSON encodings, and reports truncated encodings at the `edits` field with safe recovery guidance instead of a misleading `edits[0]` object error.

## [1.1.11] - 2026-07-07

Patch release covering context-pruner reviewer-memory hardening, auxiliary gate-state reset fixes, and updated default agent model routing.

### Changed

- Switched default Openbuff agent routes from `iamhc/glm-5.2` to `agentrouter/gpt-5.5`.

### Fixed

- Context pruning now preserves actionable `code-reviewer` and `security-reviewer` findings across tight repeated compaction without also retaining generic agent-result summaries.
- Stale `final_response_allowed` active-work state and `NON_BLOCKING` reviewer notes no longer survive compaction as pinned or regular summary text.
- Reset auxiliary gate tracking when the validation/reviewer gate completes so future gate runs do not inherit stale pre-edit security, test-writer, doc-writer, or pending-file state.

### Added

- Added cross-language idiom guidance and language-profile prompt plumbing so orchestrator/editor prompts can conditionally include compact idiom contracts for non-TypeScript work.
- Added BuffBench idiom evaluation signals, traceability checks, proposal dry-run artifacts, and self-improvement proposal plumbing for manual-review-only agent improvements.
- Expanded deterministic edit, structural read, rewrite-symbol, code-map, and indexer retrieval coverage across additional language and repo-map scenarios.

### Changed

- Improved inferred validation hook behavior and documentation for local file-change checks.
- Refreshed CLI and tmux knowledge notes for menu coverage, readiness waits, input encoding, and capture behavior.

### Fixed

- Excluded generated `evals/test-repos` clones from the focused BYOK wording guard so local validation does not scan temporary repository fixtures.

## [1.1.7] - 2026-07-05

Pipeline release of `@openbuff/cli` covering the inline-subagent rendering fix, a legacy-skill prune, and model-agnostic slash-command descriptions.

### Fixed

- `spawn_agent_inline` now nests inline-subagent events under the child agent block in the TUI instead of blending them into the orchestrator's turn. The handler's `onResponseChunk` injects the same lineage tagging `spawn_agents` uses: `tool_call`/`tool_result` get the child's `agentId` as `parentAgentId`, `text` events get the child's `agentId` (empty text dropped), and `subagent_start`/`subagent_finish` get the parent orchestrator's `agentId`. Both injections use `??` so a pre-existing value (set by `run-programmatic-step` for grandchild spawns) is preserved, keeping correct lineage across deep inline nesting. Restores clean rendering of the `test-writer`/`doc-writer`/`security-reviewer` aux-gate spawns.

### Changed

- Pruned the legacy `cleanup` and `review` skills, which duplicated the root "Code Craftsmanship" guidance and the `/review` handler plus the auto-spawned code-reviewer gate covering the same surface. Retiring them removes three sources of truth that were drifting apart.
- `/plan` and `/review` palette descriptions are now model-agnostic ("configured planner" / "configured reviewer") instead of naming a specific hosted model, so the strings stay correct under BYOK and across providers.

### Added

- `cli/src/data/__tests__/slash-commands.test.ts` (23 tests) locking the slash-command contract — `SLASH_COMMANDS`, `SLASHLESS_COMMAND_IDS`, `getSlashCommandsWithSkills` — including "GPT 5.4"-style model-name regression guards (reject hardcoded hosted-model text) and a 50-char description-truncation boundary check.
- `packages/agent-runtime/src/__tests__/spawn-agent-inline-nesting.test.ts` (12 tests) covering the new nesting behavior, including grandchild regression guards for both `parentAgentId` and `agentId` preservation, the silent-`context-pruner` guard, and verbatim pass-through of non-nesting event types.
- `## Slash Commands` section in `docs/agents-and-tools.md` cataloging the three exports, the `SlashCommand` shape, the registered command set, and the skill-command vs. alias/implicit rules.
- `### spawn_agent_inline` subsection in `docs/agents-and-tools.md` documenting the handler contract, forced template overrides, return shape, and the `parentAgentId`/`agentId` nesting table.

### Removed

- `.agents/skills/cleanup/SKILL.md` and `.agents/skills/review/SKILL.md` (see "Changed" above for rationale).
