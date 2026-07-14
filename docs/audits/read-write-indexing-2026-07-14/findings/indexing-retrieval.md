# Indexing and retrieval architectural audit

## Scope

Audited the indexing/retrieval flow from configuration and CLI startup through filesystem discovery, metadata/tree-sitter parsing, graph construction, cache persistence, lexical/semantic ranking, the `query_index` tool contract, CLI rendering, and the policy that index hits must be verified with live reads before edits.

Primary implementation files reviewed line-by-line:

- `packages/indexer/src/index-manager.ts`
- `packages/indexer/src/index-store.ts`
- `packages/indexer/src/file-walker.ts`
- `packages/indexer/src/metadata-indexer.ts`
- `packages/indexer/src/query.ts`
- `packages/indexer/src/semantic.ts`
- `packages/indexer/src/types.ts`
- `packages/code-map/src/parse.ts`
- `packages/code-map/src/languages.ts`
- `packages/code-map/src/grammar-wasm-repair.ts`
- `packages/code-map/src/init-node.ts`
- `common/src/tools/params/tool/query-index.ts`
- `packages/agent-runtime/src/tools/handlers/tool/query-index.ts`
- `cli/src/utils/codebuff-client.ts`
- `cli/src/utils/create-run-config.ts`
- `cli/src/init/init-app.ts`
- `cli/src/commands/index-command.ts`
- `cli/src/components/tools/query-index.tsx`
- `sdk/src/provider-config.ts`

Representative tests, fixtures, package manifests, and docs were also reviewed, including index lifecycle/semantic/query/import/call/file-walker tests, code-map language/WASM/parser tests, `docs/architecture.md`, `docs/agents-and-tools.md`, `docs/configuration.md`, and `docs/testing.md`.

## [HIGH] correctness — packages/indexer/src/index-manager.ts:142 — Age-stale snapshots are labeled stale but never schedule their own refresh

- **Risk:** In a long-lived CLI process, filesystem changes made outside Openbuff can leave `query_index` serving obsolete paths, symbols, imports, and commands indefinitely. The status says the snapshot is stale, and its message says it is refreshing, even when no refresh is running.
- **Fix:** Treat `isIndexStale(this.index)` as a refresh trigger in both `waitUntilReady` and `query`, preferably backed by a debounced filesystem watcher/change journal so age is a safety sweep rather than the primary invalidation mechanism. Continue serving the last-known-good snapshot while the refresh runs.
- **Evidence:** `waitUntilReady` returns early when the index is ready and no explicit `forceRefresh` is set (`lines 143-149`), while `query` calls `ensureBuilt()` only for `forceRefresh || staleRefreshPending` (`lines 201-204`). `getStatus` independently marks the same index stale by age through `isIndexStale(this.index)` (`lines 357-375`). A direct diagnostic produced `{ state: "stale", stale: true, refreshing: false }` after aging an in-memory snapshot, confirming that age detection and refresh scheduling are disconnected.

## [HIGH] correctness — packages/code-map/src/parse.ts:108 — Parser budgets silently erase symbol/call coverage while status still reports complete indexing

- **Risk:** The default parser stops after 10,000 code files or 500 MB, but the remaining files are still inserted into the metadata index with empty symbol/call data. Large or polyglot repositories therefore get traversal-order-dependent recall loss without a parser diagnostic or partial-coverage flag; `query_index` can report a ready, complete corpus even though a large portion has only path/content metadata.
- **Fix:** Return a typed parse-coverage record containing parsed/skipped counts, bytes, and skipped prefixes/languages; merge it into `MetadataIndex.coverage` and `IndexStatus`. Allocate the parse budget fairly across top-level prefixes/languages and support on-demand parsing of high-value skipped candidates.
- **Evidence:** `getFileTokenScores` executes a bare `break` when `MAX_PARSE_FILES` or `MAX_TOTAL_PARSE_BYTES` is reached (`packages/code-map/src/parse.ts:108-113`) and adds no diagnostic for the unprocessed suffix. `buildMetadataIndex` nevertheless iterates every walked file and supplies `{}` for absent token scores (`packages/indexer/src/metadata-indexer.ts:140-151`). Its coverage object reports only walker truncation (`metadata-indexer.ts:161-166`), even though SDK configuration permits up to 100,000 indexed files (`sdk/src/provider-config.ts:339-342`).

## [HIGH] correctness — packages/code-map/src/parse.ts:346 — Graph symbol identity and call resolution are global rather than module/language scoped

