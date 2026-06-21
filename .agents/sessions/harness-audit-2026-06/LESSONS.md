# Openbuff Harness Improvements — LESSONS

## Decisions made during planning
- Prefer runtime-enforced invariants over prompt instructions for any correctness-critical guarantee.
- Reviewer gate pass should be tied to a content fingerprint, not just file paths, to avoid stale approvals.
- Keep legacy prose reviewer output as a fallback while introducing structured JSON; do not break existing flows.
- Subagent handoffs should support a structured envelope but stay backward compatible with free-form prompts.
- Plan artifacts should be enforced into `.agents/sessions/<slug>/` only in plan mode to avoid surprising regular tasks.
- Plan mode should default to a full SPEC/PLAN/STATUS/LESSONS packet for any non-trivial plan (>3 tasks or >1 priority tier). Single-artifact plans should require explicit opt-out so users don't have to know the lifecycle exists.
- Execution-mode agents should auto-update STATUS.md/LESSONS.md when they detect a PlanLink. Today these artifacts go stale because updating depends entirely on the model remembering.

## Observations from the audit
- `base2ActiveWork` already encodes a lot of gate state implicitly; consolidating it into a typed object (P0-3) will reduce drift more than any prompt change.
- Context-pruner already preserves `BLOCKING:` lines — that pattern is exactly the shape needed for structured findings (P1-4).
- Deterministic edit tools (str_replace, edit_transaction) are the right layer to enforce read-before-edit (P0-1); doing it in the agent prompt is fragile.
- The recent removal of max/best-of-n/multi-prompt agents leaves stale references that a small registry test (P2-8) would catch cheaply.

## Reviewer-skip root causes (P0-12)
Confirmed by reading `agents/base2/base2.ts`:

1. The `code-reviewer` agent type is added to the allowed-spawn list only when `isDefault === true` (around line 94). Non-default base2 variants therefore cannot spawn the reviewer at all — and the skip is silent.
2. Edit detection depends on classifying tool results as edits and/or on the editor's structured-output `changedFiles`. Any edit that doesn't go through a recognized edit tool produces an empty `pendingGateFiles` and no reviewer.
3. Path normalization between detection sources (absolute, relative, `file://`) is not centralized; mismatches can cause re-edits to be incorrectly treated as "already gate-passed".
4. The `gatePassedFiles` filter strips re-edited files from the new pending set; without content fingerprinting (P0-2), a different edit to the same path can be silently treated as already approved.
5. Fast/no-validation mode skips hooks; reviewer behavior under fast mode is implicit and under-tested.
6. The git_status fallback that seeds pending from changed files quietly does nothing when git_status shows no changes (untracked dir, reverted, outside repo).
7. External workflows can configure `allowedAgents` without `code-reviewer`; nothing in the runtime forces inclusion when edits exist.

The fix is a combination of: unconditional inclusion in base2 family allowlists, an explicit no-review reason field on every skip, centralized path normalization, fingerprint-based skip (after P0-2), and a "edits happened but pending is empty" fallback path.

## Risks / gotchas to remember
- Adding capability tracking (P0-1) must drop state at turn boundaries to avoid unbounded memory.
- Structured reviewer output may be emitted as prose by some models; the parser must fail safe (treat ambiguous as BLOCKING).
- Fingerprint hashing (P0-2) must use the working-tree content, not git index, to catch unstaged changes between review and finalize.
- UI work (P2-9) should ship behind a feature flag if the GateState shape is still settling.
- Forcing reviewer in non-default base2 variants (P0-12) may break eval expectations; expose a per-variant override that defaults ON.
- Auto-updating plan artifacts (P0-11) must not silently rewrite user-edited STATUS.md/LESSONS.md content; only append or update the specific task line, and preserve user prose.

