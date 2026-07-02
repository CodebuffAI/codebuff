# Harness Audit Remediation Lessons

Session: `.agents/sessions/harness-remediation-2026-07-01/`

## Planning lessons

- The audit report groups 121 unique issues, but the implementation plan should prioritize cross-cutting primitives rather than fixing every symptom independently.
- The highest-risk clusters are path containment, stale edit authorization, trusted gate state, cancellation propagation, and registry/API drift.
- Several findings share root causes across packages; implement shared helpers/tests before local patches where feasible.
- Existing dirty-tree work is substantial, so every implementation pass must re-read current files and avoid overwriting unrelated changes.

## Implementation gotchas to preserve

- Audit line numbers may be approximate; always verify with fresh `read_files`/`read_outline` before editing.
- Path containment fixes need realpath/symlink tests, not only lexical path tests.
- Cancellation tests should assert stopped side effects, subprocess termination, or aborted fetches, not merely rejected wrapper promises.
- Registry consistency should be generated or table-driven to prevent future drift.
- Docs should be updated only after implementation behavior is final, otherwise remediation can introduce fresh docs drift.

## Follow-up lesson log

Append new lessons here with `update_plan_status` as implementation proceeds.

<!-- update_plan_status:appended -->
## Local-CLI recalibration lesson — 2026-07-01 — 2026-07-01T05:44:09.309Z

The audit remains useful as a raw inventory, but remediation must be controlled by Openbuff's actual product model: local CLI/SDK, BYOK, no hosted backend/web/billing/auth. Security wording should be translated into local filesystem safety, local process safety, stale state/edit correctness, local tool contracts, and local secret redaction. Do not add blanket guards that block custom provider URLs, local model servers, MCP integrations, explicit user-configured paths, or compatibility aliases without a separate migration decision.


<!-- update_plan_status:appended -->
## M0 triage gotchas — 2026-07-01 — 2026-07-01T05:53:04.358Z

M0 should not verify/fix every source file. Its job is to create a controlling tracker and defer exact dirty-tree/source-range verification to owning milestones. Current dirty-tree overlap is substantial for deterministic edits and gate files, so M1/M3 must re-read exact ranges before editing and treat existing modifications as potentially intentional/partial fixes. Validation commands should use `cd <pkg> && bun run <script>` or workspace filters; avoid `bun --cwd <pkg> run <script>` because docs warn it can silently not execute the intended package script.


<!-- update_plan_status:appended -->
## M1 read_files gate lesson — 2026-07-01T06:18:50.160Z

For strict read-before-edit recovery, a requested read is not the same as a successful read. `read_files` should clear stale edit gates and grant `readAuthorizationsByPath` only for paths that were actually loaded and rendered. Range-only reads also need to be included in `requestFiles.filePaths`; otherwise tests/clients that build responses from `filePaths` cannot return content for range-only requests, and stale gates remain set unexpectedly.


<!-- update_plan_status:appended -->
## M1 write_file traversal lesson — 2026-07-01T06:22:11.557Z

`normalizeToolPath()` can return an empty string for traversal paths. File-changing handlers must check that result before initializing per-path promise state or touching disk/client callbacks; otherwise traversal attempts can create state under `promisesByPath['']` or proceed into request/apply paths. Regression tests should assert both the structured error and that no disk/client callback was invoked.


<!-- update_plan_status:appended -->
## M1 edit-safety validation lesson — 2026-07-01T06:34:32.783Z

For M1 edit-safety work, the focused regression command is `bun test packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts`. It covers read authorization gates, stale per-path edit state, range-only reads, write_file traversal short-circuiting, and strict read-before-edit behavior in one package-local suite.


<!-- update_plan_status:appended -->
## M1 symbol-only read gate lesson — 2026-07-01T06:41:47.353Z

Symbol-only `read_files` requests are real reads for edit-state purposes when `requestOptionalFile` returns content. Future read-gate changes must include whole-file, range-only, and symbol-only successful-load paths; otherwise strict read-before-edit and failed-edit recovery can regress for symbol slices.


<!-- update_plan_status:appended -->
## Agent-runtime validation command lesson — 2026-07-01T06:45:31.263Z

For package-local agent-runtime validation, use `cd packages/agent-runtime && bun run typecheck && bun run test`. In this environment, `bun --cwd packages/agent-runtime run ...` printed Bun usage/help instead of running the package scripts, so prefer changing directories explicitly for this package.


<!-- update_plan_status:appended -->
## M1 path-containment lessons — 2026-07-01 — 2026-07-01T23:34:11.427Z

Three reusable lessons from the M1 path-containment checkpoint:

1. **Where the containment helper can run is package-specific.** `sdk/src/tools/path-utils.ts` exports `resolveFilePathWithinProject`, but `packages/agent-runtime` can't cross-import from the SDK without breaking the package boundary. The runtime should either (a) inline a small `isPathInsideProject` helper that mirrors the SDK's lexical + realpath/symlink semantics, or (b) move the helper to `common/`. Option (a) is fine for one consumer; option (b) is the right move if a second runtime consumer appears.

2. **`read_files` AST-outline output format is `Line N: variable <name>`, not the raw `const x` text.** The first containment positive-case test asserted `toContain('const x')` and failed with the actual `'Line 1: variable x'`. Future regression tests for `read_outline` should assert on the `Line N: <kind> <name>` shape, not on the source text. This bit was caught by the focused test run before the typecheck gate.

