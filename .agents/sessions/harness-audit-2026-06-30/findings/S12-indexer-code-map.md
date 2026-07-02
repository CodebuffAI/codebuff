# Shard S12 — indexer + code-map

**Scope:** `packages/indexer/**`, `packages/code-map/**`

**Audit Domains Covered:**
1. Security
2. Correctness
3. State mutation
4. Error handling
5. Performance
6. Dependency hygiene
7. Test coverage gaps
8. API/ABI contract breaks

---

## [HIGH] State mutation / Correctness — packages/indexer/src/index-manager.ts:101 — `markStale()` does not make the next `query()` refresh the index
- **Risk:** After a tool edits files and calls `markStale()`, direct `IndexManager.query()` calls can still return the old in-memory index, so `query_index`/search callers can be misled by stale symbols, imports, and package-script results until some separate caller invokes `waitUntilReady()` or a rebuild happens for another reason.
- **Fix:** Make `query()` honor `forceRefresh`/time staleness: either start an incremental build and return `ready:false` for stale data, or provide an async query path that awaits the refresh before scoring; update the comment contract accordingly.
- **Evidence:** `markStale()` only sets `this.forceRefresh = true` (`packages/indexer/src/index-manager.ts:101-109`). `waitUntilReady()` checks `!this.forceRefresh` before returning (`index-manager.ts:115-123`), but `query()` only calls `ensureBuilt()` when the index is not ready (`index-manager.ts:144-147`) and otherwise immediately scores `this.index` (`index-manager.ts:148-154`) without checking `forceRefresh` or `isIndexStale()`.

## [MEDIUM] State mutation / Correctness — packages/indexer/src/metadata-indexer.ts:159 — content mutations with unchanged mtime and size are never hashed
- **Risk:** The incremental updater advertises hash-based invalidation, but it only computes a hash after `mtime` or `size` changes; a same-size write with preserved/coarse timestamp leaves stale symbols, concepts, imports, and command snippets in the index indefinitely.
- **Fix:** For files in freshness-critical sets (source, `package.json`, CI/task-runner files), compute and compare hashes even when `mtime`/`size` are unchanged, or store an inode/change-time signal where available; add a regression test that mutates content while preserving `mtime` and size.
- **Evidence:** The updater enters the hash path only under `if (!indexed || indexed.mtime !== file.mtime || indexed.size !== file.size)` (`packages/indexer/src/metadata-indexer.ts:159-162`). If both metadata fields match, the file is never added to `changedFiles` and the old `IndexedFile` is reused (`metadata-indexer.ts:178-189`).

## [HIGH] Correctness / State mutation — packages/indexer/src/query.ts:140 — `mode: 'commands'` scores persisted command concepts without a command-file freshness check
- **Risk:** `mode: 'commands'` is used specifically to answer “what commands should I run?”, but it ranks cached `package.json`/CI/task-runner concepts; after scripts are added or changed, users can receive obsolete validation commands even though the query looks authoritative.
- **Fix:** Before command-mode scoring, stat/hash the small command-file set (`package.json`, CI workflows, Makefile/Justfile/turbo/nx/gulp/grunt, command docs) and trigger a targeted incremental update if any are stale; expose freshness in the result metadata, not only in explanation text.
- **Evidence:** Command intent is a scoring flag derived from `mode === 'commands'` (`packages/indexer/src/query.ts:137-155`). Command snippets come from `file.concepts` (`query.ts:754-770`), and command files are identified by path predicates (`query.ts:779-813`); none of this path reads or validates the current filesystem. The only age calculation is appended to explanations during search (`query.ts:215-224`), so it reports age after scoring rather than preventing stale command output.

## [HIGH] Error handling — packages/indexer/src/metadata-indexer.ts:119 / packages/code-map/src/parse.ts:252 — tree-sitter failures are swallowed into empty symbols/calls
- **Risk:** A missing WASM, bad query, parser crash, or read error silently degrades the graph: files remain indexed but lose symbols and call edges, making `query_index`, references, and structural navigation confidently incomplete with no actionable diagnostic.
- **Fix:** Return structured per-file parse diagnostics from code-map and persist an index-level `warnings`/`parseFailures` summary; log at least once per build outside `DEBUG_PARSING`, and make tests assert that parser failures are observable while still non-fatal.
- **Evidence:** Full-index parse failures are caught with `catch { /* code-map parse errors are non-fatal; proceed with empty symbols */ }` (`packages/indexer/src/metadata-indexer.ts:113-121`), and incremental parse failures are similarly `catch { // non-fatal }` (`metadata-indexer.ts:211-224`). Inside code-map, parser/query errors are caught and converted to `emptyParsedTokens(false)` unless `DEBUG_PARSING` is enabled (`packages/code-map/src/parse.ts:214-255`), and language-load errors return `undefined` unless debug logging is enabled (`packages/code-map/src/languages.ts:329-337`).

## [MEDIUM] Correctness / API contract — packages/indexer/src/metadata-indexer.ts:20 / packages/code-map/src/languages.ts:121 — indexer language set drifts from code-map language support
- **Risk:** PHP, Swift, Kotlin, and `.kts` files have tree-sitter grammars in code-map but are not treated as code by the indexer, so they get no symbol/call extraction; conversely `.mjs`/`.cjs` are treated as code by the indexer but have no code-map language config, causing silent no-op parsing.
- **Fix:** Export a single supported-extension table from code-map and consume it in the indexer, or add a parity test that fails whenever `CODE_EXTENSIONS` and `languageTable` diverge.
- **Evidence:** `CODE_EXTENSIONS` includes `.ts/.tsx/.js/.jsx/.mjs/.cjs/.py/.java/.cs/.cpp/.hpp/.rs/.rb/.go` only (`packages/indexer/src/metadata-indexer.ts:20-23`). `languageTable` additionally supports `.php`, `.swift`, `.kt`, and `.kts` (`packages/code-map/src/languages.ts:121-133`) but does not list `.mjs` or `.cjs` (`languages.ts:70-135`).