- **Risk:** Common symbol names in unrelated modules or languages create false call and neighbor edges. `references` mode can then overstate blast radius, and graph boosts can promote unrelated files. In a polyglot monorepo, a call such as `open`, `render`, `main`, or `collide` is attributed to one globally selected definition rather than the definition imported or visible to the caller.
- **Fix:** Use qualified symbol identities (language + module/package + symbol), resolve calls through import/package context, and refuse ambiguous call edges instead of selecting a winner. Suppress or down-weight high-degree unqualified symbol nodes until qualified resolution exists.
- **Evidence:** `buildTokenCallers` creates one `tokenDefinitionMap` for the entire repository and retains only the highest-scoring file for each raw token (`packages/code-map/src/parse.ts:350-360`), then points every call with that name to that file (`lines 363-379`). Graph symbol nodes are likewise keyed only as `symbol:${symbol}` (`packages/indexer/src/metadata-indexer.ts:462-470, 939-941`). A direct three-file diagnostic showed the correct import edge `src/c.ts -> src/b.ts` but an incorrect call edge `src/c.ts -> src/a.ts` for the duplicated symbol `collide`.

## [HIGH] performance — packages/indexer/src/metadata-indexer.ts:170 — An incremental refresh still performs an O(repository-bytes) integrity scan and can degenerate to a full parse after restart

- **Risk:** A single agent edit causes the next query to walk/stat the whole repository and read/hash every eligible file. If the process-local parse cache is cold, one changed code file then causes all code files to be parsed again. On the configured 20k-100k-file range this can turn a supposedly incremental refresh into seconds or minutes of disk and CPU work, delaying retrieval precisely after edits.
- **Fix:** Introduce a persistent file-state/change journal fed by watcher events and edit receipts, hash only candidate changes on the hot path, run periodic full integrity sweeps in the background, and persist compact per-file parse summaries so incremental graph repair survives process restarts.
- **Evidence:** `updateMetadataIndex` hashes every walked file before deciding whether it changed (`packages/indexer/src/metadata-indexer.ts:195-217`). Raw parse reuse lives only in the process-local `parsedCacheByRoot` map (`metadata-indexer.ts:69-76`); when that map is cold, `reuseParsed` is empty and `getFileTokenScores` receives all code paths (`metadata-indexer.ts:239-274`). The only mutation signal currently wired by the CLI is the path-less `markStale()` callback after Openbuff edits (`cli/src/utils/create-run-config.ts:157-163`), so it cannot constrain the refresh to known paths.

## [HIGH] API/ABI contracts — packages/indexer/src/index-manager.ts:258 — Semantic blending violates the public `fileTypes` filter

- **Risk:** Callers asking for only TypeScript, Python, or another extension can receive semantic-only results of a different type. This breaks the `query_index` input contract and can route agents into irrelevant documentation or source languages despite an explicit filter.
- **Fix:** Filter semantic candidates using the indexed file extension before ranking/blending, or pass an allowed-path predicate into `semanticSearch`. Add a contract test covering semantic-only hits under `fileTypes`.
- **Evidence:** The tool schema promises that `fileTypes` filters results (`common/src/tools/params/tool/query-index.ts:27-33`). Lexical search receives the option, but `queryBlended` calls `searchSemantic(query, limit)` without it and directly materializes semantic-only paths (`packages/indexer/src/index-manager.ts:258-280`). A direct diagnostic with `fileTypes: ["ts"]` returned `secret-topic.md` as the top semantic result.

## [HIGH] performance — packages/indexer/src/query.ts:133 — Every query rebuilds graph adjacency and scans corpus metadata multiple times

- **Risk:** Interactive retrieval cost grows linearly with all indexed files, graph edges, query tokens, and per-file symbol/concept/import lists. At the supported 100,000-file ceiling, even a small query can perform repeated full-corpus passes before ranking, while graph modes rebuild adjacency from every edge on every call.
- **Fix:** Persist incremental inverted postings and document frequencies for lexical fields, retain adjacency maps in the index/runtime, and evaluate only the union of postings plus bounded graph/semantic candidates. Add latency and memory budgets to the retrieval-quality fixture runs at 10k/50k/100k files.
- **Evidence:** `queryIndex` constructs adjacency unconditionally (`packages/indexer/src/query.ts:138-143` and `query.ts:738-749`). Search then scans all files to score them (`query.ts:207-217`), while `computeIdfForTokens` scans all files again for every query token and searches each file's metadata arrays (`query.ts:456-494`). There is no persisted posting list, document-frequency table, or adjacency cache in `MetadataIndex` (`packages/indexer/src/types.ts:53-62`).

## [MEDIUM] state mutation — packages/indexer/src/semantic.ts:81 — Semantic vector reuse keys omit path even though path is part of the embedding input

- **Risk:** Renaming a file reuses a vector that still represents the old path, and duplicate-content files at different paths share one path-specific vector. Semantic path/name queries can therefore return stale or indistinguishable results until file content changes.
- **Fix:** Key cached vectors by a hash of the exact `fileEmbeddingText` input (plus the semantic config fingerprint), or remove path from the embedding input before using content hashes as the durable identity.
- **Evidence:** `fileEmbeddingText` includes `file.path` (`packages/indexer/src/semantic.ts:81-89`), but `buildFileVectors` reuses vectors solely by `file.hash` (`semantic.ts:103-114`). Tests explicitly require reuse across renames and duplicates (`packages/indexer/src/semantic.test.ts:87-115`) while separately asserting that the embedded text includes the path (`semantic.test.ts:130-136`), codifying mutually inconsistent cache semantics.

