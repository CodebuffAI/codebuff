# Shard S8 — SDK tools surface + tests

**Scope audited:** `sdk/src/tools/**`, `sdk/src/__tests__/**`, `sdk/src/agents/**`, `sdk/src/skills/**`, `sdk/src/native/**`, `sdk/src/testing/**`, `sdk/src/types/**`, `sdk/src/index.ts`, plus adjacent common tool-schema files needed to compare public SDK tool contracts against runtime dispatch.

**Audit domains evaluated:**
1. Security — injection/auth/path traversal/secret leakage/input validation.
2. Correctness — runtime dispatch drift, wrong invariants, misused APIs.
3. State mutation — shared mutable state/cache invalidation/background jobs.
4. Error handling — swallowed errors/error shape drift/timeouts.
5. Performance — unbounded work/memory and serial hot paths.
6. Dependency hygiene — package/type export dependency surface.
7. Test coverage gaps — mocked critical paths and missing error-path coverage.
8. API/ABI contract breaks — exported signatures, tool schemas, runtime behavior.

## [HIGH] Security — sdk/src/tools/code-search.ts:45 — `cwd` symlink escape can search outside the project
- **Risk:** `code_search` rejects lexical `../outside` paths but does not resolve `cwd` through `realpath`, so a project-local symlink can make ripgrep run against files outside the project root and leak out-of-scope content.
- **Fix:** Mirror `findFilesMatchingContent` by resolving both `projectRoot` and `searchCwd` with `fs.realpathSync.native` before spawning ripgrep, and reject when the real cwd is outside the real project root.
- **Evidence:** `sdk/src/tools/code-search.ts:45-64` only checks `path.resolve(projectRoot, cwd)` with `startsWith(projectRoot + path.sep)`, while `sdk/src/tools/find-files-matching-content.ts:70-93` performs a realpath containment check and rejects symlink escapes.

```ts
// sdk/src/tools/code-search.ts
const projectRoot = path.resolve(projectPath)
const searchCwd = cwd ? path.resolve(projectRoot, cwd) : projectRoot
if (
  !searchCwd.startsWith(projectRoot + path.sep) &&
  searchCwd !== projectRoot
) {
  return resolve([{ type: 'json', value: { errorMessage: `Invalid cwd: Path '${cwd}' is outside the project directory.` } }])
}
```

## [HIGH] API/ABI contract breaks — common/src/tools/list.ts:133 — SDK advertises client tools that `handleToolCall` cannot execute
- **Risk:** SDK consumers see `ClientToolName`/`ClientToolCall` variants for `apply_smart_patch`, `ask_user`, and `query_index`, but SDK runtime dispatch validates those calls and then falls through to `Tool not implemented in SDK`, causing agents that use the published client schema to fail at runtime.
- **Fix:** Either implement SDK handlers/override pathways for every `clientToolCallSchema` member or remove unsupported SDK-local tools from the SDK-exposed client tool union and generated tool surface.
- **Evidence:** `common/src/tools/list.ts:133-217` includes `apply_smart_patch`, `ask_user`, and `query_index`; `sdk/src/run.ts:760-899` dispatches many tools but has no branch for those three, then throws the unimplemented-tool error at `sdk/src/run.ts:899-904`. A mechanical set diff produced `client-not-handled ['apply_smart_patch', 'ask_user', 'query_index']`.

```ts
// common/src/tools/list.ts
z.object({ toolName: z.literal('apply_smart_patch'), input: toolParams.apply_smart_patch.inputSchema }),
z.object({ toolName: z.literal('ask_user'), input: toolParams.ask_user.inputSchema }),
z.object({ toolName: z.literal('query_index'), input: toolParams.query_index.inputSchema }),

// sdk/src/run.ts
} else {
  throw new Error(
    `Tool not implemented in SDK. Please provide an override or modify your agent to not use this tool: ${toolName}`,
  )
}
```

## [MEDIUM] API/ABI contract breaks — sdk/src/tools/index.ts:13 — `ToolHelpers` does not mirror the SDK runtime tool surface
- **Risk:** `ToolHelpers` is the public helper namespace exported from `sdk/src/index.ts`, but it omits runtime-supported tools (`apply_patch`, `browser_logs`, `check_job`, `kill_job`, `read_image`, `read_logs`, `git_status`, `edit_transaction`, `end_turn`) and collapses `write_file`/`str_replace`/`create_plan` into one ambiguous `changeFile` helper, making downstream code depend on internal imports or guess at runtime behavior.
- **Fix:** Generate or test `ToolHelpers` against the runtime dispatch table and export either one helper per supported SDK tool name or an explicit documented subset with type-level tests that prevent accidental drift.
- **Evidence:** `sdk/src/index.ts:34` exports `ToolHelpers`; `sdk/src/tools/index.ts:13-23` exports only nine camelCase helpers, while `sdk/src/run.ts:777-899` handles a substantially larger tool-name set.

```ts
export const ToolHelpers = {
  runTerminalCommand,
  codeSearch,
  findFilesMatchingContent,
  glob,
  listDirectory,
  getFiles,
  replaceRange,
  runFileChangeHooks,
  changeFile,
}
```

## [MEDIUM] Test coverage gaps — sdk/src/__tests__/code-search.test.ts:19 — search-tool tests mock ripgrep instead of exercising the vendored binary/path boundary
- **Risk:** The highest-risk behavior for `code_search` and `find_files_matching_content` is the child-process boundary (vendored ripgrep path, real cwd containment, symlink behavior, flags as spawned args), but the tests replace `child_process.spawn` and feed synthetic JSON/stdout, so they cannot catch real `cwd` symlink escapes, missing binary packaging, or ripgrep output differences.
- **Fix:** Keep parser-unit tests, but add integration tests that create a real temp project, include a symlink-to-outside fixture, invoke the actual `codeSearch`/`findFilesMatchingContent` implementations with the vendored rg, and assert containment and output shape without mocking `spawn`.
- **Evidence:** `sdk/src/__tests__/code-search.test.ts:19-27` and `sdk/src/__tests__/find-files-matching-content.test.ts:40-49` install a mocked `child_process` module; `find-files-matching-content.test.ts:63-82` covers symlink escape for that tool, but there is no analogous realpath or symlink test for `codeSearch`.

```ts
await mockModule('child_process', () => ({
  spawn: mockSpawn,
}))
```

## [LOW] Test coverage gaps — sdk/src/__tests__/glob.test.ts:13 — glob tests stub away the project tree/filesystem boundary
- **Risk:** `glob` depends on `getProjectFileTree`, `flattenTree`, path normalization, and ignored-file traversal behavior, but the tests stub tree enumeration to a hand-written list, so regressions in the actual filesystem/tree walk will not be caught by the SDK test suite.
- **Fix:** Add at least one integration-style `glob` test that builds a temp directory with nested files, ignored files, and cwd edge cases, then calls `glob` with the real `getProjectFileTree` path.
- **Evidence:** `sdk/src/__tests__/glob.test.ts:13-18` replaces both `getProjectFileTree` and `flattenTree` with fixed values; assertions then only verify micromatch scoping over the synthetic path list.

```ts
spyOn(projectFileTree, 'getProjectFileTree').mockResolvedValue({} as any)
spyOn(projectFileTree, 'flattenTree').mockReturnValue(
  filePaths.map((filePath) => ({ type: 'file', filePath })) as any,
)
```

## Notes

- `cd sdk && bun run typecheck` completed successfully, so no immediate TypeScript export break was found by the package typecheck.
- No source files were modified; this file is the only artifact written for S8.
