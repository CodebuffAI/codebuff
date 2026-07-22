# LESSONS — Read/Edit Authorization Unification

## M4.2 dead-tool removal lessons

- Removing a tool name from `toolNames`/`publishedTools` in `common/src/tools/constants.ts` triggers `satisfies` errors across every parallel registry: `list.ts`, `metadata.ts` (READ/MUTATION/NAMED_PATH sets + PATH_INPUTS), `input-aliases.ts`, runtime `handlers/list.ts`, and both generated `types/tools.ts` files (`agents/types/tools.ts` and `common/src/templates/initial-agents-dir/types/tools.ts`). Remove the name everywhere plus delete the dedicated param schema and handler in one transaction.
- Residual references hide where a grep surfaces them but typecheck pins precisely: `sdk/src/tool-execution-deadline.ts` (`FILE_MUTATION_TOOLS` set) and `common/src/tools/__tests__/tool-metadata.test.ts` (mutation-schema loop) both hard-listed `apply_smart_patch`.
- The AC4 legacy-format removal dropped `filesystemResultFormat` from `OpenbuffClientOptions`, so `cli/src/utils/codebuff-client.ts` had to stop passing it — an unrelated-looking CLI typecheck error that was actually part of the same unified-model cleanup.
- Gate/pruner string literals for `apply_smart_patch` in `agents/base2/gate-files.ts`, `base2.ts`, `editor.ts`, and `context-pruner.ts` are intentional backward-compat for classifying persisted tool-call history and must stay; they are asserted by context-pruner/base2 tests.
- `mintSliceCapability` is scope-gated (mints a token only when a handler passes `scope`), so `extractSlices` core tests asserting a `readCapability` had to be updated: the shared core returns tokenless slices and the `read_files`/`rewrite_symbol` handlers re-mint scoped caps.
- `agents/tool-reachability.test.ts` asserts the docs no longer contain `### apply_smart_patch` or the `read_slices` deprecated-alias section, so `docs/agents-and-tools.md` sections had to be removed to match the source-of-truth removal.

## Process lessons

- Never run `git stash` for inspection during an active edit session; it silently shelved all working changes. Recovered with `git stash pop`. Inspect committed baselines with `git show HEAD:path` instead.
- `edit_transaction` preflight is atomic and a multi-edit doc removal where an earlier edit shifts later line numbers invalidates the later `replace_range` hash. Apply shifting edits sequentially, or re-read/retry with the runtime-provided fresh `readCapability` (no extra read round-trip needed).