## [MEDIUM] error handling — packages/indexer/src/index-manager.ts:286 — Build failures are swallowed from structured status and repair UX

- **Risk:** Cache ownership problems, filesystem failures, malformed cached shapes, or indexer exceptions leave users with an `empty` or old snapshot but no structured cause. `/index status` can only render parse diagnostics stored inside a successfully built index, so the user cannot distinguish an empty repository from a failed build or determine whether `/index rebuild` can repair it.
- **Fix:** Retain a bounded `lastBuildError` with stage, timestamp, retryability, and cache path; expose a `failed`/`degraded` lifecycle state and diagnostic through `IndexStatus`; make explicit rebuild bypass/quarantine a bad metadata cache when validation fails.
- **Evidence:** `_build` catches all failures and only writes `console.debug('[indexer] build failed:', err)` (`packages/indexer/src/index-manager.ts:286-308`). `getStatus` derives diagnostics solely from `this.index?.parseDiagnostics ?? []` and maps a missing non-building index to `empty` (`index-manager.ts:357-400`). `loadIndex` performs only version/project-root checks after an unchecked cast (`packages/indexer/src/index-store.ts:55-68`), while `/index rebuild` merely sets `markStale()` and runs the same load/update path (`cli/src/commands/index-command.ts:94-109`).

## [MEDIUM] test coverage gaps — packages/indexer/src/index-manager.test.ts:48 — Lifecycle and retrieval tests omit the adversarial boundaries above

- **Risk:** The current suite can remain green while age-based refresh is inert, ambiguous symbols create false edges, parser budgets hide coverage loss, and semantic filtering violates its public contract.
- **Fix:** Add deterministic regressions for age-stale auto-refresh without `markStale`, duplicate symbol names with conflicting imports and languages, parser file/byte budget exhaustion with surfaced coverage, semantic `fileTypes`, renamed path-sensitive embeddings, and query latency envelopes on generated large indexes.
- **Evidence:** Lifecycle tests cover only explicit `markStale()` flows (`packages/indexer/src/index-manager.test.ts:48-185`); call navigation uses one unambiguous `computeTax` definition (`packages/indexer/src/call-navigation.test.ts:19-59`); semantic manager tests exercise ranking and weights but not `fileTypes` (`packages/indexer/src/index-manager-semantic.test.ts:93-219`). No indexer regression asserts surfaced coverage when `MAX_PARSE_FILES` or `MAX_TOTAL_PARSE_BYTES` is exhausted.

## Domains with no additional high-confidence findings

- **Security:** The walker applies mandatory sensitive-path filtering before indexing (`packages/indexer/src/file-walker.ts:217-222`); cache directories are sanitized and ownership-checked (`packages/indexer/src/index-store.ts:18-46, 177-189`); runtime grammar repair uses immutable URLs/package versions, pinned SHA-256 verification, an abort timeout, and atomic rename (`packages/code-map/src/grammar-wasm-repair.ts:23-131`). Semantic source disclosure is explicit, opt-in, and documented. No additional exploitable security defect was established in this shard.
- **Dependency hygiene:** Runtime dependencies are declared in the owning packages; tree-sitter runtime/grammar versions are exact-pinned in `packages/code-map/package.json`, and downloaded fallback grammars are checksum-pinned. No undeclared, floating, or duplicate runtime dependency issue was established.
- **Live-read verification:** The tool description, shipped agent prompts, and documentation consistently state that index hits are discovery hints and must be verified with `read_files`/`read_subtree` before editing (`common/src/tools/params/tool/query-index.ts:123-130`, `agents/general-agent/general-agent.ts:71`, `docs/agents-and-tools.md:498-503`). The architecture does not treat cached index content as edit authority.
- **CLI rendering:** The CLI renders lifecycle state, age, semantic state, walker coverage, and parse diagnostics (`cli/src/components/tools/query-index.tsx:85-160`). The presentation path is adequate for the status data it receives; the material gaps are upstream status/coverage omissions described above.

## Overall assessment

The subsystem has good safety defaults, broad language registration, conservative import resolution, useful retrieval modes, and strong live-read verification policy. Its main architectural constraint is that it still behaves like a periodically rebuilt JSON snapshot: invalidation is coarse, refresh work is repository-wide, lexical retrieval lacks an inverted index, graph identity is only partly qualified, and semantic cache/filter contracts are inconsistent. The highest-value next step is a versioned incremental index service with a durable change journal, per-file parse records, qualified graph identities, persisted postings/adjacency, and explicit coverage/error state.
