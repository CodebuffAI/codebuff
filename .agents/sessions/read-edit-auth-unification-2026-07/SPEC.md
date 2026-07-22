# SPEC — Unify read/edit authorization, fix mutation results, fix editor subagent, remove legacy compat

## Goal (user, verbatim intent)
"Make a whole file and read range authorization the same so edits apply regardless of either as long as the content is correct. And fix the mutation results so it shows you the new file state. And fix the editor subagent. Also get rid of the legacy compatibility in this and any other tools that have legacy compatibility. We don't need legacy compat — one uniform best implementation, update anything relying on legacy to work with it. There are no third parties. This is a self-contained CLI."

## Confirmed design decisions
- **D-A (auth unification):** Content correctness is the authority for edits **within the content observed by the capability**, subject to the observed-bytes floor. Normative rule (identical in SPEC, PLAN, and STATUS): a fresh authenticated `cap.v3` capability bound to (project, path, run) authorizes an edit **only within the byte range it observed** when the targeted current content matches the capability's hash. Whole-file reads and range reads use the same content-hash validation path within their observed scope, so an edit applies regardless of which read produced the capability — but a partial range capability can NEVER authorize a whole-file overwrite, because it does not establish authority over unobserved bytes. A whole-file overwrite requires a capability covering the whole current file. A whole-file read mints a cap.v3 over lines 1..N; a range read mints a cap.v3 over its lines.
- **D-B (mutation results show new state):** `file_mutation_result` returned to the model includes, per applied file, the post-edit rendered content (bounded by the existing 10MB read ceiling) plus a fresh whole-file `cap.v3` readCapability, so the model both sees new state and can immediately chain edits without a re-read.
- **D-C (editor subagent):** The editor must return a completed structured receipt with `changedFiles` whenever its edits actually applied; it must not return `blocked`/null when the filesystem shows applied mutations. Reconcile the receipt against actual mutation receipts.
- **D-D (legacy removal):** Remove cap.v2 (pathless) tokens, object-form `{startLine,endLine,hash}` basedOnRead, legacy path-keyed read-result maps (`Record<string,string|null>`), the `expectedHash` legacy replace_range form, and the now-redundant separate `wholeFileReadCapability` field (subsumed by D-A). Delete quarantined dead tools (`read_slices`, `apply_smart_patch`) and their schemas/handlers/registrations if unreferenced by shipped agents. Update every dependent call site + test to the single cap.v3 path.

## Non-goals
- No change to the reviewer/validation gate semantics (separate, already-fixed subsystem).
- No provider/model routing changes.

## Key systems (source-backed)
- `common/src/util/content-hash.ts` — cap.v2/v3 encode/decode, scope fingerprint. (auth token core)
- `common/src/tools/params/based-on-read.ts` — basedOnRead schema (string | object union).
- `packages/agent-runtime/src/process-str-replace.ts` — `normalizeBasedOnRead`, `validateReadCapabilityAuthority`, `getReadCapabilityKey` (legacy branches).
- `packages/agent-runtime/src/process-edit-transaction.ts` — replace_range capability resolution, whole-file-sub-range branch.
- `packages/agent-runtime/src/tools/handlers/tool/write-file.ts` — whole-file read-authorization state (`grant/has/isFresh/getUsableWholeFileAuthorizationHash`).
- `sdk/src/tools/read-files.ts` — capability minting (`encodeReadCapabilityToken`, `wholeFileReadCapability`), render.
- `sdk/src/tools/change-file.ts` + `common/src/tools/results/filesystem.ts` — mutation result shape (`file_mutation_result`, before/afterHash, freshCapabilities).
- `packages/agent-runtime/src/tools/handlers/tool/edit-application-coordinator.ts` — reconciles client mutation output back to the model.
- `agents/editor/editor.ts` — editor subagent receipt/changedFiles logic.
- Legacy/dead: `common/src/tools/params/tool/read-slices.ts`, `apply-smart-patch.ts`, `common/src/tools/constants.ts` (`quarantinedToolNames`, `publishedTools`), `common/src/types/contracts/client.ts` (`LegacyReadFilesMap`).

## Acceptance criteria
- AC1: A range-read cap.v3 authorizes an edit within its observed range when the targeted content hash matches current content; it cannot authorize a whole-file overwrite unless the capability covers the whole current file. A whole-file cap authorizes a matching sub-range or whole-file edit. One validation path applies within the capability's observed scope, with the observed-bytes floor preserved.
- AC2: After any applied edit, the model-visible tool result contains the new file content (bounded) + a fresh usable cap.v3 for the edited path.
- AC3: The editor subagent returns `completed` with correct `changedFiles` whenever mutations applied.
- AC4: No cap.v2, object-form basedOnRead, legacy path-keyed read map, or `expectedHash` legacy form remains in the active code path; `read_slices`/`apply_smart_patch` removed if unreferenced.
- AC5: All package typechecks pass and the read/edit test suites pass (updated to the unified model).

## Risks
- R1: Auth core rewrite has the widest blast radius in the repo; heavy test churn in `process-str-replace.test.ts`, `read-files-edit-state.test.ts`, `content-hash.test.ts`, `edit-transaction.schema.test.ts`, `process-edit-transaction.test.ts`.
- R2: Removing the legacy path-keyed read-result parser could break resuming persisted chat histories authored before cap.v3. Self-contained CLI + user directive says remove; flag if a persisted-format migration is needed.
- R3: Embedding post-edit content in mutation results increases context cost for large files — bounded by the existing 10MB read ceiling and only for edited files.
