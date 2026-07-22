# PLAN — Read/edit auth unification + mutation results + editor fix + legacy removal
<!-- current-task: none -->

Execute milestones in order. Each milestone has a validation gate; do not mark done until it passes.

## M1 — Unify authorization on content-correctness (the core)
- [x] M1.1 Make cap.v3 the single authority: validation re-hashes the current targeted content and compares to the capability hash; remove whole-file-vs-range authority branching in `process-str-replace.ts` / `process-edit-transaction.ts`. (Claiming: make cap.v3 the single authority; validation re-hashes current targeted content vs capability hash; remove whole-file-vs-range authority branching. Design fork resolved: keep observed-bytes floor (partial range read cannot mint whole-file authority).) (Validated: agent-runtime typecheck + 178 targeted tests passed; implementation is existing scope+content-hash behavior plus clarifying docs.)
  - Acceptance: AC1 — a range cap authorizes a matching edit within its observed range; it cannot authorize a whole-file overwrite unless it covers the whole current file. A whole-file cap authorizes a matching sub-range or whole-file edit; authority is content-hash equality within the observed-bytes floor.
  - Validate: `cd packages/agent-runtime && bun run typecheck` + `bun test src/__tests__/process-str-replace.test.ts src/__tests__/process-edit-transaction.test.ts src/__tests__/read-files-edit-state.test.ts`
- [x] M1.2 Keep the anti-footgun: a whole-file overwrite still requires a hash covering the whole current file (range caps continue to also mint a whole-file-scoped cap when the full file was observed, per the existing `wholeFileReadCapability` gates). Fold both into one uniform cap emission so the model carries one token. (Claimed after M1.1 validation; preserve observed-bytes floor while unifying model-facing capability emission.) (Validated: one capability per successful selector; common/SDK typechecks and 60 read-files tests passed.)
  - Acceptance: whole-file overwrite from a partial-only observation is still refused; from a full observation it succeeds.
  - Validate: same suite as M1.1.

## M2 — Mutation results show new file state (D-B)
- [x] M2.1 Include post-edit rendered content (bounded by the 10MB read ceiling) + a fresh whole-file cap.v3 per applied file in the model-visible `file_mutation_result`, via `edit-application-coordinator.ts` + `change-file.ts` + `filesystem.ts` result schema. (Claimed: add bounded post-edit file state and fresh capability to model-visible mutation results.) (Validated: action-local exact afterContent with afterHash correlation; 47 targeted tests and all affected typechecks passed.)
  - Acceptance: AC2 — after an applied edit the tool result shows new content + usable cap; a follow-up edit needs no re-read.
  - Validate: `cd sdk && bun run typecheck && bun test src/__tests__/change-file.test.ts src/__tests__/replace-range.test.ts` + agent-runtime edit-application-coordinator test.

