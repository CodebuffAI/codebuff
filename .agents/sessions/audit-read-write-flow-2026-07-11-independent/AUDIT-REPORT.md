# Independent audit: read/write tools and flow

Date: 2026-07-11

## Conclusion

Openbuff has a strong internal foundation for safe filesystem work: canonical path checks, sensitive-file policy, structured read results, read-before-edit state, mutation authority, receipts, bounded reads, and rollback modeling are all present. The largest gaps occur at boundaries between those mechanisms.

The audit found six high-risk clusters:

1. write paths advertise stronger concurrency/verification guarantees than they consistently enforce;
2. some read recovery instructions cannot succeed with the default filesystem adapter;
3. canonical result contracts conflict with accepted legacy schemas and are degraded across SDK/runtime/CLI handoffs;
4. structural and adjacent filesystem tools bypass the primary adapter/policy path;
5. cancellation, proposal, hook, partial-read, and unconfirmed states are not represented coherently to users;
6. the public SDK surface does not expose or negotiate the capabilities implemented internally.

No critical vulnerability was established. Eight findings are high severity, two are medium-high, and six are medium. Confidence is high for all direct code-path findings. UX impact is high-confidence where render logic is deterministic, but frequency and visual prominence remain inference because no live provider-backed TUI session was run.

## Ranked findings

### 1. High — atomic commit capability is bypassed by common update paths

**Evidence:** `CodebuffFileSystem` exposes `conditionalCommit`, but `write_file`, `str_replace`, and transaction update commits validate state and later call ordinary `writeFile` (`common/src/types/filesystem.ts:54-58`, `sdk/src/tools/change-file.ts:625-655`, `sdk/src/tools/change-file.ts:783-834`). In-process authority locks do not cover external processes or adapter users.

**Inference:** another writer can change a file between final validation and write, after which Openbuff can overwrite unseen content and still issue a successful receipt. This is the highest-confidence correctness risk in the write path.

**Improvement:** route updates through conditional commit using the prepared hash; expose a clearly weaker authority tier when an adapter cannot provide it. Add conditional delete/native move and, eventually, a native multi-path transaction capability.

### 2. High — large-file read recovery is a dead end on the default filesystem

**Evidence:** the default adapter is `fs.promises` (`sdk/src/run.ts:351`). Whole reads over 10 MB recommend retrying with a range, but oversized range reads require optional `readTextRange`; without it they return `unsupported` (`sdk/src/tools/read-files.ts:371-386`, `sdk/src/tools/read-files.ts:648-660`). Tests explicitly accept that failure.

**Inference:** the default CLI/SDK path can tell an agent exactly how to recover and then reject the recovery attempt. Large source/generated files are therefore unreadable through the primary tool unless the host supplies a custom capability.

**Improvement:** implement bounded line/byte range reading for the default Node adapter, or change the initial error to accurately describe the required capability and alternative route.

### 3. High — symbol and structural reads lack per-selector failure isolation

**Evidence:** `requestOptionalFile` throws for blocked, binary, unsupported-encoding, too-large, and I/O states (`sdk/src/run.ts:621-667`). `read_files.symbols`, `read_outline`, and `read_slices` await it without per-selector/state classification (`packages/agent-runtime/src/tools/handlers/tool/read-files.ts:176-200`, `packages/agent-runtime/src/tools/handlers/tool/read-outline.ts:55-93`, `packages/agent-runtime/src/tools/handlers/tool/read-slices.ts:44-53`).

**Inference:** one bad symbol selector can reject a mixed batch after other reads succeeded, defeating the canonical partial-result design and losing actionable recovery information.

**Improvement:** return typed optional-file results or catch/classify failures per selector, preserve earlier successes, and continue the batch.

### 4. High — `mutation_v1` schemas and runtime normalization disagree

