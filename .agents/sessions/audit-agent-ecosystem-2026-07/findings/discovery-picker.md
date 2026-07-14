# Discovery / file-picker audit

## Flow inventory

- `file-picker` spawns one `file-lister`, parses newline-delimited paths, applies lexical containment, ranks by prompt tokens, caps at 12, reads the files, then gives the model one final synthesis step (`agents/file-explorer/file-picker.ts:298-378`).
- `file-lister` runs one graph search (`limit: 24`) and one tree read (`maxTokens: 500_000`), then asks the model to emit exactly paths (`agents/file-explorer/file-lister.ts:59-78`). Directory constraints affect only the tree read, not graph retrieval.
- `researcher-web` chooses the first URL in the prompt for direct fetch; otherwise heuristically decomposes numbered/questions/bulleted/comparison prompts, with three total search calls and one retry per failed subquery, then concatenates result prose and a global link list (`agents/researcher/researcher-web.ts:241-388`).
- `researcher-docs` is a prompt-only agent allowed one `read_docs` call and free-form final prose (`agents/researcher/researcher-docs.ts:17-26`).
- `browser-use` is a long-running structured-output browser operator with snapshot-first guidance and broad page/state/media tools (`agents/browser-use/browser-use.ts:50-158`, `200-266`).
- `librarian` validates a public GitHub URL, shallow-clones it into `/tmp`, then gives an LLM unrestricted shell exploration and returns answer/files/cloneDir for the parent to inspect and clean (`agents/librarian/librarian.ts:85-186`).

## [HIGH] Security / UX — agents/browser-use/browser-use.ts:152-158 — Browser agent has powerful external side effects without an action boundary

- **Risk:** The agent can submit forms, upload files, alter cookies/storage, and run page-context JavaScript, but its contract does not distinguish read-only inspection from consequential actions or require confirmation; a prompt-injected page can steer a browsing run into state-changing actions.
- **Fix:** Add an explicit `interactionPolicy` (`observe`, `safe-test`, `allow-side-effects`), default to observe/safe-test, prohibit credential/payment/account/message actions without parent authorization, and require the output to enumerate side effects.
- **Evidence:** `browser_logs`, `run_terminal_command`, upload, cookie, storage, and evaluate are all available while the workflow simply says “Execute the task step by step.”

## [HIGH] Security — agents/librarian/librarian.ts:168-186 — Untrusted cloned repositories are explored with a general shell

- **Risk:** Repository text is untrusted, yet the LLM receives `run_terminal_command`; prompt injection in README/source can induce commands beyond read-only inspection, including executing repository scripts or reading unrelated host paths.
- **Fix:** Replace general shell access with a jailed read-only `/tmp/<clone>` file/search tool, or enforce command/path allowlists and explicitly prohibit execution, network, symlink traversal, and reads outside `cloneDir`.
- **Evidence:** The added prompt recommends shell utilities but contains no enforceable command or filesystem boundary, and `yield 'STEP_ALL'` leaves subsequent commands model-directed.

## [MEDIUM] Correctness / UX — agents/file-explorer/file-lister.ts:59-75 — Directory-scoped discovery is only half scoped

- **Risk:** When callers specify directories, `query_index` still searches the entire repository, so its top 24 results can crowd out relevant in-scope files; the model then receives conflicting global graph results and scoped tree context.
- **Fix:** Pass directory/path filters into `query_index` (or filter its candidates) and expose whether discovery was repository-wide or scoped in the result.
- **Evidence:** `directories` is used only as `read_subtree.paths`; the index call accepts only `query` and `limit`.

## [MEDIUM] Performance / UX — agents/file-explorer/file-lister.ts:63-75 — Every lookup can request a 500k-token subtree

- **Risk:** A routine file pick can load an enormous repository tree after already querying the index, adding latency/cost and making relevance selection noisier; there is no progressive expansion or truncation feedback.
- **Fix:** Start with graph results and a bounded shallow tree, expand only relevant directories, and return truncation/coverage metadata to the picker.
- **Evidence:** The unconditional second tool call uses `maxTokens: 500_000`, including when no directory is specified.

## [MEDIUM] Correctness — agents/file-explorer/file-picker.ts:273-320 — Path validation is lexical and may both reject valid files and accept non-file prose

