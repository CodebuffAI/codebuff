# Openbuff Harness Improvements — PLAN

This plan tracks all identified improvements. Each task lists scope, target files, validation gates, and explicit status. Tasks are grouped by priority and ordered so dependencies are satisfied.

## Status legend
- todo — not started
- in-progress — actively being worked on
- blocked — waiting on a dependency or decision
- done — implemented + validated

---

## P0 — Correctness hardening (runtime-enforced invariants)

### P0-1. Runtime-enforce "read before edit"
Status: todo

Scope:
- Track per-agent-turn file-read capabilities (path + hash + line range) emitted by read_files/read_outline/symbol slices.
- In str_replace / edit_transaction handlers, require either:
  - a fresh capability covering the edit region, or
  - explicit basedOnRead, or
  - the file is new (write_file create), or
  - the edit is on an allowlisted generated path.
- On violation: return a structured error telling the agent to read the region first; do not apply.

Target files:
- packages/agent-runtime/src/process-str-replace.ts
- packages/agent-runtime/src/process-edit-transaction.ts
- packages/agent-runtime/src/run-agent-step.ts (capability tracking)
- packages/agent-runtime/src/tools/handlers/tool/write-file.ts (new-file exemption)

Validation:
- New unit tests in process-str-replace.test.ts / process-edit-transaction.test.ts.

### P0-2. Diff/content fingerprint for reviewer gate pass
Status: partial — gate fingerprint baseline implemented; full working-tree content hash remains future hardening

Scope:
- Replace "pending files match" gate-pass shortcut with content fingerprint over (sorted [path → working-tree-content-hash]) + validation summary + verdict.

Target files:
- agents/base2/base2.ts
- packages/agent-runtime/src/run-agent-step.ts
- new helper: packages/agent-runtime/src/util/gate-fingerprint.ts

Validation:
- agents/__tests__/base2.test.ts covering same/different fingerprints.

### P0-3. Typed gate-state object preserved across pruning
Status: done for base2 typed state + pinned context-pruner preservation
Depends on: P0-2

Scope:
- Replace ad-hoc `base2ActiveWork` fields with a typed `GateState` owned by runtime.
- Context-pruner serializes/restores `GateState` verbatim.
- Finalization gated by single predicate `canFinalize(state)`.

Target files:
- agents/base2/base2.ts
- agents/context-pruner.ts
- agents/__tests__/context-pruner.test.ts
- agents/__tests__/base2.test.ts
- packages/agent-runtime/src/run-agent-step.ts

Validation:
- Lifecycle test: edit → fail → prune → blockers survive → fix → pass → finalize.

### P0-10. Plan-mode default lifecycle and discoverability
Status: done for slash-command/runtime-warning scope

Scope:
- In plan mode, default to emitting all four artifacts (SPEC, PLAN, STATUS, LESSONS) for any plan with >3 tasks or >1 priority tier; require explicit "small plan" opt-out otherwise.
- Always print an Artifacts block with absolute paths and concrete resume commands.
- Runtime check: if plan response includes a PLAN.md reference, require STATUS.md to also be present in the same session dir (warn or block finalization otherwise).
- Register the suggested slash commands (`/resume-plan`, `/plan-status`, `/update-plan`, `/lessons`) in the CLI so they actually work.

Target files:
- agents/base2/base2.ts (plan-mode branch)
- packages/agent-runtime/src/tools/handlers/tool/create-plan.ts (lifecycle check)
- common/src/tools/params/tool/create-plan.ts (schema constraint)
- cli/src/commands/command-registry.ts
- cli/src/commands/router.ts
- cli/src/data/slash-commands.ts

Validation:
- Unit test: plan mode with N≥4 tasks emits all 4 artifacts.
- CLI command tests for the new slash commands.

### P0-11. Auto-update plan artifacts during execution
Status: done for explicit `update_plan_status` tool; automatic PlanLink execution wiring remains optional follow-up
Depends on: P0-3 (typed GateState makes status linkage cleaner; not a hard block)

Scope:
- Introduce a `PlanLink` discovered from the user prompt or recent session activity (e.g. "continue P0-2" or `/resume-plan <slug>`).
- When base2 starts a task linked to a PLAN.md entry, flip its status in STATUS.md to in-progress.
- When the reviewer+validation gate passes for that task, flip STATUS.md to done and timestamp it.
- When a turn surfaces a non-obvious decision or gotcha, append to LESSONS.md (heuristic or explicit "remember this" tool call).
- Expose a minimal `update_plan_status` tool that runtime can call so updates don't depend on the model remembering.

Target files:
- agents/base2/base2.ts (task→status linkage)
- new: packages/agent-runtime/src/tools/handlers/tool/update-plan-status.ts
- common/src/tools/params/tool/update-plan-status.ts (new schema)
- common/src/tools/params/tool/create-plan.ts (extend if needed)
- agents/context-pruner.ts (preserve PlanLink across pruning)

