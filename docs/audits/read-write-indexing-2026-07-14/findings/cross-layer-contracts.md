# Cross-layer read/write/indexing contract audit

## Scope and files reviewed

This shard inspected live contract definitions and adapters across `common`, `packages/agent-runtime`, `sdk`, `packages/indexer`, and `cli`, focusing on read/write/`query_index` result shapes, capability and snapshot identity, output normalization, generated/public types, and compatibility fallbacks.

Primary evidence came from:

- `common/src/tools/list.ts`
- `common/src/tools/metadata.ts`
- `common/src/tools/params/based-on-read.ts`
- `common/src/tools/params/tool/read-files.ts`
- `common/src/tools/params/tool/query-index.ts`
- `common/src/tools/params/tool/str-replace.ts`
- `common/src/tools/params/tool/write-file.ts`
- `common/src/tools/params/tool/apply-patch.ts`
- `common/src/tools/params/tool/edit-transaction.ts`
- `common/src/tools/results/filesystem.ts`
- `common/src/types/contracts/client.ts`
- `common/src/util/content-hash.ts`
- `packages/agent-runtime/src/get-file-reading-updates.ts`
- `packages/agent-runtime/src/process-str-replace.ts`
- `packages/agent-runtime/src/tools/tool-executor.ts`
- `packages/agent-runtime/src/tools/handlers/tool/query-index.ts`
- `packages/agent-runtime/src/util/simplify-tool-results.ts`
- `sdk/src/run.ts`
- `sdk/src/tools/read-files.ts`
- `sdk/src/tools/mutation-capabilities.ts`
- `packages/indexer/src/types.ts`
- `packages/indexer/src/index-manager.ts`
- `cli/src/utils/codebuff-client.ts`
- `cli/src/utils/create-run-config.ts`
- `cli/src/utils/tool-result-normalizer.ts`
- `cli/src/components/tools/query-index.tsx`
- `cli/src/data/initial-agent-type-sources.generated.ts`

The findings below are based on direct source evidence. Risk statements are architectural consequences of the cited contracts. No product code was modified.

## [HIGH] security / API contract — common/src/util/content-hash.ts:37 — Capability identity splits into path-bound snapshots and pathless bearer hashes

- **Risk:** The structured filesystem contract says authorization is bound to `snapshot.canonicalPath` and `contentHash`, but the capability actually copied into edit inputs is a `cap.v2` string containing only line bounds and a public content hash. Because `basedOnRead` presence bypasses strict read-before-edit for the target path, the token can be replayed against an equal-content range in a different file or reconstructed by a caller that knows the content. The public API therefore exposes two incompatible meanings of “capability”: path-bound authority objects and pathless freshness assertions.
- **Fix:** Make one canonical capability envelope authoritative across read results, edit inputs, mutation results, and receipts. Bind it to project/root identity, canonical path, range or symbol, content hash, run/issuer, and expiry/generation; authenticate it or resolve an opaque registry ID. Deprecate free-standing `{startLine,endLine,hash}` authorization and route all checks through the path-bound authorization function.
- **Evidence:** `common/src/util/content-hash.ts:37-70` encodes only range bounds and hash. `common/src/tools/params/based-on-read.ts:16-25` says the token's presence bypasses strict read-before-edit for the target path. `packages/agent-runtime/src/process-str-replace.ts:800-842` validates only the current target range hash. By contrast, `common/src/tools/results/filesystem.ts:83-129` defines a snapshot with `canonicalPath`, while `:827-857` authorizes only when canonical path and base hash match. `sdk/src/tools/mutation-capabilities.ts:9-36` wraps the pathless token inside a path-bound whole-file capability, leaving consumers able to detach and replay the token.

## [HIGH] API/ABI contract / correctness — common/src/tools/metadata.ts:173 — Tools declared as `mutation_v1` still publish legacy output unions

- **Risk:** Metadata tells scheduling, validation, and renderers that active mutation tools use `mutation_v1`, but their Zod/public TypeScript outputs still accept legacy success/error objects. The runtime silently converts those accepted legacy objects into an `unconfirmed` canonical mutation. A caller typed against `CodebuffToolOutput<T>` must therefore handle multiple incompatible result families even when metadata promises one contract, and an integration can appear schema-valid while losing receipt, action, hash, and applied-state evidence during normalization.
- **Fix:** Separate compatibility input from the canonical output type. Normalize legacy SDK/override responses at the boundary before they enter `CodebuffToolOutput`, then validate and expose only `file_mutation_result` for tools marked `mutation_v1`. Put legacy acceptance behind an explicit negotiated ABI adapter with telemetry and a removal version.
- **Evidence:** `common/src/tools/metadata.ts:173-182` assigns `mutation_v1` to every non-legacy mutation tool. `common/src/tools/list.ts:156-160` derives the public output type directly from each tool's output schema. Yet `common/src/tools/params/tool/str-replace.ts:15-33`, `apply-patch.ts:13-35`, and `edit-transaction.ts:267-291` union canonical mutation results with legacy objects; `write-file.ts:76-82` reuses that union. `packages/agent-runtime/src/tools/tool-executor.ts:180-305` accepts a schema-valid legacy result and rewrites it as `outcome: 'unconfirmed'` with no authority tier or receipt.