**Evidence:** active mutation schemas accept canonical results and several legacy success/error shapes (`common/src/tools/params/tool/str-replace.ts:14-25`, `common/src/tools/params/tool/apply-patch.ts:9-23`, `common/src/tools/params/tool/edit-transaction.ts:170-194`). Metadata advertises `mutation_v1`, while runtime normalization rejects schema-valid legacy shapes as malformed/unconfirmed (`common/src/tools/metadata.ts:157-166`, `packages/agent-runtime/src/tools/tool-executor.ts:84-143`). A current test codifies this contradiction.

**Inference:** schema consumers cannot rely on accepted output meaning accepted runtime evidence. Compatibility behavior is effectively split across two incompatible contracts.

**Improvement:** make the canonical envelope the only active internal/runtime output; isolate legacy translation at an explicitly versioned boundary and test output exclusivity.

### 5. High — mutation failures lose recovery detail and can leak proposed content

**Evidence:** single-file mutation failures are collapsed toward generic `application_rejected` results (`sdk/src/tools/change-file.ts:108-138`). Failure logging prints the entire proposed content (`sdk/src/tools/change-file.ts:873-875`), and the runtime also logs full `write_file` content (`packages/agent-runtime/src/tools/handlers/tool/write-file.ts:278`).

**Inference:** users/models lose the precise stale/policy/I/O recovery branch, while logs can capture secrets or proprietary source that was never successfully committed.

**Improvement:** preserve typed sanitized error codes, retryability, and recovery; log only operation metadata, path fingerprint, and byte counts—never mutation payloads.

### 6. High — transaction success is finalized before receipt verification completes

**Evidence:** transaction code calls `finishCommit(...succeeded: true)` before `issueCommittedReceipt` re-reads and verifies final hashes (`sdk/src/tools/change-file.ts:342-418`). Authority state is terminal once committed, while observed-failure receipts can still be created for committed operations (`sdk/src/tools/filesystem-authority.ts:311-334`, `sdk/src/tools/filesystem-authority.ts:393-403`).

**Inference:** a verification failure can trigger rollback logic after authority state already says committed, producing ambiguous lease/receipt/rollback semantics.

**Improvement:** treat verification as part of the commit lease and finalize success only after verified receipt issuance; model verification failure as a distinct terminal state with explicit rollback evidence.

### 7. High — canonical successful mutations lose their diff and create/update identity in the CLI

**Evidence:** canonical results store action type/path/patch in `actions[]` (`sdk/src/tools/change-file.ts:74-103`). CLI diff and create detection still primarily inspect legacy top-level fields/messages (`cli/src/utils/implementor-helpers.ts:615-675`, `cli/src/utils/implementor-helpers.ts:824-840`). Existing component fixtures use legacy payloads.

**Inference:** an applied canonical edit can display with no diff, and a created file can be labeled/counted as an edit. The primary user proof of what changed is lost even though the result contains it.

**Improvement:** create one canonical mutation normalizer for cards, activity, and summaries using action-level `action`, paths, patch, receipt, and outcome.

### 8. High — cancellation can misreport a mutation that later completes

**Evidence:** interrupt handling marks unresolved writes terminally cancelled (`cli/src/utils/block-operations.ts:537-552`). A late authoritative result is attached without changing lifecycle (`cli/src/utils/sdk-event-handlers.ts:596-608`), and edit cards give cancellation precedence over canonical outcome (`cli/src/components/tools/str-replace.tsx:189-207`). The behavior is asserted by test. Native `apply_patch` also receives no abort signal (`sdk/src/run.ts:1084-1091`).

**Inference:** the CLI can say “Cancelled before completion” even when disk changed. For signal-blind mutations, cancellation is partly a presentation state rather than a guarantee about side effects.

**Improvement:** separate run interruption from authoritative mutation outcome; show applied-after-interrupt/not-applied/unconfirmed explicitly and reconcile unknown late states by re-reading.

### 9. Medium-high — override range correlation can accept the wrong content/capability