## [MEDIUM] Correctness / Language detection — packages/code-map/src/languages.ts:280 — file-walker lowercases extensions but code-map lookup is case-sensitive
- **Risk:** A file such as `Foo.TS` is accepted by the indexer as a code file because the walker lowercases its extension, but `getLanguageConfig()` receives the original path and fails to find a parser, so the file is indexed without symbols/calls.
- **Fix:** Normalize `path.extname(filePath).toLowerCase()` in `findLanguageConfigByExtension()` and add mixed-case extension tests that exercise the indexer + code-map path together.
- **Evidence:** The walker stores `ext = path.extname(entry.name).toLowerCase()` (`packages/indexer/src/file-walker.ts:76-82`), while code-map uses `const ext = path.extname(filePath)` without lowercasing (`packages/code-map/src/languages.ts:277-282`). The current language test explicitly asserts `findLanguageConfigByExtension('test.TS')` is `undefined` (`packages/code-map/__tests__/languages.test.ts:187-189`).

## [MEDIUM] Security / Dependency hygiene — packages/code-map/src/init-node.ts:21 — runtime downloads executable parser WASM from public CDNs without integrity verification
- **Risk:** In the missing-WASM path, the CLI downloads `tree-sitter.wasm` from unpkg/jsDelivr and accepts any non-empty file, creating a supply-chain and reproducibility risk for parser code that runs in the user’s process.
- **Fix:** Prefer failing with an installation/remediation message or ship the WASM with the binary; if self-healing remains, verify a pinned SHA-256/SRI hash before writing/using the downloaded file and make the behavior opt-in for locked-down environments.
- **Evidence:** `WASM_DOWNLOAD_URLS` points at `https://unpkg.com/...` and `https://cdn.jsdelivr.net/...` (`packages/code-map/src/init-node.ts:21-24`). `downloadWasmTo()` shells out to `curl` (`init-node.ts:70-84`) and accepts the result if `fs.statSync(targetPath).size > 0` (`init-node.ts:85-87`) with no checksum or signature validation.

## [LOW] API/ABI contract / State mutation — packages/code-map/src/languages.ts:144 — `setWasmDir()` cannot reliably affect languages already cached
- **Risk:** The public API suggests callers can change the WASM directory, but `LanguageConfig` objects cache `parser/query/language`; after the first load, subsequent `setWasmDir()` calls are silently ignored for that extension, surprising tests, embedders, and long-lived processes that switch environments.
- **Fix:** Document `setWasmDir()` as pre-initialization-only or invalidate cached parser/query/language fields when the directory changes; validate `setWasmDir()` inputs consistently with the env-var path validation.
- **Evidence:** `setWasmDir()` only mutates the module-level `customWasmDir` (`packages/code-map/src/languages.ts:144-155`). `createLanguageConfig()` loads from the runtime only inside `if (!cfg.parser)` (`languages.ts:296-315`), so once `cfg.parser` is set, later directory changes do not reload the language.

## [LOW] Performance — packages/indexer/src/metadata-indexer.ts:192 — every incremental code edit re-scores all code files
- **Risk:** Even when only one file changed, the updater passes every code file into `getFileTokenScores()` and rebuilds global token scores/callers, so large repositories can pay O(all code files) work after each agent edit; this can make freshness fixes expensive and encourage stale-index use.
- **Fix:** Persist per-file token score/call data alongside `ParsedFileTokens` and recompute global caller edges from cached summaries without walking/scoring every unchanged file, or batch refreshes after bursts of edits.
- **Evidence:** On any content change, `allCodeFilePaths` is built from every code file (`packages/indexer/src/metadata-indexer.ts:192-194`), unchanged files are only reused at the parsed-token layer (`metadata-indexer.ts:196-207`), and the full `allCodeFilePaths` list is passed to `getFileTokenScores()` (`metadata-indexer.ts:211-218`).

## [LOW] Test coverage gaps — packages/indexer/src/index-manager.test.ts:5 / packages/code-map/__tests__/languages.test.ts:187 — freshness and parser-failure regressions are not covered
- **Risk:** The most fragile behaviors in this shard—`markStale()` followed by `query()`, command-mode freshness after `package.json` mutation, observable tree-sitter failures, and extension-table parity—can regress without tests because current coverage mostly checks happy-path indexing and idempotent APIs.
- **Fix:** Add targeted tests for: `markStale()` causing the next query path to avoid stale results; command-mode results updating after script mutation; code-map parse failures surfacing diagnostics; indexer/code-map extension parity including `.php/.swift/.kt/.kts/.mjs/.cjs` and mixed-case extensions.
- **Evidence:** Existing metadata tests cover hash reuse and command concept extraction, but not same-mtime/same-size mutation or command freshness (`packages/indexer/src/metadata-indexer.test.ts:35-86`). The `markStale` test only checks that the method exists and is idempotent, not that query freshness changes (`packages/indexer/src/index-manager.test.ts:5-24`). The language test currently locks in case-sensitive `.TS` failure (`packages/code-map/__tests__/languages.test.ts:187-189`) rather than testing indexer/code-map consistency.

---

**No source edits performed.** This shard wrote only this findings file under `.agents/sessions/harness-audit-2026-06-30/findings/`.