## M3 — Fix the editor subagent (D-C)
- [x] M3.1 Ensure the editor returns `completed` with correct `changedFiles` whenever mutations applied; reconcile against actual mutation receipts instead of emitting `blocked`/null. (Common receipt reconciliation now preserves receipt-correlated handler state; editor caller implementation and validation remain pending outside this gate's writable files.) (Active repair task; dependent caller scope must include sdk/src/run.ts when validation names it.) (Validated receipt-backed completed status, changedFiles, non-null reconciled output, and forgery rejection.)
  - Acceptance: AC3.
  - Validate: `cd agents && bun run typecheck && bun test __tests__/editor.test.ts`

## M4 — Remove legacy read/edit compatibility (D-D)
- [x] M4.1 Remove cap.v2 (pathless) tokens + object-form basedOnRead + `expectedHash` legacy replace_range form + legacy path-keyed read-result map (`LegacyReadFilesMap`). Collapse `basedOnRead` schema to the single cap.v3 string. (`replace_range` and SDK path-keyed override compatibility are removed; remaining repository surfaces require the full M4 validation gate.) (Move M4.1 back to pending so M3.1 is the only active task; dependent caller scope must include sdk/src/run.ts when validation names it.) (Active: remove legacy read/edit forms and update canonical callers including sdk/src/run.ts.) (validated cap.v3/structured-only model and absence proof)
  - Acceptance: AC4 (auth forms).
  - Validate: common + agent-runtime + sdk typechecks; content-hash/based-on-read/edit-transaction schema tests.
- [x] M4.2 Remove quarantined dead tools (`read_slices`, `apply_smart_patch`) and their schemas/handlers/registrations/type surface if unreferenced by shipped agents. (claimed after M4.1 validation) (read_slices + apply_smart_patch removed across schemas/handlers/registrations/type surface + all residual source refs (tool-execution-deadline, tool-metadata test, cli codebuff-client, docs, structural-read test); typecheck clean, 33/33 targeted tests green.)
  - Acceptance: AC4 (dead tools).
  - Validate: common typecheck + tool-registration-consistency + tool-metadata tests + agents typecheck.

## M5 — Full validation + docs
- [x] M5.1 Update `docs/deterministic-edit-system.md` to describe the single unified model.
  - Validate: configured hooks.
- [x] M5.2 Full monorepo typecheck + all touched test suites green. (Full typecheck clean; 330 read/edit/auth tests green across agent-runtime/SDK/common.)
  - Validate: `bun run typecheck` (root) + the union of suites above.

## Open decision (needs user before M1)
- ODA: Resolved in favor of the security-preserving interpretation: whole-file overwrite requires a whole-file-covering hash; range edits require a matching hash for the observed range; both use one uniform cap.v3 validation path. A partial range capability never authorizes rewriting unobserved bytes.

<!-- update_plan_status:appended -->
## M1.1 validation — 2026-07-22T08:45:45.926Z

M1.1 validated: agent-runtime typecheck passed; 178/178 tests passed across process-str-replace, process-edit-transaction, and read-files-edit-state. Source verification showed cap.v3 scope + current-range hash are already the single in-range authority decision; only clarifying documentation was required.


<!-- update_plan_status:appended -->
## M1.2 validation — 2026-07-22T09:07:51.630Z

M1.2 validated: removed range-derived wholeFileReadCapability from SDK producer, common result schema, and replace_range guidance. Updated read-files tests so range reads expose only their own token and whole-file-to-subrange tests start from a genuine whole-file editAnchor. Common + SDK typechecks passed; 60/60 SDK read-files tests passed. Remaining string references are negative regression assertions only.


<!-- update_plan_status:appended -->
## M2.1 validation — 2026-07-22T09:27:19.403Z

M2.1 validated: model-visible file_mutation_result actions now include exact afterContent for applied text create/update/move actions, hash-correlated to afterHash; deletes/failures omit it. Common typecheck + 18 filesystem result tests, SDK typecheck + 21 change-file tests, and agent-runtime typecheck + 8 coordinator tests passed. Validation exposed and fixed a pre-existing move receipt inconsistency: committed move actions must use the independently verified destination final hash, not null.


<!-- update_plan_status:appended -->
## Repair scope and caller boundary lesson — 2026-07-22T10:12:24.819Z

The repair editor was blocked because validation named sdk/src/run.ts outside its writable handoff scope. The attempted fallback to widen read-files.ts would have violated AC4 by restoring legacy compatibility; dependent callers must be updated to the canonical structured result instead.


<!-- update_plan_status:appended -->
## M3.1 completion evidence — 2026-07-22T10:22:14.675Z

RF-2/7/11/16 implemented and validated. Runtime mutation attestations now override stale blocked/null editor output only when no receipt errors exist, producing a completed AgentReceipt with authoritative changedFiles and a non-null reconciled output. Batch, background, and inline spawn surfaces return receipt.output. Agent-runtime and agents typechecks passed; 24 spawn receipt tests and 43 editor tests passed, including blocked/null mutation cases and forgery rejection.


<!-- update_plan_status:appended -->
## M4.1 completion — 2026-07-22T13:43:35.097Z

M4.1 completed. Unified model now uses structured ReadFilesResultV1 overrides and scoped cap.v3 string inputs. replace_range freshness is derived from the capability; optional contained target bounds are checked in original snapshot coordinates and shifted only for application. Mutation afterContent/fresh-capability correlation uses byte-exact receipt hashes while cap.v3 tokens retain normalized read hashes, including CRLF coverage. Validation: common typecheck + 108 tests, SDK typecheck + 57 tests, agent-runtime typecheck + 231 tests passed. Production-only scan found no active cap.v2, legacy read-map, object-input basedOnRead, wholeFileCapabilityHash, or replace_range expectedHash compatibility implementation.

