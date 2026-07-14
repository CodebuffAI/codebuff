# Read/write/indexing architectural audit

Date: 2026-07-14

Implementation status: completed on 2026-07-14. The ten architectural changes
below are now implemented across the shared workspace journal, authenticated
read capabilities, fail-closed conditional mutations, incremental watched
indexing, qualified graph identities, persisted query accelerators, parser/build
coverage, versioned tool transports, index snapshot provenance, and bounded
read/write planning. See `CONTEXT-COMPACTION-CHANGES.md` for the companion
typed-memory and failover-safe compaction work.

## Executive conclusion

Openbuff's read/write/indexing foundation is substantially stronger than the earlier July audits: structured filesystem results are the SDK default; the Node adapter supports bounded large-file range reads; mutations use explicit authority/receipt models; transactions cover a broad action algebra; index status exposes stale/degraded/partial states; and agents are consistently instructed to verify index discoveries with live reads.

The architectural program is now implemented, including a shared workspace
revision, incremental watched indexing, and a cooperative local mutation
broker. The broker provides practical CAS among participating Openbuff
processes; it intentionally does not claim kernel-enforced exclusion against
arbitrary external editors, so watchers and revision invalidation remain part
of the correctness model.

## Top 10 highest-leverage changes

### 1. Introduce a project-scoped workspace revision and durable change journal

Bind read capabilities, mutation receipts, index snapshots/results, validation snapshots, and reviewer receipts to one monotonic workspace revision. Record ordered per-path before/after hashes and mutation provenance. This is the central architectural change because it gives every subsystem a common answer to “which workspace state does this evidence describe?”

Evidence: `sdk/src/run.ts:232`, `packages/indexer/src/types.ts:53`, `common/src/tools/params/tool/query-index.ts:169`, and `sdk/src/tools/get-change-review-bundle.ts:14` currently use independent events, timestamps, hashes, and snapshot IDs.

### 2. Replace pathless `cap.v2` bearer hashes with path-bound opaque read capabilities

The edit token currently encodes only range bounds and a public content hash, while strict read-before-edit treats its presence as authorization for the supplied target path. Use one capability bound to project/root, canonical path, range/symbol, content hash, issuer/run, generation/expiry, and an authenticated or registry-backed identity.

Evidence: `common/src/util/content-hash.ts:37`, `common/src/tools/params/based-on-read.ts:16`, and `packages/agent-runtime/src/process-str-replace.ts:800`; the separate structured path-bound authorization model exists in `common/src/tools/results/filesystem.ts:827`.

### 3. Provide real conditional local mutations or fail closed when atomic authority is unavailable

Implemented with `WorkspaceMutationBroker`: the default SDK path uses a
worktree-scoped inter-process lock, exact-byte expected hashes, durable
revisioned receipts, temp-write/fsync/atomic rename, conditional delete, and
hard-link no-clobber move. Standalone/custom adapters without these primitives
remain explicitly weaker and guarded mutations fail closed. Capability
detection labels the broker `cooperative`, not `atomic`, because non-Openbuff
writers can bypass it.

Evidence: `sdk/src/services/workspace-mutation-broker.ts`,
`sdk/src/tools/node-filesystem.ts`, and `sdk/src/run.ts`.

### 4. Turn indexing into an incremental service fed by mutation deltas and filesystem watching

Wire the existing detailed mutation event into an `applyMutationDelta` path instead of discarding it into pathless `markStale()`. Persist per-file state/parse summaries, use a watcher/change journal for external edits, update affected graph/posting records, and reserve full repository walks for background integrity sweeps.

Evidence: `cli/src/utils/create-run-config.ts:156`, `packages/indexer/src/index-manager.ts:128`, and `packages/indexer/src/metadata-indexer.ts:170`.

### 5. Qualify graph identities by language, module/package, import scope, and symbol

Calls and symbol nodes are currently resolved through repository-global raw names. Duplicate names can create false call/reference edges and incorrect blast-radius results. Ambiguous unqualified calls should be omitted or down-weighted until module-aware resolution proves a target.

Evidence: `packages/code-map/src/parse.ts:346` and `packages/indexer/src/metadata-indexer.ts:462`.

### 6. Persist inverted lexical postings, document frequencies, and graph adjacency

Every query currently rebuilds adjacency and repeatedly scans corpus metadata. Store incremental postings/IDF inputs and adjacency in the index so query latency scales with candidate sets rather than the full corpus. Add latency/memory budgets at 10k, 50k, and 100k files.

Evidence: `packages/indexer/src/query.ts:133`, `:207`, and `:456`.

### 7. Make parser/index coverage explicit and recoverable