- **Risk:** Any string containing `..` is rejected (including legitimate names), while arbitrary newline text, directories, nonexistent paths, and decorated Markdown paths can pass and be sent to `read_files`; if every extracted path is dropped, the code still proceeds as a successful discovery.
- **Fix:** Require structured `{path, reason, score}` output from `file-lister`, normalize paths with a real path utility, validate existence/type through the file tool contract, and emit a distinct “no safe files” result.
- **Evidence:** `trimmed.includes('..')` is the traversal test; parsing is `fileListText.split('\n')`; success is based on extracted text before safety filtering.

## [MEDIUM] Correctness / UX — agents/researcher/researcher-web.ts:275-350 — Research budget silently leaves decomposed questions unanswered

- **Risk:** Up to five subquestions are produced, but only three total calls are allowed and retries consume the same global budget; later questions disappear entirely rather than being marked skipped, producing a report that looks comprehensive but is not.
- **Fix:** Make budget proportional/configurable, reserve at least one call per selected subquestion, prioritize explicitly, and include searched/skipped/failed coverage metadata in output.
- **Evidence:** `MAX_SUBQUERIES = 5` but `MAX_TOTAL_CALLS = 3`; the loop stops when total calls reaches three and only visited questions create sections.

## [MEDIUM] Correctness / UX — agents/researcher/researcher-web.ts:317-360 — Citations are not attached to claims

- **Risk:** Search-result prose is placed into sections while all links are deduplicated into one global list, so the parent/user cannot tell which source supports which claim or subquestion; link text is also trusted verbatim.
- **Fix:** Preserve per-result source IDs and URLs, render inline citations per section/claim, include publication date/domain, and distinguish quoted evidence from synthesis.
- **Evidence:** `sections` stores only `{question, result}` while links accumulate separately in `allLinks`, then render under one `Sources / Links` heading.

## [MEDIUM] Feature gap / API contract — agents/researcher/researcher-web.ts:300-304,370-387 — Search has no source, date, locale, depth, or pagination controls

- **Risk:** Users cannot request official-only evidence, recent sources, regional results, deeper research, or continuation; every query uses fixed `depth: 'standard'`, making quality and reproducibility opaque.
- **Fix:** Add structured params for recency/date range, allowed/blocked domains, locale, depth, max results/pages, and citation mode; report applied constraints and exhaustion/truncation.
- **Evidence:** The public schema exposes only `prompt`; all query calls hard-code standard depth.

## [MEDIUM] Error handling / API contract — agents/researcher/researcher-docs.ts:17-26 — Docs lookup is entirely model-driven and unstructured

- **Risk:** There is no deterministic handleSteps flow, library/version/topic input, empty/error contract, citations, or relevant-doc identifiers; “use once” prevents refinement after ambiguous or stale library resolution.
- **Fix:** Add explicit library/package/version/topic params, deterministic resolve-then-fetch behavior, one bounded fallback, and structured output containing answer, doc URLs/IDs, version, and unresolved ambiguities.
- **Evidence:** The definition only grants `read_docs` and relies on prompt instructions for a single call and prose response.

## [MEDIUM] State mutation / UX — agents/librarian/librarian.ts:127-186 — Temporary clones have no lifecycle ownership

- **Risk:** Cleanup is delegated to the parent via prose, so cancelled, failed, or forgotten runs leak clones in `/tmp`; there is no retention option, cleanup status, or automatic finalizer.
- **Fix:** Default to automatic cleanup after producing excerpts/artifacts, add `retainClone` explicitly, and have the runtime finalizer remove clones on errors/cancellation.
- **Evidence:** The spawner prompt tells the parent to `rm -rf`; the agent only returns `cloneDir` and never cleans it.

## [LOW] Error handling — agents/librarian/librarian.ts:149-168 — Missing/malformed clone results are treated as success

- **Risk:** If the tool result is absent, non-JSON, or lacks `exitCode`, execution continues to “Clone complete,” producing confusing downstream shell errors.
- **Fix:** Require a recognized result with `exitCode === 0` and verify the clone directory/repository before handing off.
- **Evidence:** Failure is handled only inside `if (result && result.type === 'json')`; all other shapes fall through.

## [LOW] Error handling / Security — agents/librarian/librarian.ts:155-163 — Raw git stderr is returned to the parent

- **Risk:** Clone failures may expose local paths, proxy details, credentials embedded by tooling, or noisy internals in user-visible output.
- **Fix:** Log redacted diagnostics and return a stable categorized error plus a short sanitized detail.
- **Evidence:** The output message directly concatenates `stderr`.

