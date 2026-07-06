# SPEC: R1/R2 Read/Edit Tool Improvements

## Overview
Plan implementation for the two deferred follow-up recommendations from `.agents/sessions/read-edit-tool-improvements-from-aider-2026-07-06/`:

- R1: add a validation-failure lint/typecheck feedback re-edit loop around `run_file_change_hooks` failures.
- R2: add explicit `...` elision semantics for deterministic edit tools, focused on `str_replace` and `replace_range` anchors.

This session is planning-only. No project source changes are part of this artifact.

## Goals
- Define a safe implementation sequence for R1 and R2.
- Preserve deterministic edit/recovery behavior and avoid broad, ambiguous matching.
- Identify exact files, tests, validation gates, risks, and ordering constraints.
- Keep R1 and R2 separable so either can be implemented independently if needed.

## Non-Goals
- Do not implement either recommendation in plan mode.
- Do not change existing R3 tiny-anchor behavior except where R2 tests need to coexist with it.
- Do not redesign the full validation/reviewer gate lifecycle.
- Do not add new dependencies unless an executor later proves they are necessary.
- Do not run destructive git commands, releases, pushes, or migrations.

## Requirements

### R1: validation-failure feedback re-edit loop
- When `run_file_change_hooks` returns failures during the validation gate, the orchestrator should surface concise, actionable failure context to a repair-oriented editor step instead of leaving the user to manually interpret the hook output.
- Reuse existing parsing and repair prompt helpers in `agents/base2/gate-repair.ts` where possible.
- Integrate into `agents/base2/base2.ts` without changing unrelated gate behavior:
  - keep gate done/reset semantics intact,
  - avoid infinite repair loops,
  - preserve reviewer ordering,
  - only trigger repair when validation actually fails.
- Keep user-visible behavior deterministic and bounded: one repair attempt per failing gate-file set unless the existing lifecycle explicitly allows another pending-file set after edits.
- Add/extend tests in `agents/__tests__/gate-repair.test.ts`, `agents/__tests__/gate-repair-parity.test.ts`, `agents/__tests__/base2.test.ts`, and/or e2e gate lifecycle tests as needed.

### R2: explicit `...` elision semantics
- Define `...` support narrowly and explicitly. Recommended interpretation:
  - `...` is only special when used as an explicit elision marker in an edit anchor format documented for the tool.
  - It must not make arbitrary tiny anchors or broad fuzzy matches acceptable.
  - It must remain deterministic and recoverable; ambiguous matches should fail with guidance.
- Apply to `str_replace` matching cascade in `packages/agent-runtime/src/process-str-replace.ts` only after preserving current exact-match and safety checks.
- Apply to `replace_range` only if it can be reconciled with hash/range safety in `packages/agent-runtime/src/tools/handlers/tool/replace-range.ts` and SDK wrapper behavior in `sdk/src/tools/replace-range.ts`.
- Update schemas/docs only after final semantics are clear:
  - `common/src/tools/params/tool/replace-range.ts`
  - `docs/deterministic-edit-system.md`
  - `docs/agents-and-tools.md`
- Add focused regression tests:
  - `packages/agent-runtime/src/__tests__/process-str-replace.test.ts`
  - `sdk/src/__tests__/replace-range.test.ts`

## Relevant Files / Systems
- `agents/base2/base2.ts` — validation/reviewer gate orchestration.
- `agents/base2/gate-repair.ts` — validation failure parsing and repair prompt helpers.
- `agents/__tests__/gate-repair.test.ts` — parser/prompt tests.
- `agents/__tests__/gate-repair-parity.test.ts` — parity coverage for gate repair behavior.
- `agents/__tests__/base2.test.ts` and `agents/e2e/*gate*.test.ts` — orchestrator gate lifecycle tests.
- `common/src/tools/params/tool/run-file-change-hooks.ts` — hook result contract.
- `sdk/src/tools/file-change-hooks.ts` — SDK hook execution/result shape.
- `packages/agent-runtime/src/process-str-replace.ts` — `str_replace` matching and safety behavior.
- `packages/agent-runtime/src/__tests__/process-str-replace.test.ts` — str_replace regression tests.
- `packages/agent-runtime/src/tools/handlers/tool/replace-range.ts` — replace_range hash/range handling.
- `common/src/tools/params/tool/replace-range.ts` — replace_range tool params/docs.
- `sdk/src/tools/replace-range.ts` — SDK exposed replace_range tool behavior.
- `sdk/src/__tests__/replace-range.test.ts` — replace_range tests.
- `docs/deterministic-edit-system.md`, `docs/agents-and-tools.md` — user-facing deterministic edit docs.

## Acceptance Criteria
- R1 has tests showing failed hooks produce a bounded repair/edit step with concise failure context and no infinite loop.
- R1 preserves current successful validation and reviewer gate behavior.
- R2 has tests covering exact match precedence, valid elision usage, ambiguous elision failure, tiny-anchor safety interaction, and no accidental treatment of literal text as elision when not in the documented form.
- R2 replace_range behavior is either implemented with clear hash/range safety or explicitly documented as out of scope for the first implementation slice.
- Documentation describes any new `...` behavior and recovery guidance.
- Relevant validation passes:
  - `cd agents && bun test` or narrower gate-related tests plus `bun run typecheck` if available.
  - `cd packages/agent-runtime && bun run typecheck && bun test`.
  - SDK replace-range tests/typecheck if R2 touches SDK/common files.

## Assumptions
- R1 and R2 can be implemented independently.
- Existing `gate-repair.ts` helpers are intended to support R1 and should be reused before adding new abstractions.
- The R3 tiny repeated-anchor guard is already complete and should remain stable.
- Current dirty worktree includes unrelated changes; executor must preserve them and avoid staging/reverting unrelated files.