## Process lessons from this very session
- I emitted only SPEC.md on the first plan call for a multi-day audit. That required three user nudges to reach a complete packet (SPEC, PLAN, STATUS, LESSONS). A normal user would not know to ask. P0-10 codifies the fix: default to the full packet for any non-trivial plan.
- I assumed the audit would not need to address plan mode itself, even though the audit's central theme was "prefer runtime invariants over prompt discipline." Plan mode is a clear instance of that anti-pattern. Audits of the harness should explicitly include plan mode as a surface to evaluate.
- P0-10 slash commands should combine local artifact awareness with PLAN-mode agent prompts: `/plan-status` can be local-only because it reports current files, while `/resume-plan`, `/update-plan`, and `/lessons` should include artifact contents in the prompt so the agent resumes from durable state instead of stale chat memory.
- Warning, not blocking, is the right first runtime behavior for incomplete durable plan packets: `create_plan` can flag non-trivial PLAN.md writes without companion STATUS.md/LESSONS.md while avoiding surprising hard failures during ordinary planning.
- CLI tests can safely exercise durable plan commands by setting a temporary project root and writing `.agents/sessions/<slug>/` fixtures; this keeps artifact command behavior deterministic and isolated.

## Safe-batch implementation notes
- The landed reviewer gate fingerprint is a baseline tied to normalized pending files, git-status lines, and validation summary. It prevents simple stale path-only reuse, but it is not a full working-tree content hash yet.
- Base2 now owns a typed gate-state shape locally and context-pruner preserves pinned active-work lines; a future runtime-wide `GateState` module could reduce duplication further.
- Structured reviewer parsing should remain backward compatible: JSON verdict objects are accepted, but text prefixes remain supported and ambiguous reviewer output stays blocking/fails closed.
- P0-11 first slice has landed: `update_plan_status` is registered as a real tool with the same registration plumbing as `create_plan` (common/list.ts + agent-runtime/list.ts). It is scoped strictly to `.agents/sessions/<slug>/STATUS.md` and `.agents/sessions/<slug>/LESSONS.md`, rejects absolute paths and `..` traversal, and operates in-place: matching task lines are rewritten (preserving leading indentation and trailing prose) and free-form entries are appended under a clearly delimited `## <heading> — <ISO timestamp>` block. Automatic emission during execution (PlanLink-driven) remains a follow-up.
- `create_plan` path enforcement is now strict: durable plan writes must target `.agents/sessions/<slug>/{SPEC,PLAN,STATUS,LESSONS}.md`. This is intentionally stronger than the original warning-only behavior.
- Editor handoff hardening: empty editor prompts are rejected, and `spawn_agents` now exposes a formal optional `AgentHandoff` zod schema (`summary`, `artifacts`, `successCriteria`, `nonGoals`, `constraints`, `context`). It is purely additive — children that do not consume `handoff` keep receiving `prompt`/`params` unchanged.
- P2-9 first slice has landed in the CLI: a narrow `parseGateStateBlock` helper recognizes only the pinned `<gate-state>...</gate-state>` shape (required `gate:` + `status:` keys, status must be one of `pending|passed|failed|skipped`), and a new `GateStateContentBlock` + `GateStateBox` renderer displays the state in a colored bordered box. Ordinary prose mentioning "gate" or "status" is intentionally not parsed.
- CLI `ContentBlock` variants should avoid adding broad field names like `status` unless every union consumer expects that value domain. The gate-state block now uses `gateStatus` internally while still parsing the external `status:` line, preventing generic `updateBlocksRecursively` callers from widening agent-block status updates.
- Non-blocking reviewer follow-ups were useful: `GateStateBox` no longer accepts a dead width prop, `parseGateStateBlock` documents first-block-only parsing, and `update_plan_status` now uses tail-only note de-duping plus temp-file rename writes while rejecting symlinked artifacts that resolve outside the project root.

## Follow-up notes
- After P0-3, audit any other agent state that lives only in prompts and could become typed.
- After P1-6, migrate file-picker and code-searcher prompts to the envelope as well.
- After P2-7, add `docs/plan-artifacts.md` describing the artifact lifecycle.
- Consider an "agent integrity" CI check that runs P2-8's registry test plus tool-reachability on every PR.
- After P0-12 lands, add a per-turn telemetry counter for "reviewer-skip-reason" to spot regressions early.
