# Discovery / research — code-search findings

## [CRITICAL] security / API contract — `web_search` direct fetch has no backend SSRF or redirect boundary

- **Risk:** Any agent allowed `web_search` can fetch loopback, RFC1918, link-local/cloud-metadata, or redirect from a public URL to an internal address. `researcher-web` performs only a lexical first-URL check, so redirects and other direct callers bypass its defense.
- **Fix:** Enforce egress policy in the tool handler: resolve DNS, reject private/reserved addresses before every connection, revalidate every redirect hop, disable credential forwarding, cap response size while streaming, and add IPv4/IPv6/encoded-host/rebinding tests.
- **Evidence:** The public tool accepts any valid URL (`common/src/tools/params/tool/web-search.ts:17-23`). The handler calls `fetch(fetchUrl)` with default redirect behavior and no hostname/IP validation (`packages/agent-runtime/src/tools/handlers/tool/web-search.ts:67-105`). The agent-side comment explicitly delegates DNS rebinding to the backend (`agents/researcher/researcher-web.ts:34-39`), but the backend has no such guard.

## [HIGH] correctness / state mutation / UX — all browser agents share one process-global Chrome session

- **Risk:** Parallel browser-use runs share active tab, cookies, storage, logs, recording state, and navigation; one run’s `stop`, tab switch, or storage clear can corrupt another run and misattribute screenshots/results.
- **Fix:** Key browser sessions by client/run/agent ID and pass that identity through `browser_logs`; isolate user-data directories and cleanup per owner. Reject or serialize legacy unkeyed concurrent use.
- **Evidence:** `sdk/src/tools/browser-logs.ts:80` declares one module-global `browserSession`; `ensureBrowserSession` returns it to every caller (`:495-497`), and `stopBrowser` clears/kills that same singleton (`:611-629`). `BrowserSession` contains shared active target, logs, networks, and recording (`:48-59`). Existing browser tests cover schemas/helpers, not concurrent ownership (`sdk/src/__tests__/browser-logs.test.ts:17-180`).

## [HIGH] security / UX — browser-use has state-changing actions without an interaction policy

- **Risk:** A browsing task or prompt-injected page can submit forms, upload local files, change cookies/storage, execute page JavaScript, or interact with accounts without a read-only boundary or side-effect disclosure.
- **Fix:** Add `interactionPolicy: observe | safe-test | allow-side-effects`, default to `observe`; require parent/user authorization for authentication, messaging, purchase/payment, account changes, uploads, and destructive form submissions; report every side effect in structured output.
- **Evidence:** The agent exposes browser actions plus general terminal access (`agents/browser-use/browser-use.ts:152-158`) and explicitly permits click/type/upload/cookie/storage/evaluate (`:178-198,246-257`). Its input schema only has a URL (`:32-47`) and output has no side-effect ledger (`:50-148`).

## [HIGH] security / state mutation — librarian explores untrusted clones with an unrestricted shell and no enforceable cwd

- **Risk:** Prompt injection in README/source can induce execution of repository scripts or reads/writes outside the clone, including host/project data. Prompt rules are advisory, while `STEP_ALL` leaves commands model-directed.
- **Fix:** Provide read-only clone-scoped list/search/read tools; otherwise enforce an OS sandbox, fixed cwd, command allowlist, no network/exec, symlink containment, and read-only filesystem policy.
- **Evidence:** Librarian grants `run_terminal_command` (`agents/librarian/librarian.ts:58`) and instructs the model to use arbitrary shell utilities on untrusted content (`:60-83,170-186`). Only the initial clone URL/command is hardened (`:98-147`); subsequent exploration has no handler-enforced clone boundary.

## [MEDIUM] correctness / UX — directory-scoped file listing cannot scope graph retrieval

- **Risk:** For a narrow directory request, global top-24 index hits can crowd out in-scope files and conflict with the scoped tree, lowering recall and making results non-reproducible.
- **Fix:** Add `pathPrefixes`/exclude filters to `query_index`, or filter/overfetch results inside file-lister; return scope and truncation metadata.
- **Evidence:** `file-lister` applies `directories` only to `read_subtree` while `query_index` receives only query/limit (`agents/file-explorer/file-lister.ts:59-75`). The `query_index` schema supports file types and graph modes but no path/directory filter or pagination cursor (`common/src/tools/params/tool/query-index.ts:10-56`).