Tree-sitter file/byte budgets can stop parsing while the metadata index still appears fully ready. Surface parsed/skipped counts, bytes, languages, and prefixes; allocate budgets fairly; and support on-demand parsing for high-value skipped candidates.

Evidence: `packages/code-map/src/parse.ts:108` and `packages/indexer/src/metadata-indexer.ts:140`.

### 8. Establish one versioned transport contract per tool family

Use a canonical schema/DTO for `read_v1`, `mutation_v1`, and a new versioned query result. Normalize legacy overrides only at explicit compatibility boundaries. Generate SDK/runtime/CLI types and contract-matrix tests from those schemas rather than maintaining permissive unions and renderer-local copies.

Evidence: `common/src/tools/metadata.ts:173`, `common/src/tools/list.ts:156`, `packages/agent-runtime/src/tools/tool-executor.ts:180`, and `cli/src/utils/tool-result-normalizer.ts:42`.

### 9. Carry immutable index snapshot identity and per-result hashes through `query_index`

The index internally knows project root, version, built-at time, and file hashes, but the tool returns only age/status. Return a versioned snapshot ID/revision and indexed hash per result so compaction, caches, reviewers, and later live reads can explicitly invalidate stale retrieval evidence.

Evidence: `packages/indexer/src/types.ts:53`, `packages/indexer/src/index-manager.ts:201`, and `common/src/tools/params/tool/query-index.ts:169`.

### 10. Apply bounded work planning consistently

Bound transaction edit count/bytes, subtree task admission, and oversized-file range windows. Distant ranges should be read independently or coalesced only when their covered window fits the byte budget; subtree traversal should reserve node budget before scheduling; transactions should cap paths and rollback memory.

Evidence: `sdk/src/tools/read-files.ts:330`, `packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:177`, and `common/src/actions.ts:41`.

## Immediate correctness fixes within the larger program

- Trigger a refresh when an index becomes age-stale; status currently can report `stale` with `refreshing: false` (`packages/indexer/src/index-manager.ts:142`).
- Deliver confirmed mutation notifications after commit even if the run is later aborted, and isolate observer failures so one callback cannot suppress another (`sdk/src/run.ts:1452`).
- Conservatively invalidate read/index state around mutating terminal, custom, and MCP tools, with watchers as the external-process backstop (`packages/agent-runtime/src/tools/stream-parser.ts:288`).
- Enforce `fileTypes` on semantic-only query results (`packages/indexer/src/index-manager.ts:258`).
- Make rollback conditional on transaction-owned post-action hashes and use a no-clobber move primitive (`sdk/src/tools/change-file.ts:738`, `:780`).
- Persist metadata and semantic caches using atomic rename plus an inter-process lock/revision CAS (`packages/indexer/src/index-store.ts:71`).

## Existing strengths

- Canonical path containment, sensitive-path filtering, binary/encoding handling, structured partial reads, and edit freshness checks are extensive.
- The default SDK now uses structured filesystem results and the Node adapter supports bounded large-file range reads.
- Mutation authority, receipts, canonical outcomes, rollback outcomes, and CLI visibility provide a strong base for stricter atomic semantics.
- Indexing covers many languages, lexical/semantic/graph modes, import/call/navigation concepts, command discovery, partial walker coverage, and parser diagnostics.
- `query_index` is correctly treated as a discovery hint; live reads remain the source of truth before editing.

## Evidence versus inference

The cited contract splits, stale scheduling behavior, pathless invalidation, full-corpus scans, unqualified graph resolution, semantic filter violation, and mutation fallbacks are direct source evidence. Production frequency, latency magnitude, and likelihood of hostile concurrent writes are inference; they require stress/e2e measurement.

## Validation baseline

- `@codebuff/code-map` package test command: 112 passed, 0 failed.
- `@codebuff/indexer` package test command: 165 passed, 0 failed.
- Focused SDK/runtime read, write, transaction, and subtree suites: 109 passed, 0 failed.
- Focused common/CLI schema and renderer suites: 29 passed, 0 failed.
- `git diff --check` passed for all audit artifacts.

An initial non-standard partial code-map invocation omitted package-level WASM initialization tests and produced two parser failures. Running the package's intended `bun run --cwd packages/code-map test` command loaded the full test surface and passed all 112 tests; the partial invocation is therefore not classified as a product regression.

## Full findings

- `findings/read-path.md`
- `findings/write-path.md`
- `findings/indexing-retrieval.md`
- `findings/cross-layer-contracts.md`
- `findings/workspace-coherence.md`

See `COVERAGE-MATRIX.md` for scope and explicit exclusions. The previously completed context/compaction changes are marked in `CONTEXT-COMPACTION-CHANGES.md`.
