# Write/edit path architectural audit

## Scope

Reviewed the write-path contracts and primary implementations spanning:

- Runtime preparation, read-before-edit state, application confirmation, and transactions: `packages/agent-runtime/src/process-edit-transaction.ts`, `packages/agent-runtime/src/tools/handlers/tool/{write-file,str-replace,replace-range,edit-transaction,apply-patch,apply-smart-patch,edit-application-coordinator,edit-read-state,proposal-actions,proposal-ledger-store}.ts`.
- SDK authority and filesystem application: `sdk/src/tools/{change-file,replace-range,apply-patch,filesystem-authority,path-utils,node-filesystem,file-change-hooks,mutation-capabilities}.ts`.
- Schemas and public contracts: `common/src/actions.ts`, `common/src/types/filesystem.ts`, and the write/edit tool parameter modules under `common/src/tools/params/tool/`.
- CLI result rendering: `cli/src/components/tools/{edit-transaction,apply-patch,proposal-actions,diff-viewer}.tsx`.
- Focused tests and documentation covering mutation receipts, rollback outcomes, path containment, conditional commits, proposals, and edit-tool semantics.

The audit prioritized cross-process concurrency, transactional invariants, stale-read enforcement, path authority, mutation receipts, rollback behavior, resource bounds, and user-visible contract accuracy.

## [HIGH] correctness — sdk/src/tools/change-file.ts:763 — Default writes emulate conditional commit despite the filesystem contract forbidding it

- **Risk:** On the default Node adapter, another process can change a file after Openbuff's final stale-state check but before `writeFile`/`unlink`, allowing a stale agent edit or delete to overwrite newer external work while still returning an applied result.
- **Fix:** Implement real `conditionalCommit` and `conditionalDelete` capabilities for the default local filesystem authority (for example through an OS-backed helper/sidecar or a safely staged compare-and-swap primitive), or fail closed for expected-hash mutations when the adapter lacks them; do not silently downgrade guarded mutations to check-then-write.
- **Evidence:** `common/src/types/filesystem.ts:35-38` explicitly says absent atomic capabilities must not be emulated with check-then-write. `createNodeFileSystem()` provides `createFileExclusive`, `renameFile`, and range reads but no `conditionalCommit`/`conditionalDelete` (`sdk/src/tools/node-filesystem.ts:15-26`). Nevertheless, updates fall through to unconditional `fs.writeFile` when `conditionalCommit` is unsupported (`sdk/src/tools/change-file.ts:763-777`), and deletes similarly fall back to `unlink`. The earlier comparison at `sdk/src/tools/change-file.ts:343-373` cannot close an external-process TOCTOU race.

## [HIGH] state mutation — sdk/src/tools/change-file.ts:780 — Rollback can overwrite unrelated concurrent changes

- **Risk:** If a later transaction action fails, rollback can destroy edits made by another process after an earlier action committed, because restoration is unconditional and does not verify that the path still contains this transaction's own `afterContent`.
- **Fix:** Make every rollback action conditional on the exact post-action hash/state recorded by the transaction, use exclusive recreation for restored deletes/moves, and report a conflict without writing when current state no longer matches the transaction-owned state. Add adversarial tests that inject an external write between commit and rollback.
- **Evidence:** The failure path rolls back every attempted action at `sdk/src/tools/change-file.ts:459-470`. `rollbackPreparedTransactionChange()` then restores deleted, moved, and updated paths using unconditional `writeFile`, `renameFile`, or `unlink` (`sdk/src/tools/change-file.ts:780-820`) without comparing current content to `afterContent`. Internal canonical-path locks serialize only users of the same in-process `FilesystemAuthority`; they do not protect against editors, git, formatters, or other processes.

## [HIGH] correctness — sdk/src/tools/change-file.ts:738 — Native move does not preserve the destination-absent invariant