**Evidence:** same-path range results are correlated by index/kind/path rather than requested coordinates (`sdk/src/tools/read-files.ts:1035-1066`, `sdk/src/tools/read-files.ts:1115-1146`, `packages/agent-runtime/src/get-file-reading-updates.ts:217-236`).

**Inference:** a reordered or incorrect override response can be associated with the wrong request and potentially mint/retain an edit capability for content that does not cover the requested range.

**Improvement:** use explicit selector IDs and validate returned start/end/completeness against each request before accepting content or capability.

### 10. Medium-high — `read_subtree` bypasses injected filesystem authority and mixes live/stale state

**Evidence:** `read_subtree` directly uses host `node:fs`, not `CodebuffFileSystem`, `fileFilter`, canonical authorization, or the primary sensitive-file policy (`packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:1-25`, `packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:164-235`). It combines live filesystem paths with cached `fileTokenScores` symbols (`packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:130-139`, `packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:254-266`).

**Inference:** virtual/remote/sandbox adapters can see a different tree than `read_files`, and recently changed files can show current paths with stale symbol data without provenance.

**Improvement:** route subtree through the same adapter/policy path and expose current-vs-cached provenance or refresh symbols from current content.

### 11. Medium — structured reads exist, but the SDK defaults to lossy legacy output

**Evidence:** `filesystemResultFormat` defaults to `legacy-v0` (`sdk/src/run.ts:170-173`, `sdk/src/run.ts:346`). The mapper flattens ordered selectors, typed errors, truncation, recovery, and capabilities into path-keyed strings (`sdk/src/tools/read-files.ts:838-888`).

**Inference:** new integrations are nudged toward the least observable and least evolvable ABI, and duplicate selectors for one path become ambiguous.

**Improvement:** default new client usage to structured v1 and retain legacy behavior only behind explicit compatibility selection.

### 12. Medium — `fsSource` is not a complete filesystem abstraction

**Evidence:** read/write core uses the injected adapter, but `read_image`, file-change hooks, subtree, and search/process-backed paths use direct Node filesystem/process views or receive no adapter (`sdk/src/tools/read-image.ts:44-49`, `sdk/src/tools/file-change-hooks.ts:53-124`, `sdk/src/run.ts:1122-1160`).

**Inference:** hosts using overlays, remote workspaces, browser adapters, or permission-mediating filesystems cannot assume all tools see or enforce the same authority boundary.

**Improvement:** publish a capability/support matrix; route compatible tools through adapter capabilities and fail closed with typed unsupported results when host-backed operations are unavailable.

### 13. Medium — proposal lifecycle is model-only and lacks a coherent review UX

**Evidence:** proposal accept/reject/apply requires IDs, revisions, and base hashes (`common/src/tools/params/tool/proposal-actions.ts:12-65`). Preview tools have edit renderers, but lifecycle tools fall back to generic rendering and there are no direct user actions (`cli/src/components/tools/registry.ts:36-61`, `agents/base2/base2.ts:167-170`). Proposal `str_replace` also claims parity while omitting direct-tool options such as `atomic`, `occurrenceIndex`, and `skipIfMissing` (`common/src/tools/params/tool/propose-str-replace.ts:43-77`, `common/src/tools/params/tool/str-replace.ts:35-95`).

**Inference:** users cannot directly inspect and control the CAS lifecycle, and some valid direct edits cannot be previewed with equivalent semantics.

**Improvement:** add a proposal review/apply card with lifecycle state and actions; share replacement schemas/semantics or state the unsupported differences explicitly.

### 14. Medium — unconfirmed mutations disappear from completion summaries

**Evidence:** canonical `unconfirmed` outcomes are excluded from edited counts and are not added as failures/warnings; canonical `errors[]` is not used for summary classification (`cli/src/utils/completion-summary.ts:57-70`, `cli/src/utils/completion-summary.ts:143-151`, `cli/src/utils/completion-summary.ts:178-186`). A test intentionally expects zero edited and zero failed.

**Inference:** the final status can look clean or be absent precisely when disk state is unknown and user reconciliation is required.