## [MEDIUM] performance / UX — file-lister overrides the subtree tool’s normal budget by 50×

- **Risk:** Every lookup can request a 500k-token whole-repository tree even after index retrieval, increasing scan/truncation work, latency, and irrelevant context.
- **Fix:** Start with index results and a <=10k shallow/scoped tree; expand selected directories progressively and expose truncation/recovery in the file-lister output.
- **Evidence:** `file-lister` unconditionally calls `read_subtree` with `maxTokens: 500_000` and empty paths mean project root (`agents/file-explorer/file-lister.ts:70-75`; handler `packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:322-345`). The tool contract says normal use should not exceed 10,000 (`common/src/tools/params/tool/read-subtree.ts:45-49`) and separately caps live scans at 1,000 nodes (`read-subtree.ts:24,171-199`).

## [MEDIUM] correctness / error handling — file-picker treats unstructured prose as paths and can issue an empty read

- **Risk:** Markdown bullets, explanations, directories, nonexistent names, and all-filtered results pass the initial “has results” check; after safety filtering the picker can call `read_files` with `paths: []`, yielding a tool validation failure rather than a clear discovery outcome.
- **Fix:** Make file-lister structured (`{path, reason, score}`), validate file existence/type before ranking, strip only documented legacy decoration, and return a distinct `no_safe_files`/partial-coverage result.
- **Evidence:** Spawn output is split on newlines with every nonempty line accepted (`agents/file-explorer/file-picker.ts:240-271`); safety is lexical and rejects any name containing `..` (`:273-320`); the filtered/capped array is passed directly to `read_files` (`:340-378`). `read_files` requires at least one selector (`common/src/tools/params/tool/read-files.ts:120`).

## [MEDIUM] correctness / UX — researcher-web silently omits budget-exhausted questions

- **Risk:** A decomposed five-part request may search only one or two questions when retries consume the three-call budget; later questions receive no section or “skipped” marker, so the report appears complete when it is not.
- **Fix:** Budget per selected question, prioritize explicitly, make depth/call budget configurable, and emit searched/failed/skipped coverage metadata.
- **Evidence:** Decomposition returns up to five questions but broad research permits only three total calls, including retries (`agents/researcher/researcher-web.ts:120-190,275-350`). Only loop-visited questions are added to `sections`; unvisited questions vanish (`:283-350`).

## [MEDIUM] correctness / API contract — web reports lose claim-to-source provenance and research controls

- **Risk:** The parent cannot tell which URL supports a section/claim, request official-only or recent sources, choose locale, paginate, or reproduce a search. Search results are embedded as JSON prose while fetched-page links are unrelated navigation links.
- **Fix:** Return structured results per subquestion with source IDs, title, URL, snippet/date/domain and inline citations; add allowed/blocked domains, recency/date, locale, result count/cursor, and depth params.
- **Evidence:** Researcher sections store only `{question, result}` and all links are merged globally (`agents/researcher/researcher-web.ts:278-280,317-360`). The public web tool offers query/url/depth and fetch-link controls only (`common/src/tools/params/tool/web-search.ts:9-48`); search handler serializes title/url/description records into one string (`packages/agent-runtime/src/tools/handlers/tool/web-search.ts:175-187`).

## [MEDIUM] error handling / API contract — researcher-docs cannot disambiguate version, source, or failure

- **Risk:** The one-call model-driven agent may choose the wrong library/version and cannot refine. Tool failures are returned in the same `documentation` string as successful docs, with no URL/library ID/version/citation contract.
- **Fix:** Add deterministic library resolution, explicit version/topic/token params, one ambiguity retry, and structured `{status, libraryId, version, documentation, sources}` output.
- **Evidence:** Agent input is prompt-only and mandates exactly one `read_docs` call plus prose (`agents/researcher/researcher-docs.ts:10-26`). The tool accepts library title/topic/tokens but no version and outputs only `documentation` (`common/src/tools/params/tool/read-docs.ts:9-32,75-84`). Handler encodes errors inside `documentation` (`packages/agent-runtime/src/tools/handlers/tool/read-docs.ts:76-84,107-131`).

