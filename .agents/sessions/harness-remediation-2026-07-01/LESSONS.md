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