- **Risk:** A concurrent process can create the destination after preflight, and the default Node `rename` may replace that destination, silently deleting external content even though the public move contract requires `destinationExpectedHash: null`.
- **Fix:** Introduce a no-clobber/conditional-move capability and require it for native moves. Where unavailable, use exclusive destination creation plus conditional source deletion, or fail closed rather than calling replacement-capable `rename` after a non-atomic absence check.
- **Evidence:** Destination absence is checked before commit at `sdk/src/tools/change-file.ts:343-357`; the default adapter exposes `nodeFs.rename` directly (`sdk/src/tools/node-filesystem.ts:23-24`); and the commit path calls it without a second atomic no-clobber guard (`sdk/src/tools/change-file.ts:738-741`). The authority lock cannot prevent an external process from creating the destination between those operations.

## [MEDIUM] performance — common/src/actions.ts:41 — Transactions have no operation-count or aggregate-byte limits

- **Risk:** A custom/programmatic agent or SDK caller can submit an arbitrarily large transaction, causing duplicated whole-file reads, before/after snapshots, generated patches, rollback buffers, hashes, and receipt data to consume excessive memory and block the agent runtime.
- **Fix:** Define shared limits for edit count, unique paths, per-file bytes, and aggregate prepared/rollback bytes; validate them in the common schema and re-enforce them in the SDK after resolving actual file sizes. Return a structured `resource_limit` error with guidance to split the transaction.
- **Evidence:** The SDK transport schema is an unbounded `z.array(FileChangeSchema)` (`common/src/actions.ts:41`), while the model-facing transaction schema only applies `.min(1)` (`common/src/tools/params/tool/edit-transaction.ts:318-329`). The runtime reads every unique path into `initialContentByPath` (`packages/agent-runtime/src/tools/handlers/tool/edit-transaction.ts:122-149`), and the SDK retains full before/after content for preparation and rollback. Concurrency is capped at eight operations, but total memory and work are not capped.

## [MEDIUM] API/ABI contracts — packages/agent-runtime/src/tools/handlers/tool/edit-transaction.ts:526 — Runtime messaging still overstates commit atomicity

- **Risk:** Agents and downstream clients can treat a best-effort rollback transaction as externally atomic, make dependent decisions before checking the canonical receipt outcome, or communicate a stronger guarantee than the SDK provides.
- **Fix:** Reserve “atomic” for preflight-only behavior or an authority tier that actually guarantees it. Replace commit-path wording with “coordinated transaction with verified outcome and best-effort rollback,” and make the authority tier plus canonical outcome prominent in all result renderers and recovery messages.
- **Evidence:** The schema documentation correctly warns that commit failures use best-effort rollback and external atomicity must not be assumed (`common/src/tools/params/tool/edit-transaction.ts:349`), but runtime output still says it was “atomically applying” patches (`packages/agent-runtime/src/tools/handlers/tool/edit-transaction.ts:525-528`) and the preparation layer repeatedly labels the operation `Atomic edit_transaction` (`packages/agent-runtime/src/process-edit-transaction.ts:145-193`). The SDK explicitly supports `rollback_incomplete`, demonstrating that commit atomicity is not guaranteed.

## Domains with no additional high-confidence finding

- **Security:** Path inputs are rejected lexically in the runtime and re-authorized through filesystem-aware realpath/symlink containment plus resolve/commit policy checks in the SDK. No additional traversal or policy-bypass issue was identified in the reviewed write path.
- **Error handling:** Canonical mutation results, authority receipts, explicit `rolled_back`/`rollback_incomplete` outcomes, fresh-read recovery, and CLI rendering generally preserve failure visibility. The unsafe rollback behavior is reported above as a state-mutation invariant rather than duplicated here.
- **Dependency hygiene:** The reviewed write path relies on existing platform APIs, Zod schemas, and the existing `diff` dependency; no undeclared, duplicated, or runtime-only dependency issue was found.
- **Test coverage gaps:** Existing tests cover path rejection, conditional-commit adapters, rollback success/incompleteness, mutation receipt schemas, proposal revisions, and result rendering. The material missing cases are the external-concurrency/rollback-conflict and resource-limit tests called out in the findings above; they are not duplicated as standalone findings.
- **CLI rendering:** The reviewed renderers expose canonical outcomes and rollback status rather than presenting every returned diff as applied. No separate rendering defect was identified.