## [MEDIUM] state mutation / UX — librarian clone cleanup has no runtime owner

- **Risk:** Success, failure after cloning, cancellation, or a forgotten parent cleanup leaks `/tmp/librarian-*` trees indefinitely; the output cannot state retained/cleaned status.
- **Fix:** Auto-clean in a runtime finalizer, default to excerpts rather than persistent clones, and add explicit `retainClone` with expiry/cleanup status.
- **Evidence:** Clone paths are timestamped under `/tmp` (`agents/librarian/librarian.ts:127-145`); the agent only returns `cloneDir`, while the spawner prompt tells the parent to run `rm -rf` later (`:13-14,34-55`). No cleanup occurs in `handleSteps` (`:85-186`).

## [LOW] error handling — malformed librarian clone results fall through as success

- **Risk:** Missing/non-JSON results or JSON without a numeric exit code lead to “Clone complete” and later confusing shell failures.
- **Fix:** Require a recognized result with `exitCode === 0`, verify `.git`/directory existence, and return a typed failure otherwise.
- **Evidence:** Clone failure handling exists only inside `if (result && result.type === 'json')`; all other shapes continue at `agents/librarian/librarian.ts:149-168`.

## [LOW] performance / UX — browser smoke mandates screenshot, PDF, and recording by default

- **Risk:** Routine visual checks create unnecessary latency and media artifacts, especially under the 30-minute browser-agent timeout.
- **Fix:** Add selectable evidence modes and default to the minimum sufficient artifact; use PDF/recording only when explicitly requested or needed for reproduction.
- **Evidence:** Browser rules require all three for visual/browser smoke (`agents/browser-use/browser-use.ts:200-210,248-253`).

## Rejected or narrowed candidates

- **Rejected:** `read_subtree` itself lacks path containment. The handler rejects absolute/outside-root paths, skips symlinks, and avoids leaking outside-path existence (`packages/agent-runtime/src/tools/handlers/tool/read-subtree.ts:142-159,176-196,286-310`). The problem is file-lister scope/budget, not subtree path security.
- **Rejected:** `read_files` blindly reads unsafe/nonexistent paths. Its handler validates every selector as a batch and returns structured per-item errors (`packages/agent-runtime/src/tools/handlers/tool/read-files.ts:47-94`). The picker issue is its unstructured handoff and empty-selector UX.
- **Narrowed:** Researcher-web has meaningful lexical SSRF protection for the first URL (`agents/researcher/researcher-web.ts:34-100,241-268`), so the critical SSRF finding is specifically the shared backend and redirects, not absence of all defense.
- **Narrowed:** Initial librarian clone command injection is already mitigated by a strict GitHub regex and shell quoting (`agents/librarian/librarian.ts:98-147`); risk begins after cloning, when untrusted repository content drives unrestricted shell exploration.

## Coverage across all 8 domains

- **Security:** backend web SSRF, browser action authority, and librarian shell isolation verified; positive path/URL guards noted.
- **Correctness:** directory-scoped retrieval, picker handoff, browser session ownership, research coverage/provenance, docs ambiguity, and clone result parsing covered.
- **State mutation:** singleton browser state and clone lifecycle are material gaps.
- **Error handling:** read tools are structured; docs/librarian and skipped research questions are weak.
- **Performance:** 500k subtree request and mandatory browser media verified; no index algorithm hotspot proven.
- **Dependency hygiene:** librarian assumes Git plus host shell utilities; no vulnerable package version established.
- **Test coverage:** missing concurrent browser-session, backend SSRF/redirect, scoped query-index, empty-safe-picker, docs version/error, and clone cancellation/cleanup tests. Browser/librarian live tests are opt-in rather than routine contracts.
- **API/ABI contracts:** query_index lacks path filters/cursor; research outputs lack coverage/citation/version metadata; browser_logs lacks session ownership; librarian output lacks cleanup state.