## [LOW] UX — agents/browser-use/browser-use.ts:210-210,248-257 — Visual smoke guidance over-tests by default

- **Risk:** Requiring screenshot, PDF, and recording for broadly worded visual/browser smoke tasks adds latency and artifacts even when a screenshot and console check would answer the question.
- **Fix:** Make evidence modes task-selectable and default to the minimum sufficient artifact; reserve PDF/recording for explicit requests or reproduction evidence.
- **Evidence:** Rule 5 says to explicitly exercise all three media actions when the task asks for visual/browser smoke coverage.

## [LOW] Dependency hygiene — agents/librarian/librarian.ts:64-70 — Agent prompts assume host CLI utilities

- **Risk:** `tree`, `grep`, `find`, and Git availability/behavior are environment-dependent, so runs can fail inconsistently across installations.
- **Fix:** Prefer runtime-owned filesystem/search primitives or probe capabilities and provide portable fallbacks.
- **Evidence:** The system prompt directs use of specific host commands without a capability contract.

## [LOW] Test coverage gaps — agents/browser-use/browser-use.test.ts:1-11 — Browser coverage is an opt-in smoke script, not contract/error-path tests

- **Risk:** Schema/prompt regressions, missing set_output, unsafe action-policy behavior, timeout/cancellation, and Chrome-unavailable handoff can ship without routine CI detection.
- **Fix:** Add cheap unit/contract tests for definition and structured output plus hermetic tool-sequence tests; retain opt-in live tests separately.
- **Evidence:** The file is environment-guarded and described as expensive trace generation; unlike picker/researcher tests it does not run as ordinary test coverage.

## [LOW] Test coverage gaps — agents/**tests**/file-picker.test.ts:421-529 — Ranking tests validate filename token overlap, not retrieval quality

- **Risk:** The picker can pass tests while missing semantically adjacent types/tests/configs, mishandling scoped queries, or reading zero safe paths.
- **Fix:** Add benchmark fixtures for graph adjacency, directory scope, nonexistent/decorated paths, all-paths-dropped, subtree truncation, and recall@12 against expected relevant sets.
- **Evidence:** Current tests focus on deterministic keyword ordering and the 12-path cap.

## 8-domain disposition

- Security: browser/librarian action boundaries and prompt-injection surfaces are material; URL and clone URL lexical guards are positive defense-in-depth.
- Correctness: scoped retrieval, path parsing, research-budget coverage, and malformed clone results need work.
- State mutation: temporary clone cleanup and browser side-effect ownership are unclear.
- Error handling: picker has an extraction error path, researcher records searched-subquery failures, but docs and malformed clone/browser environment paths are weak.
- Performance: 500k subtree reads, fixed research budgets, and mandatory media evidence are poorly adaptive.
- Dependency hygiene: librarian depends on host Git/shell utilities; no additional package-version issue was established in this shard.
- Test coverage: picker and web researcher have extensive generator tests; docs/browser/lifecycle and retrieval-quality evaluation remain thin.
- API/ABI contracts: free-form last-message outputs for picker/research agents lack coverage/citation/truncation metadata; browser is notably better with structured output.

## Compact inventory for paired code-searcher

- Inspect `query_index` contract for path filters, modes, truncation, `relatedFiles`, and pagination; compare with `file-lister.ts:63-67`.
- Inspect `read_subtree` behavior for empty paths and 500k token caps; compare with `file-lister.ts:70-75`.
- Inspect `read_files` behavior for `paths: []`, nonexistent paths, directories, Markdown-decorated paths, and absolute in-root paths; compare with `file-picker.ts:318-376`.
- Inspect `web_search` contract/backend for redirects, DNS/private-address checks, result/link provenance, domain/date filters, pagination, timeouts, and `max_links`; compare with `researcher-web.ts:241-387`.
- Inspect `read_docs`/Context7 contract for version selection, citations, ambiguity, token limits, and retries; compare with `researcher-docs.ts:19-25`.
- Inspect `browser_logs` authorization and URL/navigation policy, download/upload boundaries, evaluate sandbox, cancellation, and artifact cleanup; compare with `browser-use.ts:152-266`.
- Inspect terminal tool cwd/path enforcement and cancellation cleanup for `/tmp/librarian-*`; compare with `librarian.ts:127-186`.