3. **Containment error message must not leak filesystem layout to the model or user logs beyond the offending input.** The SDK cwd error includes only the original `cwd` string and the phrase "outside the project directory"; the full resolved absolute path is intentionally omitted. The runtime's read_outline path uses the legacy generic `'Error: File does not exist.'` to keep the tool-call contract stable. Future path/contract changes should preserve that property so the model can't be tricked into a different attack by inspecting containment error text.


<!-- update_plan_status:appended -->
## M1+M2 followup lessons — 2026-07-01 — 2026-07-01T23:52:37.266Z

Three reusable lessons from the M1+M2 followup batch:

**1. Tool-dispatch closure scope: signal must be plumbed through handleToolCall's param type, not assumed in scope.**
The SDK `runOnce` function has `signal` as a destructured param, but the tool-dispatch closure (`handleToolCall`) didn't. Adding `signal` to a tool call's args inside `handleToolCall` produced TS18004 "no value exists in scope for the shorthand property 'signal'". Fix: add `signal?: AbortSignal` to the `handleToolCall` param type and pass it through from the call site. Same pattern applies to any future state that needs to reach tool-dispatch.

**2. `controller.abort()` with no reason produces a DOMException, not an Error.**
The default `AbortSignal.reason` from `controller.abort()` is `new DOMException('The operation was aborted.')`. Code that does `if (reason instanceof Error) reject(reason); else { /* generic */ }` will fall through to the generic branch. Tests that expect a specific message must use `controller.abort(new Error('caller cancelled'))` or assert the DOMException message. Don't assume `signal.reason` is always an `Error`.

**3. Realpath-aware containment helpers reject the project root itself (empty relativePath is "not inside").**
Both `sdk/src/tools/path-utils.ts#resolveFilePathWithinProject` and `common/src/util/project-path-containment.ts#isPathInsideProject` return null when `path.relative(root, full) === ''` — the project root is not "inside" itself in their model. Callers that want to allow `cwd: '.'` (i.e., search the project root) must special-case the project root before delegating. The `code_search` containment upgrade needed this fast-path: `if (resolvedFull === projectRoot) return projectRoot` before calling the helper.

**4. test fixtures with synthetic non-existent roots (`/test/project`) need the realpath fallback to keep working.**
The SDK helper's `resolveRealPath` already walks up to the nearest existing ancestor, so it correctly returns `/test/project` for a synthetic root. This means existing tests that used `/test/project` continued to pass after the helper swap — the lexical `path.resolve` is the source of truth, and the realpath step is a *symlink-containment* check, not a *path-existence* check. Confirmed by the symlink regression tests passing on real tmpDirs.


<!-- update_plan_status:appended -->
## Reviewer follow-up notes (NON_BLOCKING) — 2026-07-01 — 2026-07-01T23:55:34.624Z

Four NON_BLOCKING findings from the M1+M2 reviewer pass. One was fixed in-place (JSDoc vs code mismatch in `codeSearch` signal). The other three are logged here for the next pass:

**A. `realpathOrLexical` in `common/src/util/project-path-containment.ts` near-duplicates `resolveRealPath` in `sdk/src/tools/path-utils.ts`.**
The JSDoc already says "Mirrors the behavior of the SDK `resolveRealPath` helper so the two stay in lock-step." A future divergence is a real risk. Two follow-up options:
  (a) Move the SDK helper into `common/` and have the SDK re-export it.
  (b) Add a comment in the SDK helper that points to the common/ version, and add a one-line cross-test that asserts both produce the same result for a battery of inputs.
Not blocking — this is the package-boundary trade-off the file's own JSDoc calls out.

**B. `run-terminal-command.ts` abort path is correct but a future regression risk.**
`onAbort` reads `processFinished` and `timer` from outer scope, and those `let` bindings are declared *after* the `onAbort` closure. It works because the closure runs only after the spawn (and the listener is registered after the `let`s in normal flow), but if a future refactor registers the abort listener earlier or moves the `let`s, it'll TDZ-crash. Fix: move the `let timer: ... = null` and `let processFinished = false` declarations above the `if (signal)` block to make the data flow obvious. Not blocking.

**C. `read_outline` containment uses `process.cwd()` as project root.**
This is the pre-existing pattern from the M1 batch and the runtime doesn't have a project-root context here, but it's a latent footgun if the runtime's `process.cwd()` ever differs from the actual project root (e.g. a tool that `chdir`s mid-run). Follow-up: thread the projectRoot through `requestOptionalFile`'s context, or derive it from the agent session at handler entry. Not blocking.

**D. (FIXED in this pass) `codeSearch` abort JSDoc said "rejects" but the code actually resolves with an `{ errorMessage }` value.**
Fixed: the JSDoc now states that the function "resolves with an `{ errorMessage }` result (the same shape used for every other code_search error, so the agent's tool-result-handling pipeline doesn't need a special case)." This matches the implementation and the existing test that asserts on the resolved value. `runTerminalCommand` continues to *reject* on abort, which is the correct contract for that tool (it has a meaningful error path the caller can distinguish).


<!-- update_plan_status:appended -->
## Reviewer-fix batch lessons — 2026-07-02 — 2026-07-02T00:11:52.532Z

Five reusable lessons from the M1+M2 reviewer-fix batch:

**1. `toEqual` is too strict for evolving return types — use `toMatchObject` when adding optional fields.**
When the common/ helper added a `realFullPath` field to its return shape, the SDK test's `toEqual({fullPath, relativePath})` started failing because the actual object had an extra field. Switching to `toMatchObject` accepts extra fields and matches the "subset" semantics callers actually want. Use `toEqual` only when the exact shape matters (e.g. cached-function args or hash inputs); for handler results and helper return values, prefer `toMatchObject` so additive field changes don't cascade into test updates.