**Improvement:** add explicit unconfirmed, rolled-back, and rollback-incomplete summary states with affected paths and a re-read/reconcile action.

### 15. Medium — validation hooks are effectively invisible in the run UX

**Evidence:** hook results support named commands, terminal outputs, errors, and validation statuses (`common/src/tools/params/tool/run-file-change-hooks.ts:43-61`). The CLI card mostly shows changed paths and inspects only the first result for special status; completion summaries only aggregate generic terminal commands (`cli/src/components/tools/run-file-change-hooks.tsx:32-65`, `cli/src/utils/completion-summary.ts:91-104`).

**Inference:** configured validation can fail without an adequate per-hook card or final aggregate, and “no hooks configured” is not clearly distinguished from verified success.

**Improvement:** render per-hook pass/fail/skipped rows with bounded output and include hook validation in completion summaries.

### 16. Medium — tool reachability and mutation composition have product gaps

**Evidence:** transactions cannot compose `replace_range`, `rewrite_symbol`, patch hunks, or whole-file overwrite primitives (`common/src/tools/params/tool/edit-transaction.ts:72-168`). Documentation says `apply_patch` is active and `apply_smart_patch` quarantined, while live quarantine is empty and primary agents expose smart patch (`common/src/tools/constants.ts:137-143`, `agents/base2/base2.ts:69-104`, `docs/request-flow.md:57-59`). `read_slices` is marked deprecated but remains prompt-visible and required by reachability tests (`common/src/tools/metadata.ts:173-175`, `agents/tool-reachability.test.ts:16-32`).

**Inference:** agents must trade coordinated rollback for safer edit primitives, while contradictory tool availability/deprecation signals increase selection ambiguity and maintenance surface.

**Improvement:** expand transaction action algebra, establish one generated capability/reachability manifest, and remove deprecated aliases from new prompts while retaining compatibility handling.

## Cross-cutting feature improvements

- Byte-safe, encoding-aware mutation APIs and metadata-preserving move/delete/rollback. Current transaction snapshots are UTF-8 text and cannot guarantee restoration of permissions, symlinks, ACLs, xattrs, or binary identity.
- A public filesystem capability preflight so tools can be filtered/annotated before model execution instead of failing late.
- A public, typed mutation event callback carrying actions, paths, hashes, receipt, operation ID, and awaitable delivery semantics; current `onFilesChanged(): void` is insufficient for precise host synchronization.
- First-class dry-run/preflight and receipt query/export APIs for destructive or multi-file changes.
- Output budgets/pagination for symbols and outlines, plus clustered reads for far-apart ranges in oversized files.
- A single canonical read envelope for outline/subtree/symbol tools and a single canonical mutation normalizer across runtime, SDK, CLI, and completion summaries.

## Existing strengths

- Canonical path containment, sensitive-file filtering, binary/encoding classification, bounded concurrency, truncation modeling, and ordered structured read results are well-developed in `read_files`.
- Filesystem authority provides policy phases, locks, leases, receipts, redaction, and optional stronger adapter capabilities.
- Runtime read-before-edit state and write barriers cover many stale-edit and scheduling cases.
- External mutation results are conservatively downgraded to unconfirmed instead of trusting self-certified receipts.
- Current tests cover a wide range of component behavior; the gaps are concentrated in cross-boundary and adversarial scenarios.

## Validation and limits

213 focused tests passed: 14 common, 47 agent-runtime, 101 SDK, 43 CLI, and 8 agents. This confirms the repository is currently internally consistent with the observed behavior; it does not negate the findings. Several tests explicitly lock in problematic compatibility or UX behavior.

This was a source-and-test audit, not a live provider/TUI usability study. No hostile concurrent filesystem process was run, so race impact is derived from direct check-then-write code paths. Filesystem metadata behavior of external adapters is unknown. Existing audit reports and remediation plans were not read or used as evidence.

See `COVERAGE-MATRIX.md` for subsystem, domain, test, and out-of-scope accounting.