## [MEDIUM] state mutation / correctness — packages/indexer/src/index-manager.ts:201 — `query_index` serves stale snapshots without a stable snapshot identifier

- **Risk:** Serving the last-known-good index while refresh runs is intentional and labeled, but the result exposes only a moving age and status booleans. There is no build generation, corpus fingerprint, project-root identity, or per-result file hash that a downstream agent, cache, reviewer, or later `read_files` call can correlate. A query result can therefore be retained across mutations or compaction with no machine-readable way to determine which index snapshot produced it.
- **Fix:** Version the `query_index` result and include an immutable snapshot identity: canonical project ID/root digest, index schema version, build generation/fingerprint, built-at timestamp, and coverage fingerprint. Include indexed content hash/generation per result where available, so later reads can explicitly confirm or invalidate retrieval evidence.
- **Evidence:** `packages/indexer/src/index-manager.ts:201-216` deliberately queries `this.index` while refresh is pending. `packages/indexer/src/types.ts:53-62` stores `projectRoot`, `builtAt`, file hashes, and index version internally, but `common/src/tools/params/tool/query-index.ts:169-237` exposes only results, counts, `indexAge`, message, and status. `cli/src/utils/codebuff-client.ts:166-175` drops internal snapshot fields when assembling the tool result. `cli/src/utils/create-run-config.ts:156-165` makes mutation invalidation best-effort and swallows failures, increasing the value of explicit snapshot identity.

## [MEDIUM] API/ABI contract / dependency hygiene — packages/indexer/src/types.ts:71 — The `query_index` contract is independently redefined at three layers

- **Risk:** Indexer types, common Zod schemas, and CLI renderer types evolve independently. The common schema weakens the indexer's closed `matchedOn` union to arbitrary strings, while the CLI uses `unknown` fields and hand-written extraction; the CLI override then assembles the response through `JSONObject` casts. A field rename, new status state, or changed optionality can compile in one package while silently degrading or being misrendered in another.
- **Fix:** Define a versioned transport DTO and schema in one leaf contract package. Make the indexer return that DTO (or an explicit mapper exhaustively checked with `satisfies`), generate/infer SDK and CLI types from the same schema, and reject unknown versions rather than heuristically accepting records.
- **Evidence:** `packages/indexer/src/types.ts:71-89` defines `IndexStatus`, and `:171-189` defines `QueryIndexResult` with a closed `matchedOn` union. `common/src/tools/params/tool/query-index.ts:169-237` duplicates the shape and allows `matchedOn: string[]`. `cli/src/components/tools/query-index.tsx:11-42` defines a third permissive `unknown`-based shape and `:276-295` accepts any record with a string path. `cli/src/utils/codebuff-client.ts:142-175` manually copies fields into `JSONObject` and casts status through `unknown`.

## [MEDIUM] API/ABI contract / error handling — common/src/types/contracts/client.ts:34 — Read compatibility is negotiated out-of-band but remains a union inside the runtime

- **Risk:** The SDK option and override descriptors distinguish legacy-v0 from structured-v1, but the runtime dependency type still accepts either result on every call. `read_files` then has a one-off validation/repair path separate from the general result normalizer, and legacy maps are re-parsed from content markers. This keeps marker text, transport version, and authorization behavior coupled and makes it possible for new read semantics to be lost when a host returns the older map shape.
- **Fix:** Normalize v0 overrides to structured-v1 entirely inside the SDK before satisfying `RequestFilesFn`; change the runtime contract to `Promise<ReadFilesResultV1>` only. Keep legacy result generation only at the external SDK return boundary for callers explicitly requesting it, not inside agent-runtime dependencies.
- **Evidence:** `common/src/types/contracts/client.ts:34-40` defines `RequestFilesResult` as structured-or-legacy. `sdk/src/run.ts:946-991` selects result format or forwards override output, while `sdk/src/tools/read-files.ts:1022-1197` contains a second legacy-to-structured normalizer. `packages/agent-runtime/src/get-file-reading-updates.ts:20-205` maintains another marker-based legacy normalizer. `packages/agent-runtime/src/tools/tool-executor.ts:1151-1206` special-cases malformed `read_files` output instead of using the general normalization path.