**2. Lexical `startsWith('..')` over-rejects file names starting with two dots.**
The original `..config` test case (file name: `..config`) failed after the common/ helper's lexical check tightened. The naive `relativePath.startsWith('..')` rejects `..config` even though it lives inside the project. The correct check is `relativePath === '..' || relativePath.startsWith('..' + path.sep)` — the separator is what disambiguates "escaping the root" from "file name with two leading dots". Any future realpath-aware containment helper should anchor on the separator to avoid this class of false positive.

**3. Hoist `let` bindings before any closure or listener that reads them.**
`onAbort` in `run-terminal-command.ts` reads `processFinished` and `timer`. The original layout had those `let` declarations *after* the `if (signal) { ... }` block that registers the abort listener. The TDZ doesn't fire in the common path because the listener fires after the spawn, but a future refactor that moved the listener earlier would crash with `ReferenceError: Cannot access 'timer' before initialization`. Rule of thumb: declare every binding any closure in the function reads *before* that closure. `let` hoisting is purely lexical, not temporal.

**4. The runtime handler params type already carries `fileContext: ProjectFileContext` — use it for project-root-aware checks.**
`packages/agent-runtime/src/tools/handlers/handler-function-type.ts` exposes `fileContext` as a required param, and `ProjectFileContextSchema` includes a `projectRoot: z.string()` field. `process.cwd()` is the wrong source for any containment check inside a runtime handler because the runtime can be invoked from a different working directory than the project root (background workers, test harnesses, parent-repo launchers). Always anchor containment to `fileContext.projectRoot` and the agent session context in general. Test fixtures need to pass `fileContext: { projectRoot: '<synthetic root>' }` for handlers that gate on it.

**5. The SDK's public API surface is wider than the implementation file's exports — preserve the names callers see.**
The SDK had `resolveFilePathWithinProject`, `ResolvedProjectPath`, and `getProjectPathLookupKeys` as public names, with `resolveRealPath` as a private helper. When consolidating into common/, the right move was to *re-export* under the SDK's existing names (`resolveProjectPath as resolveFilePathWithinProject`, `ContainedProjectPath as ResolvedProjectPath`) rather than rename callers. The SDK is a published package; renaming public exports would break downstream consumers. A thin re-export file preserves the public API while consolidating the implementation.


<!-- update_plan_status:appended -->
## Final-pass reviewer follow-up notes (NON_BLOCKING) — 2026-07-02 — 2026-07-02T00:14:05.677Z

Five NON_BLOCKING findings from the final reviewer pass on the reviewer-fix batch. All are pure optimizations or documentation tidy-ups; none are behavioral fixes. Queued for the next pass.

**A. `isPathInsideProject` could short-circuit the realpath step when the lexical check alone is conclusive.**
`isPathInsideProject` is the hot path for every `read_files.path` and `read_outline.path` call. The current implementation always builds a full `ContainedProjectPath` (including two `realpathSync` calls and a string split) even when the caller only wants a boolean. Consider a fast-path that skips the second realpath when the lexical check already passed and the input is clean (absolute and inside the root lexically, no symlink in the call chain). Not blocking — current shape is correct, just slower than necessary on the hot path. The boolean wrapper currently does the same work as `resolveProjectPath` and discards the metadata.

**B. `relativeLexical.split(path.sep).includes('..')` check is redundant.**
The preceding `relativeLexical === '..' || relativeLexical.startsWith('..' + path.sep)` already catches every escape path. `path.relative` collapses `..` segments during normalization, so the segment-includes check never fires. Safe to delete. Not blocking.

**C. `run-terminal-command.ts` already-aborted short-circuit leaks the child handle.**
The `if (signal.aborted) { onAbort(); return }` branch never attaches `close`/`error` listeners to `childProcess`, so any bytes the child writes to stdout/stderr before SIGTERM takes effect are silently dropped. Add `childProcess.stdout?.destroy()` + child handle close for tidiness. Future cleanup. Not blocking — abort contract is correct, this is just about not leaking the child handle's output buffer.