Validation:
- `bun test packages/agent-runtime/src/tools/handlers/tool/__tests__/update-plan-status.test.ts` — pass.
- `bun --cwd=common tsc --noEmit` — pass.
- `bun --cwd=packages/agent-runtime tsc --noEmit` — pass.

Follow-up validation if automatic PlanLink wiring is added:
- E2E: synthetic task linked to PLAN.md item flips STATUS.md automatically on gate pass.
- Unit tests for PlanLink parsing and STATUS.md serialization.

### P0-12. Reliable reviewer-gate spawning
Status: done for baseline safeguards; fingerprint baseline now participates in durable gate reuse

Problem statement: the automated reviewer sometimes does not spawn even after real edits. Root causes confirmed in agents/base2/base2.ts:

1. **Allow-list gating tied to `isDefault`** (line ~94): the `code-reviewer` agent type is only added to the allowed spawn list when `isDefault` is true. Non-default base2 variants (custom IDs, evals, some downstream agents) can never spawn the reviewer — silently.
2. **Edit detection misses some edits**: `changedFiles` is populated from (a) classified edit tool results and (b) editor structured-output `changedFiles`. Tools that mutate files but are not classified as edits (e.g., certain bash commands, future tools, non-standard subagents) leave `changedFiles` empty → no `pendingGateFiles` → no review.
3. **Path normalization mismatches**: file paths flow in as relative, absolute, `file://`, or workspace-relative. Some flows compare against `gatePassedFiles` and accidentally treat fresh edits as already-passed because of normalization drift (the existing test at line 290 only covers the simplest absolute-path case).
4. **`gatePassedFiles` filter swallows re-edits** (line ~434): edits to files already in `gatePassedFiles` are filtered out of the new pending set. If the prior gate pass used a different fingerprint, re-edits should re-open the gate — today they only re-open if path normalization is identical.
5. **`fast` mode skips hooks but reviewer behavior is implicit**: in fast/no-validation mode hooks are skipped; the reviewer step's interplay with skipped validation is not strongly tested.
6. **git_status fallback can return empty** (line ~403): if pending is empty but changed is non-empty, code seeds pending from git status. If git status shows nothing (untracked dir, reverted change, edits outside repo), the gate silently does not trigger.
7. **Workflow allow-list mutation**: external workflows can pre-configure `allowedAgents` without `code-reviewer`; nothing forces inclusion.

Scope:
- Make reviewer inclusion in the allowed-spawn list unconditional for any base2 variant that has a real edit path (not gated solely on `isDefault`).
- Add an explicit "no-review reason" log/state field whenever the gate decides to skip review, with reasons: `no-edits-detected`, `all-files-already-gate-passed`, `fast-mode-no-validation-and-no-review`, `git-status-empty-but-edits-classified`, `allowlist-missing-code-reviewer`.
- Surface that reason to the user/runtime so silent skips are impossible.
- Normalize paths through a single helper before set comparisons (workspace-relative, POSIX, dedup).
- After P0-2 lands, gate skip decisions key off the fingerprint, not raw path-set equality.
- Add a fallback: if the orchestrator believes edits happened (any successful str_replace/edit_transaction/write_file/apply_patch tool result in the turn) but `pendingGateFiles` is empty, treat that as a bug condition — log it, force-seed pending from the recorded edit tool results, and run the gate.
- Add metrics/log line on every gate run with: pending count, validation status, reviewer status, skip-reason (if any).

Target files:
- agents/base2/base2.ts (allow-list, skip-reason, fallback, path normalization)
- packages/agent-runtime/src/run-agent-step.ts (edit-tool-result tracking)
- packages/agent-runtime/src/tools/handlers/tool/spawn-agents.ts (enforce reviewer presence for base2-family allowlists when edits exist)
- agents/__tests__/base2.test.ts (new failure-mode tests)

Validation:
- Tests for each enumerated cause:
  - non-default base2 variant still spawns reviewer after edits
  - bash-only tool result misclassified as edit no longer hides the reviewer
  - path normalization regression test (absolute, relative, `file://`, mixed)
  - re-edit of an already-gate-passed file with different content triggers re-review
  - fast-mode behavior is explicit
  - git_status-empty-but-edits-classified triggers fallback gate

Risks:
- Forcing reviewer in non-default variants may break some workflow/eval expectations; mitigate with a per-variant override that defaults to ON.

---

## P1 — Reliability and debuggability

### P1-4. Structured reviewer output
Status: done for minimal JSON verdict/findings support with text fallback
Depends on: P0-3

Scope:
- Reviewer emits structured JSON alongside prose:
  ```json
  { "verdict": "looks_good" | "blocking" | "non_blocking",
    "findings": [{ "severity": "...", "file": "...", "line": 0, "message": "..." }] }
  ```