## [MEDIUM] correctness / state mutation — sdk/src/tools/mutation-capabilities.ts:14 — Snapshot “generation” is a wall-clock timestamp, not a monotonic identity

- **Risk:** `readGeneration` appears in the canonical snapshot contract but is minted with `Date.now()`. Multiple capabilities created in the same millisecond can share a generation, system-clock movement can make later snapshots appear older, and generation is not scoped to project, path, or run. Consumers cannot safely use it for ordering, cache invalidation, or replay detection.
- **Fix:** Define generation semantics explicitly and mint it from a per-run/per-path monotonic counter or a content-addressed snapshot ID. If ordering is unnecessary, remove `readGeneration` and expose an immutable `snapshotId`; keep wall-clock time as a separately named observational timestamp.
- **Evidence:** `common/src/tools/results/filesystem.ts:83-91` defines `readGeneration` as a nonnegative number without scope or ordering semantics. `sdk/src/tools/mutation-capabilities.ts:27-35` assigns `Date.now()` directly. Authorization at `common/src/tools/results/filesystem.ts:827-857` ignores the field entirely, so it currently looks authoritative without participating in validation.

## [MEDIUM] error handling / CLI correctness — cli/src/utils/tool-result-normalizer.ts:42 — UI error interpretation is recursive and contract-agnostic

- **Risk:** The shared CLI normalizer walks arbitrary nested records to depth six and treats any `error` or `errorMessage` as a tool-level error, regardless of tool kind, result version, lifecycle, aggregate outcome, or whether the nested error describes a rolled-back/non-primary action. Custom components then combine that inferred error with their own hand-written status logic. Adding a legitimate nested diagnostic field can change the visible tool status without a schema or compiler failure.
- **Fix:** Normalize tool outputs by `(toolName, kind, version)` using discriminated schemas. Derive terminal success/partial/failure from canonical aggregate fields (`outcome`, `status`, lifecycle), and render nested action/diagnostic errors as details rather than using their mere presence as the aggregate verdict.
- **Evidence:** `cli/src/utils/tool-result-normalizer.ts:42-73` recursively searches all objects and arrays for `error`/`errorMessage`. `cli/src/components/tools/query-index.tsx:60-70` uses the first recursively discovered message to force status `failed`, while `:316-341` separately interprets index status and message prose. Canonical mutation aggregation already exists in `common/src/tools/results/filesystem.ts:181-283`, but the generic error walker does not consult it.

## [MEDIUM] test coverage gaps — packages/agent-runtime/src/tools/tool-executor.ts:180 — Contract tests do not enforce one end-to-end canonical shape

- **Risk:** Existing tests validate individual schemas and compatibility adapters, but the architecture permits metadata, inferred TypeScript outputs, SDK override results, runtime-normalized outputs, and CLI rendering to disagree while each local test passes. Capability replay, legacy normalization evidence loss, query snapshot correlation, and nested-diagnostic UI behavior therefore lack a single cross-package invariant test.
- **Fix:** Add contract-matrix tests generated from `toolMetadata`: every `read_v1`, `mutation_v1`, and future versioned query tool should execute native and every supported override ABI, pass through runtime normalization, serialize/deserialize, and render in the CLI. Assert canonical kind/version, call/snapshot correlation, authority evidence, and stable aggregate status at every boundary.
- **Evidence:** `common/src/tools/metadata.ts:196-201` centralizes declared metadata, but output schemas still contain compatibility unions. `packages/agent-runtime/src/tools/tool-executor.ts:176-307` performs runtime-only normalization, and `cli/src/utils/tool-result-normalizer.ts:29-129` performs a separate untyped interpretation. No reviewed artifact derives an exhaustive cross-layer test matrix from metadata and the canonical schemas.

## Domain disposition

- **Security:** The material issue is capability identity/replay. Native SDK path containment and mutation receipt correlation otherwise fail closed in the reviewed contracts.
- **Correctness:** Findings cover stale index correlation, pseudo-generation, compatibility evidence loss, and UI aggregate interpretation.
- **State mutation:** Findings cover index invalidation/snapshot identity and non-monotonic snapshot generation.
- **Error handling:** Findings cover marker/union read compatibility and contract-agnostic CLI error inference.
- **Performance:** No additional high-confidence performance defect was found in the contract layer itself; data-volume behavior belongs to the read/index implementation shards.
- **Dependency hygiene:** The material issue is duplicated transport DTO ownership across indexer, common, SDK/CLI mapping, and renderer-local types. No package-version or undeclared-dependency issue was identified.
- **Test coverage gaps:** The missing cross-package contract matrix is described above.
- **API/ABI contracts:** This is the dominant domain: capability semantics, mutation result families, read compatibility, unversioned query results, and duplicated DTOs all expose drift risk.