**D. `codeSearch` resolves with `errorMessage` on abort while `runTerminalCommand` rejects — worth a one-line comment explaining the asymmetry.**
Both contracts are correct, but the asymmetry is subtle: `codeSearch` returns an `{output: [...]}` result that feeds into the same pipeline as every other code_search error, so resolve-with-errorMessage is the right call. `run_terminal_command` can fail at the *spawn* level (process didn't start, abort happened before spawn), where rejection is the natural signal. Add a one-line comment in `codeSearch` JSDoc explaining the asymmetry so future readers don't try to "fix" the inconsistency. Pure documentation.

**E. `read-outline.ts` uses an inline `import('@codebuff/common/util/file').ProjectFileContext` type.**
The rest of the file uses top-of-file `import type` declarations. Recommend moving to a top-of-file import for consistency. Not blocking — works correctly.


<!-- update_plan_status:appended -->
## M2 find-files cancellation lessons — 2026-07-02 — 2026-07-02T07:05:57.893Z

Two reusable lessons from adding `AbortSignal` support to `find_files_matching_content`:

**1. Settle abort results before killing mocked child processes.**
The child-process mock used in SDK tests emits `close` synchronously from `kill('SIGTERM')`. If an abort handler kills first and settles afterward, the normal close handler can preempt the abort result and make tests flaky or behavior race-prone. Fix: call the shared `settle(...)` helper with the abort-shaped `{ errorMessage }` result before `childProcess.kill('SIGTERM')`, relying on the settle guard to ignore the subsequent close event.

**2. Separate foreground tool cancellation from user-managed long-lived jobs.**
`find_files_matching_content` and `code_search` are foreground ripgrep tools, so SDK run cancellation should stop their child process. `background-jobs` and browser Chrome helpers intentionally manage long-lived/user-controlled processes and should not be pulled into the same default abort behavior without an explicit contract change. Keep M2 scoped by process ownership.


<!-- update_plan_status:appended -->
## M2 git_status cancellation lessons — 2026-07-02 — 2026-07-02T07:10:25.642Z

Two reusable lessons from adding `AbortSignal` support to `git_status`:

**1. Keep shared git helpers backwards-compatible when adding cancellation.**
`runGit` is shared by `gitStatus` and `gitBranch`. Adding `signal?: AbortSignal` as an optional third parameter let SDK dispatch pass cancellation to `git_status` without forcing `gitBranch` to adopt a cancellation contract in the same batch.

**2. Abort semantics should match the surrounding tool-result shape.**
`git_status` reports failures as a JSON tool result with `errorMessage`, so abort also resolves to that shape instead of throwing. This keeps agent tool-result handling consistent with git command failures and mirrors the foreground search tools' resolve-with-error behavior.


<!-- update_plan_status:appended -->
## M2 git_status reviewer blocker lesson — 2026-07-02 — 2026-07-02T07:14:35.982Z

When adding cancellation to child-process helpers, preserve both async child `'error'` handling and synchronous `spawn(...)` throw handling. Tests often mock `spawn` directly, and platform/runtime failures can occur before a child exists. Tool helpers that normally return structured `{ errorMessage }` results should convert synchronous spawn failures into their existing result shape rather than letting a rejected promise leak through dispatch.


<!-- update_plan_status:appended -->
## M2 cancellation lesson — preserve existing child-process error contracts — 2026-07-02T07:26:12.137Z

When adding cancellation or spawn-failure hardening to an existing child-process helper, search for existing `child.on('error')` handlers before adding a new one. `findFilesMatchingContent` already had an actionable ripgrep-specific async error message (`Failed to execute ripgrep... CODEBUFF_RG_PATH`); adding a generic earlier handler made that path unreachable and regressed diagnostics. Preserve one intended error path and make regression tests assert the full intended contract, not just the raw underlying error text.


<!-- update_plan_status:appended -->
## M2 retry-sleep cancellation lesson — 2026-07-02 — 2026-07-02T07:32:52.167Z

When making retry loops abortable, the pre-retry `signal.aborted` check is not enough: an unabortable `setTimeout` backoff can still keep local work alive until the full delay elapses. Put the abort handling in the delay primitive itself (`waitForBackoffDelay`) and test both already-aborted and mid-delay abort paths. Keeping the helper in `retry-config.ts` made the regression cheap and avoided a slow end-to-end LLM stream test.


<!-- update_plan_status:appended -->
## M2 abort-listener race lesson — 2026-07-02 — 2026-07-02T07:38:39.726Z

Abortable delay helpers need a second `signal.aborted` check after registering the abort listener. Checking before timer creation and then adding the listener leaves a race where the signal can abort between those operations and the promise waits the full delay. The safe pattern is: pre-check, create timer, add abort listener, post-check, and route both abort paths through the same cleanup/reject function. Unit tests can simulate the race by aborting from a temporary `setTimeout` wrapper during delay setup.


<!-- update_plan_status:appended -->
## M2 model-discovery cancellation — 2026-07-02T07:44:12.010Z

For injectable SDK network helpers, the safest cancellation surface is often minimal signal forwarding (`RequestInit.signal`) plus tests that assert the injected fetch receives the exact signal and propagates abort errors. Avoid adding local abort wrappers unless the helper owns a non-fetch wait/process lifecycle.


<!-- update_plan_status:appended -->
## CLI send ownership guard — 2026-07-02T07:55:07.879Z

When abort releases the CLI chain lock immediately, a newer send can start before the older `client.run()` resolves. Any late checkpoint/save/finally path must check both a per-run owner token and the per-run `AbortSignal`; shared stream refs can be reset by the newer run and are not a reliable stale-owner discriminator.


<!-- update_plan_status:appended -->
## Queue ownership coverage — 2026-07-02T08:22:08.873Z

For stale-owner queue fixes, primitive owner-token tests are not enough. Add coverage against the real extracted lifecycle path used by the hook (`runQueuedMessage` here), and capture stale timer callbacks before a newer run clears the timer map so the stale watchdog branch actually executes after the newer owner is active.


<!-- update_plan_status:appended -->
## Eval timeout cancellation seam — 2026-07-02T08:34:19.857Z

For eval harness timeout cleanup, test the timeout-to-runner seam itself, not only direct `AbortSignal` consumers. Wrapping runner/final-check work in an exported helper like `runWithTimeoutSignal` makes it possible to prove that the timeout aborts the exact signal passed to runner-like work. Also normalize synchronous setup failures with `Promise.resolve().then(...)` before `withTimeout` so sync throws and async rejections share the same promise-based wrapper semantics.


<!-- update_plan_status:appended -->
## Eval external runner abort testing — 2026-07-02T08:44:54.071Z

For external CLI runner abort coverage, make fake spawned CLIs signal readiness before aborting so tests deterministically exercise an in-flight process. To prove abort skips normal close cleanup, dirty a tracked marker after the initial commit; if close cleanup runs `git add .`, the marker becomes staged and the test catches it. Abort classifiers should key on structured abort properties (`AbortError`/`ABORT_ERR`) rather than message substrings to avoid startup-failure false positives.


<!-- update_plan_status:appended -->
## Residual M2 cancellation signal contract lesson — 2026-07-02T08:59:04.545Z

When closing cancellation surfaces, check both process-level tools and callback contracts. A pre-dispatch `signal.aborted` check is not enough for long-running client/custom tool work: the in-flight callback must receive the same `AbortSignal` so hosts and SDK custom tools can observe cancellation. Keep new cancellation context arguments optional to preserve existing one-argument handlers and add focused tests at both boundaries: runtime request dispatch and SDK handler execution.


<!-- update_plan_status:appended -->
## M2 MCP cancellation coverage — 2026-07-02T09:09:01.444Z

When claiming custom/MCP client-tool cancellation coverage, verify both halves separately: runtime `requestToolCall` signal forwarding and SDK `handleToolCall` execution branches. SDK MCP execution uses `callMCPTool(..., undefined, { signal })`, relying on the MCP SDK `RequestOptions.signal` third argument; tests should cover the `action.mcpConfig` branch directly, not only SDK custom-tool handlers or runtime request forwarding.


<!-- update_plan_status:appended -->
## M2 background-job timeout contract coverage — 2026-07-02T09:28:56.677Z

For `check_job` timeout coverage, exercise the public schema contract: `timeout_seconds` is integer-only. Avoid fractional timeout shortcuts in tests. To keep tests fast, temporarily override `Date.now` so the second follow-loop observes the deadline as elapsed, and always restore the original clock in `finally`.

M2 cancellation contract distinction: run-scoped SDK/runtime/eval/custom/MCP work should receive `AbortSignal`; background jobs are intentionally durable and remain running unless explicitly killed or a `check_job` follow-timeout with `kill_on_timeout` enabled applies.


<!-- update_plan_status:appended -->
## M3 markStale freshness — 2026-07-02T09:33:40.687Z

When `markStale()` is a freshness barrier, query paths must not keep serving an already-loaded ready index while `forceRefresh` is pending. Regression coverage should build a real temporary index, call `markStale()`, assert `query()` returns `ready: false` with no results, then wait for refresh and assert queries become ready again.


<!-- update_plan_status:appended -->
## M3 stale refresh pending barrier — 2026-07-02T09:43:54.245Z

Do not clear a freshness barrier before replacement data is installed. For index refreshes, `forceRefresh` can be consumed to start work, but a separate pending flag must keep `query()`/`waitUntilReady()` from serving the old ready index until the build promise settles. Tests should assert repeated queries during the pending window, not just the first query after `markStale()`.


<!-- update_plan_status:appended -->
## M3 command-mode freshness — 2026-07-02T09:47:12.409Z

Command-mode freshness should be tested through the `IndexManager` path, not only pure `queryIndex()` fixtures: build a real temp `package.json`, update scripts, call `markStale()`, assert command queries return `ready: false` while stale, then assert refreshed snippets contain the new script and exclude removed scripts.


<!-- update_plan_status:appended -->
## M3 same-size same-mtime hashing — 2026-07-02T09:50:15.142Z

Incremental index freshness cannot rely on `(mtime,size)` alone: editors/build steps can preserve both while changing content. `updateMetadataIndex()` should compare stored content hashes against current file hashes before reusing existing indexed entries. Regression tests should force same-size content and restore mtime at filesystem precision, then assert the hash changes.


<!-- update_plan_status:appended -->
## M3 same-size same-mtime coverage — 2026-07-02T09:51:56.950Z

Hash-change tests must also prove behavioral freshness. For metadata indexes, assert reindexed fields change with the new same-size/same-mtime content (for example Markdown headings/concepts removed/added), otherwise a bug could update only the stored hash while retaining stale metadata.


<!-- update_plan_status:appended -->
## M3 metadata hash-read failures — 2026-07-02T13:08:05.184Z

When incremental indexing starts hashing every walked file to catch same-size/same-mtime edits, hash/read failures must be treated as a freshness input, not as a fatal error. Exclude failed paths from token scoring and delete their stale metadata after the walk so unreadable code files cannot poison token refresh for other changed files.


<!-- update_plan_status:appended -->
## M3 extension tables and public exports — 2026-07-02T13:19:22.625Z

When unifying language/extension tables across packages, expose immutable/copy-safe data. A mutable exported `Set` can be changed by any consumer and silently alter indexer behavior; prefer a frozen readonly array as the public contract and build private Sets inside consumers that need membership checks. Normalize extension lookup and user-facing filters by lowercase/dot prefix at the boundary.


<!-- update_plan_status:appended -->
## Provider config fragment cache invalidation — 2026-07-02T13:31:16.804Z

Provider-config cache keys must include every effective dependency, not just top-level config files. For `openbuff.d` expansion, track implicit/explicit fragment directories and discovered fragment files so added or changed fragments invalidate `loadProviderConfigSync()`.

When recursive config loading uses a per-call stack for cycle detection, always remove stack entries in `finally` in both the dependency-discovery path and the actual loader path. Malformed repeated fragments should surface parse errors without poisoning subsequent traversal or being misclassified as cycles.


<!-- update_plan_status:appended -->
## Recovered background job offsets — 2026-07-02T13:47:15.908Z

Recoverable background jobs need their consumed-output cursor persisted alongside status metadata. If recovery rebuilds a job with `readOffset: 0`, `check_job` can replay historical output already returned before registry/session loss.

Persist byte offsets after successful reads, clamp recovered offsets to the current log size, and treat missing or invalid JSON-compatible values (`null`, negative, non-number) as `0` for backward compatibility. Tests should assert the recovered job shape (`jobId`, `status`, and `newOutput`) so error results cannot accidentally satisfy offset assertions.


<!-- update_plan_status:appended -->
## Gate/reviewer reuse freshness — 2026-07-02T13:52:02.959Z

Do not trust conversation `<gate-state>` reuse on matching pending file names alone. Reuse must be tied to the same content/status/validation fingerprint used by durable pass reuse; otherwise a later local content change at the same path can bypass validation/review. Regression coverage should include both unchanged-content reuse and changed-content rerun paths.


<!-- update_plan_status:appended -->
## Static-review-only reviewer join lesson — 2026-07-02T14:01:07.490Z

When joining a background reviewer, do not use a `wait_for` string for only one passing token such as `LOOKS_GOOD`. The reviewer contract accepts `LOOKS_GOOD`, `NON_BLOCKING`, and `BLOCKING`, and the gate needs the complete reviewer result so the shared parser can distinguish passing verdicts from actionable blockers. Waiting for only one token can timeout on valid `NON_BLOCKING` output and delay `BLOCKING` feedback until timeout.


<!-- update_plan_status:appended -->
## M4 scoping lesson — distinguish canonical registry from executable surfaces — 2026-07-02T14:04:18.716Z

For M4 tool/schema/config work, separate the canonical registry from each executable surface. `common/src/tools/constants.ts` and `common/src/tools/list.ts` define names and schemas, but SDK `handleToolCall`, SDK `ToolHelpers`, agent-runtime handlers, generated agent types, CLI renderers, and agent `toolNames` each have different intended subsets. Consistency tests should encode those subset contracts explicitly instead of assuming every canonical tool must be executable in every environment. Also prefer AST/imported maps over substring checks; `scripts/check-tool-registration.ts` can pass on incidental mentions.


<!-- update_plan_status:appended -->
## M4 hasNoValidation serialized handleSteps fallback — 2026-07-02T14:08:59.458Z

`createBase2(..., { hasNoValidation: true })` can safely drive runtime gate behavior through the captured option in normal execution, but `handleSteps.toString()` serialization loses factory closure variables. Keep a fallback for serialized/generated handleSteps that preserves legacy built-in fast ids (`base2-fast`, `base2-fast-no-validation`) so the existing serialization regression remains valid while custom in-process wrappers honor the public option.


<!-- update_plan_status:appended -->
## Config merge checkpoint — 2026-07-02T15:21:58.760Z

For config merge preservation changes, keep focused validation tied to the affected gate files. The latest configured hooks passed for SDK, agents, and indexer typechecks after the `failoverModels` / `maxAgentSteps` preservation checkpoint, so future resumes should not revisit this checkpoint unless source changes again.


<!-- update_plan_status:appended -->
## Reviewer Loop Resolution — 2026-07-02T16:02:36.985Z

When a reviewer blocker references source that has already changed, verify the current lines before retrying the gate. In this checkpoint, the stale static-review-only `LOOKS_GOOD` wait blocker was resolved in source by waiting for the background reviewer result and parsing all accepted verdicts; the successful reviewer pass cleared the loop.


<!-- update_plan_status:appended -->
## Generated tool type drift — 2026-07-02T16:09:43.268Z

Generated agent-facing tool type files can drift from canonical tool params even when `toolParams` and `toolNames` stay consistent. Registry consistency checks should inspect generated declaration text for user-visible defaults/descriptions, especially for docs-visible parameters like `read_docs.max_tokens`.


<!-- update_plan_status:appended -->
## SDK tool override surface — 2026-07-02T16:14:36.893Z

For SDK tool dispatch, distinguish two registries:
- `clientToolNames` is the subset the SDK can validate and dispatch natively.
- `publishedTools`/`PublishedToolName` is the public override surface hosts may implement.

Do not validate non-client published tools with `clientToolCallSchema`; doing so prevents `overrideTools` from filling public-but-nonnative SDK gaps such as `read_docs`. Instead, allow an override first, and emit the explicit SDK unsupported-tool error when no override exists.


<!-- update_plan_status:appended -->
## M4 generated tool declarations — 2026-07-02T16:27:38.512Z

Generated agent tool declaration consistency is now covered by the common registry test. Keep `internalOnlyTools` in `common/src/tools/__tests__/tool-registration-consistency.test.ts` explicit and narrow so future public tool additions fail fast if generated agent type surfaces are not regenerated.


<!-- update_plan_status:appended -->
## Broader validation gotcha — 2026-07-02T16:33:33.121Z

Broader validation can pass all workspace typechecks and most package suites while still failing in a focused package. The current remaining failure is isolated to `packages/agent-runtime` structural read tests: `read_outline` now assumes `fileContext.projectRoot`, so tests/handlers that call it without fileContext will throw before returning graceful errors.


<!-- update_plan_status:appended -->
## read_outline direct handler tests — 2026-07-02T16:37:18.295Z

When testing handlers directly, include required runtime context fields instead of casting away newer contracts. `handleReadOutline` depends on `fileContext.projectRoot` for path containment, so focused tests should pass `mockFileContext` or an explicit `ProjectFileContext` whenever invoking the handler outside the tool executor.


<!-- update_plan_status:appended -->
## Set Output Prompt Availability Gotcha — 2026-07-02T16:49:08.846Z

When an agent uses `outputMode: 'structured_output'` but intentionally omits `set_output` from `toolNames`, avoid model-visible prompt text that says to call or not call `set_output`. Programmatic `handleSteps` may still yield `set_output`, but prompts should describe automatic structured-output capture instead. Guard this with focused reachability/prompt-alignment tests rather than broad generated-file scans.


<!-- update_plan_status:appended -->
## M4 env compatibility docs gotcha — 2026-07-02T16:58:09.117Z

When documenting Openbuff-vs-Codebuff env compatibility, do not phrase `CODEBUFF_API_KEY` as the only retained env exception. Source currently also implements `OPENBUFF_CHATGPT_OAUTH_TOKEN` as an alias with legacy-first precedence, and accepts `NEXT_PUBLIC_OPENBUFF_APP_URL` as an optional schema field even though current app URL accessors still require `NEXT_PUBLIC_CODEBUFF_APP_URL`. Keep docs explicit about primary accessor vs schema-only alias to avoid overstating migration completeness.


<!-- update_plan_status:appended -->
## M5 runtime cache-debug snapshot redaction — 2026-07-02T17:22:44.637Z

Runtime cache-debug has a second snapshot writer separate from the common provider-request normalizer. When adding redaction to `common/src/util/cache-debug.ts`, also check `packages/agent-runtime/src/util/cache-debug.ts` because it stores `rawBody` and `normalized` into on-disk debug snapshots after receiving the common-normalized request. Keep data URL summaries and tool-call `arguments` passthrough intact while redacting prompt `content` strings and secret-like header/env keys.


<!-- update_plan_status:appended -->
## Provider discovery auth configurability — 2026-07-02T18:25:45.749Z

Model discovery credential behavior is now explicit rather than blanket-blocked: `auto` preserves same-origin/inferred provider discovery auth while suppressing auth on explicit cross-origin catalog endpoints; users can choose `provider` for trusted cross-origin catalogs or `none` to suppress auth entirely. Tests should assert headers through a mutable object rather than a `let string | null` that TypeScript narrows too aggressively across async callbacks.


<!-- update_plan_status:appended -->
## M5 MCP cache hygiene regression gate — 2026-07-02T18:29:09.960Z

For the M5 MCP cache hygiene follow-up, targeted validation is sufficient when source inspection shows the implementation is already present: common MCP tests cover remote header identity hashing without raw secret exposure, stdio env identity without resolved env leakage, SSE headers, and duplicate header casing normalization; common and agent-runtime cache-debug tests cover prompt/secret redaction and data-URL summarization. Preserve these focused tests as the regression gate for future MCP cache-key or cache-debug sanitizer edits.


<!-- update_plan_status:appended -->
## M6 streamed XML parser error surfacing — 2026-07-02T18:38:40.410Z

When bounding streamed XML tool-call buffers, keep the parser tolerant but observable: return structured parser errors from the low-level parser, clear the unterminated state after the limit trips, and let `processStreamWithTools` emit print-mode errors so malformed tool-call XML is visible to users/tests instead of disappearing into `console.debug`. Focused regression tests should cover both parser-level state reset and stream-level error emission.


<!-- update_plan_status:appended -->
## M6 malformed STEP_TEXT tool calls — 2026-07-02T18:45:23.076Z

For programmatic `STEP_TEXT` XML tool parsing, avoid silently dropping malformed `<codebuff_tool_call>` blocks. Keep the convenience API (`parseToolCallsFromText`) filtered to valid calls, but preserve diagnostics in the richer segment API (`parseTextWithToolCalls`) so callers like `run-programmatic-step` can surface an error event without executing invalid input.


<!-- update_plan_status:appended -->
## M6 parse diagnostics lesson — 2026-07-02T18:55:36.693Z

For code-map/indexer diagnostics, keep parse failures non-fatal and expose them as structured metadata (`filePath`, `stage`, `message`) rather than logging or swallowing them entirely. When adding a type-only import inside an existing `import type { ... }`, do not use nested `type Foo`; TypeScript rejects mixed type modifiers in type-only import declarations.


<!-- update_plan_status:appended -->
## M6 format-value error formatting — 2026-07-02T19:12:48.312Z

For error-message formatting helpers, assume `JSON.stringify` can throw (circular refs, BigInt, exotic objects). Keep formatting best-effort and bounded so validation/error reporting never masks the original tool/schema failure. Tests should cover at least circular object, BigInt, primitive type labels, and truncation of fallback strings.


<!-- update_plan_status:appended -->
## Model Discovery Timeout Composition — 2026-07-02T19:17:27.813Z

For SDK model discovery, compose caller cancellation with a local timeout using a child `AbortController` rather than replacing the caller signal outright. Keep `timeoutMs: 0` as the escape hatch for tests/legacy exact-signal forwarding, and on fetch rejection prefer the composed signal's `reason` when aborted so timeout errors remain clear instead of surfacing generic abort exceptions.


<!-- update_plan_status:appended -->
## InitCommand Shell Semantics — 2026-07-02T19:23:35.985Z

For BuffBench `initCommand`, make the contract explicit instead of pretending a string can be safely parsed into argv. Existing eval data authors already provide shell-like commands; using `execSync` with README wording as a trusted shell command preserves quoted args, redirection, and compound setup semantics. Keep arbitrary eval `initCommand` values scoped to trusted eval definitions only.


<!-- update_plan_status:appended -->
## BuffBench per-agent error summarization — 2026-07-02T19:29:48.465Z

For BuffBench aggregation, do not exclude all agents on a commit just because one agent failed. Store the failed agent's own run with `error` and compute valid averages from runs where that same agent has no error. This preserves sibling agents' valid scores and makes per-agent reliability visible.


<!-- update_plan_status:appended -->
## M7 wording audit classification — 2026-07-02T19:35:21.192Z

For M7 wording cleanup, broad hosted-product searches produce many intentional hits: local/BYOK assertions, legacy/upstream docs, provider-owned subscription wording, test fixtures, generated bundles, and session artifacts. Prefer first fixing active comments/prompts that can mislead agents or users, then rely on `scripts/byok-wording-guard.ts` plus targeted exact-phrase searches rather than deleting compatibility aliases or provider-owned billing/subscription language.


<!-- update_plan_status:appended -->
## M8 repeated spawn_agents counting — 2026-07-02T19:39:08.676Z

For M8 minimum-shard checks, do not collapse requested agent types to distinct values before applying pair-count rules. A `spawn_agents` request with repeated `file-picker`/`code-searcher` entries is the sharding decision even if the trace ends before `subagent_start` events stream, so keep both `requestedAgentTypes` (duplicates) and `distinctAgentTypes` (display/summary).


<!-- update_plan_status:appended -->
## M8 planner-output coverage live gate — 2026-07-02T19:56:46.276Z

Planner-output coverage must be applied in the live runner, not just exposed as a pure helper. Otherwise tests can prove `buildPlannerOutputCoverage` works while `run-plan-sharding-eval` still passes runs whose prompt names domains but planner output never synthesizes them. Keep summary artifacts explicit (`plannerOutputCoverage`) so CI/report consumers can distinguish shard assignment from synthesis coverage.


<!-- update_plan_status:appended -->
## M8 eval validation closure — 2026-07-02T19:58:01.006Z

For M8 plan-sharding eval changes, run both targeted eval coverage and configured package typechecks before closing the checkpoint: `cd evals && bun test buffbench/__tests__/plan-sharding-signals.test.ts && bun run typecheck`, then file-change hooks for touched packages. The configured hooks can cover broader packages than the focused eval command, so record both results separately.


<!-- update_plan_status:appended -->
## M8 judge spec parity — 2026-07-02T20:01:34.738Z

M8 judge parity is not just prompt-token plumbing: the generated eval task `spec` is the durable acceptance target and must be included in judge prompts alongside the user prompt and ground-truth diff. Regression tests can mock `OpenbuffClient.run` and assert both parallel judge prompts include the spec without running real judges.


<!-- update_plan_status:appended -->
## M8 Eval Helper Registry Smoke Coverage — 2026-07-02T20:07:49.330Z

When BuffBench eval-generation uses graveyard exploration agents, their transitive spawnable helper agents are not automatically present unless `generateEvalTask` registers them in the `agentDefinitions` bundle. Smoke-test the registry by stubbing `OpenbuffClient.run` and asserting the helper ids are passed through; this catches silent runtime failures before an LLM tries to spawn `file-picker` or `code-searcher` during task generation. Targeted validation command: `cd evals && bun test buffbench/__tests__/run-buffbench.test.ts && bun run typecheck`.


<!-- update_plan_status:appended -->
## M9 checkpoint decision — 2026-07-02T20:41:42.275Z

After M7/M8 reconciliation, the next incomplete durable checkpoint is M9 final local-model closure, not another feature-fix batch. M9 should focus on evidence and closure artifacts: classify remaining LOW/deferred findings as fixed, downgraded, discarded, deferred, or accepted debt; run native drift/registry guards before broad validation; and produce a final closure report. Avoid reopening completed M1-M8 implementation surfaces unless a guard, validation command, or reviewer points to a concrete regression.


<!-- update_plan_status:appended -->
## M9 final closure lessons — 2026-07-02T20:58:08.012Z

M9 closure should not reopen implementation surfaces when the remaining work is evidence reconciliation. Use the final closure report plus tracker reconciliation to map stale tracker `todo` rows to fixed/downgraded/discarded/deferred/accepted-debt outcomes, and only edit source if a guard or validation failure exposes a concrete regression.

The memory-drift guard can fail because package knowledge files are stale after source changes. Treat that as a closure invariant: refresh the relevant knowledge files, add/keep regression coverage for staleness detection, then rerun all drift guards before writing final closure artifacts.

For final closure artifacts, record accepted debt explicitly rather than silently leaving tracker rows stale. Important accepted/deferred categories are broad deterministic-edit hardening beyond fixed cases, large-file ordinal edit anchor enforcement, gate-path absolute hardening, BYOK cost-accounting namespace cleanup, CDN parser WASM dependency hygiene, eval token-metadata log hygiene, standalone substring-based `check-tool-registration`, and low-priority CLI/runtime/perf/dependency/test/API cleanup rows.


<!-- update_plan_status:appended -->
## M9 memory-drift staleness coverage gotcha — 2026-07-02T21:02:24.313Z

When `checkStaleness` relies on git commit timestamps, cover both no-git and git-repo-but-untracked cases. An untracked `knowledge.md` with committed sibling `src/` has no reliable commit timestamp, so the correct guard behavior is to skip rather than report stale; otherwise local remediation before first commit can be blocked by false positives.

