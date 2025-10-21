Move the file (provided by the user) from `backend/src/some/path.ts` to `packages/agent-runtime/src/some/path.ts`
If there is a test file, it will most likely be at `backend/src/some/__tests__/path.test.ts` If that file exists, move it to `packages/agent-runtime/src/some/__tests__/path.test.ts` If it does not exist, the test may or may not exist, do not worry for now.

Most likely, there will be import errors:

- Repeatedly run `bun run typecheck` in the project root and fix the typecheck errors.
- Any reference from `backend/` to `packages/agent-runtime/` should be imported as `@codebuff/agent-runtime/some/path`
- Any reference from `packages/agent-runtime/` to another file in `agent-runtime` should be imported relatively (e.g. `../some/path`)
  - The file moved to `packages/agent-runtime` should never reference a file in `backend/`. If it does, this was an error and you should ask the user what to do and disregard the rest of this file.
- Also, search for the regex in `packages/agent-runtime/`: `@codebuff/agent-runtime`. You should find nothing in any _code_ files. If you find something, replace it with the relative path.
  - It does appear in `package.json`, but ignore that file.

Run `bun test $(find . -name '*.test.ts')` twice: in `backend/` and `packages/agent-runtime/`
If they do not pass, do NOT fix the tests (unless it is an import error, which should have been fixed in the step before. You can fix the imports, but do not change the test logic). Ask the user what to do and disregard the rest of this file.

If the tests pass, git add the changed files, then commit the changes. No need to use any subagent to commit, you have all the context you need.

Always listen to the user's feedback and make changes accordingly.
