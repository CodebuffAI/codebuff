# LESSONS — Harness Cohesion Audit

## Gotchas discovered during the audit

- **`handleSteps` is serialized (`.toString()` → `new Function`).** The base2 gate logic cannot import `gate-*.ts`; it keeps inline mirror copies. Any change to gate helpers must update BOTH the inline copy in `base2.ts` and the canonical `gate-*.ts` module, and be covered by a parity test. Existing parity guards: `gate-repair-parity.test.ts`, `gate-reviewer.test.ts`. Missing guard: aux path helpers (`gate-paths.ts`) — see M4.1.

- **Prompt-section snapshot freeze.** `quality-prompt-snapshot.test.ts` byte-freezes `qualitySection` and shared prompt text. Prompt edits (M2/M3) require an intentional snapshot update; never blind-accept the new snapshot.

- **Generated artifacts.** `cli/src/agents/bundled-agents.generated.ts` and `agents/types/tools.ts` are generated (`prebuild-agents.ts`, tool-def generator). Edit source + regenerate; never hand-edit.

- **Five parallel rosters, no single source of truth.** agent `.ts` default exports (de-facto truth) → generated bundle → `routes.json` (drifted, 12 dead ids) → `AGENT_PERSONAS`/`AGENT_IDS` (heavily drifted) → `spawnableAgents` arrays. This is the root cause of the "lack of cohesion" the user felt.

- **Two orchestration mechanisms coexist.** The authoritative flow is the base2 `handleSteps` gate + `spawn-agent-utils` capability clamping. `packages/agent-runtime/src/orchestration/*` (esp. `workflow-engine`) is invoked but advisory/telemetry-only — a dual-system smell that can mislead future readers.

- **Prompt/capability mismatch is real cohesion debt.** `buildBroadAuditSection` instructs the coordinator to collect `structuralReceipt`s from file-picker/code-searcher shards, but only `general-agent` + `write_audit_findings` emit those receipts. The produce-path and the prompted spawn-path don't line up — a concrete example of features added without wiring them into coordination.

- **Capability clamps are layered (good).** `deriveSpawnTemplateCapabilities` clamps at spawn time AND `executeToolCall` re-enforces filesystem/tool scope at execution — plan-only propagation forces child terminal profiles to read-only. Preserve both layers when editing spawn logic.

## Decisions (record as confirmed)
- (confirmed) persona-map strategy: reconcile + guard against the canonical `agents/**/*.ts` roster (not a full generate-from-source refactor this pass). See STATUS.md "Confirmed Decisions (2026-07)".
- (confirmed) orchestration/ fate: keep `orchestration/workflow-engine`, marked advisory/telemetry-only. See STATUS.md "Execution Complete (2026-07)".

<!-- update_plan_status:appended -->
## M3.4 Decision: gateAwarenessSection gating rule — 2026-07-21T21:17:10.256Z

Documented rule: gateAwarenessSection is present in an orchestrator's system prompt IFF that orchestrator runs the validation/reviewer gate. base2 encodes this as `isDefault ? gateAwarenessSection : ''` (fast modes are non-default and skip the gate, so they correctly omit it). base-deep composes createBase2('default') and always runs the gate, so its hand-written system prompt interpolates gateAwarenessSection unconditionally — which is equivalent to the isDefault rule because base-deep is always default+gated. No behavioral divergence exists; the two sites obey one rule. Kept as-is (no code change) rather than forcing base-deep through the isDefault ternary, since base-deep never runs a non-default/fast mode.


<!-- update_plan_status:appended -->
## Reviewer read-budget fix (2026-07) — 2026-07-22T03:57:28.376Z

Root cause of the reviewer-gate attestation failures: MAX_RENDER_CHARS = 100_000 in sdk/src/tools/read-files.ts truncated any whole-file read over 100k chars. base2.ts is 313 KB, so reviewers (code-reviewer, security-reviewer, all 14 specialists — all read exclusively via read_files) received a FILE_TOO_LARGE stub and physically could not attest to that pending file, producing 'reviewer did not attest to every pending file: agents/base2/base2.ts'. Fix (user-directed): set MAX_RENDER_CHARS = MAX_FILE_BYTES so the existing 10MB byte gate is the single effective read ceiling; sub-10MB source files now render fully for both whole-file and range reads. MAX_FILE_BYTES (10MB) and MAX_RANGE_READ_BYTES unchanged as the remaining safety valve. Coupled tests in sdk/src/__tests__/read-files.test.ts updated; SDK read-files suite 62 pass / 0 fail, SDK typecheck clean. Tradeoff accepted by user: a large (<10MB) generated file can now dump fully into a reader's context; the 10MB byte gate remains the hard cap.