- Parser falls back to prefix parsing; ambiguous → BLOCKING (fail safe).

Target files:
- agents/reviewer/code-reviewer.ts
- agents/base2/base2.ts
- agents/context-pruner.ts
- agents/__tests__/code-reviewer.test.ts
- agents/__tests__/base2.test.ts

### P1-5. Lifecycle e2e tests
Status: todo
Depends on: P0-3, P0-12, P1-4

Scope:
- E2E: edit → hook failure → prune → blocker persists → fix → re-validate → reviewer pass → finalize.
- E2E: each P0-12 reviewer-skip failure mode.

Target files:
- agents/e2e/context-pruner.e2e.test.ts
- agents/e2e/context-pruning-threshold.e2e.test.ts
- new: agents/e2e/gate-lifecycle.e2e.test.ts
- new: agents/e2e/reviewer-spawn-conditions.e2e.test.ts

### P1-6. Standard subagent handoff envelope
Status: done for formal optional `AgentHandoff` schema; consumer adoption remains optional follow-up

Scope:
- Define `AgentHandoff` type used by spawn_agents for editor/reviewer/thinker/file-picker.
- Free-form prompt remains as fallback.

Target files:
- packages/agent-runtime/src/tools/handlers/tool/spawn-agents.ts
- packages/agent-runtime/src/tools/handlers/tool/spawn-agent-utils.ts
- agents/base2/base2.ts
- common/src/tools/params/tool/spawn-agents.ts

---

## P2 — Workflow polish

### P2-7. Plan artifact path enforcement
Status: done for create_plan durable artifact path validation

Scope:
- Restrict create_plan target paths in plan mode to `.agents/sessions/<slug>/{SPEC,PLAN,STATUS,LESSONS}.md`.
- When PLAN.md exists for a session, require STATUS.md update after significant orchestration milestones.

Target files:
- packages/agent-runtime/src/tools/handlers/tool/create-plan.ts
- common/src/tools/params/tool/create-plan.ts

### P2-8. Agent registry/reference cleanup tests
Status: done for removed active-agent reference checks

Scope:
- Test scans routes.json + docs + agent definitions for removed IDs; fails on any reference.

Target files:
- agents/tool-reachability.test.ts
- new: agents/__tests__/agent-registry.test.ts
- openbuff.d/routes.json (audit only)
- docs/agents-and-tools.md (audit only)

### P2-9. UI rendering for blocker/gate state
Status: done for narrow parser + dedicated `gate-state` block + `GateStateBox`; live stream promotion remains optional follow-up
Depends on: P0-3, P1-4

Scope:
- Render GateState in CLI: validation/reviewer badges, blocker list with severity.

Target files:
- cli/src/types/chat.ts
- cli/src/components/renderers/gate-state-box.tsx
- cli/src/components/blocks/single-block.tsx
- cli/src/utils/message-block-helpers.ts
- cli/src/state/message-block-store.ts
- cli/src/utils/sdk-event-handlers.ts

Validation:
- `bun test cli/src/utils/__tests__/message-block-helpers.test.ts` — pass.
- `bun --cwd=cli tsc --noEmit` — pass.

---

## Dependencies summary

- P0-3 depends on P0-2
- P0-11 has a soft dependency on P0-3
- P0-12 benefits from P0-2 (fingerprint-based skip) but is independent for its baseline fixes
- P1-4 depends on P0-3
- P1-5 depends on P0-3, P0-12, P1-4
- P2-9 depends on P0-3 and P1-4
- P0-1, P0-10, P1-6, P2-7, P2-8 are independent

## Cross-cutting risks

- Tightening invariants can break existing agents/tests; land changes behind feature flags or staged rollouts.
- Reviewer JSON output may be ignored by some models; parser must be defensive.
- Capability tracking memory cost — bound to per-turn store, drop on turn boundary.
- Forcing reviewer in non-default base2 variants may break eval flows; provide per-variant override default ON.

## Validation gates per milestone

- P0: all new unit + e2e tests green; existing base2/context-pruner tests still green; reviewer-skip telemetry shows zero silent skips in smoke runs.
- P1: structured reviewer parser covered; lifecycle e2e green.
- P2: CLI smoke shows gate badges; create_plan rejects out-of-session paths.

## Resume instructions

- Use STATUS.md to find the next checkpoint.
- For each task, re-read its "Target files" before editing.
- Update STATUS.md after each task transitions state.
- Record non-obvious findings in LESSONS.md.

## Artifacts
- Session: .agents/sessions/harness-audit-2026-06
- SPEC.md: .agents/sessions/harness-audit-2026-06/SPEC.md
- PLAN.md: .agents/sessions/harness-audit-2026-06/PLAN.md
- STATUS.md: .agents/sessions/harness-audit-2026-06/STATUS.md
- LESSONS.md: .agents/sessions/harness-audit-2026-06/LESSONS.md
