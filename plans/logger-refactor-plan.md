## Plan: Refactor Logger to Pass as Parameter**IMPORTANT: This is a LIVE document that MUST be updated as you work!**

As you complete each step and encounter unintuitive cases or learn new patterns:

1. **UPDATE THIS DOCUMENT IMMEDIATELY** - Don't wait until the end
2. **Add learnings directly into the relevant step sections** - Do NOT create a dedicated "Findings" or "Learnings" section
3. **Update existing instructions inline** - Integrate new knowledge into the step descriptions themselves
4. **Split complex steps** - Feel free to break one step into multiple sub-steps (e.g., 1, [2], 3, 4 -> 1, [2, 3], 4, 5) if needed
5. Document any edge cases or special handling required within the relevant step

**This plan serves as documentation for future engineers - keep it accurate and up-to-date!**

### Step 1: Search for logger imports

- Use `code_search` with pattern `import \{ logger` (escape curly braces)
- Set `cwd: "backend"` to limit search scope
- Exclude websocket-action.ts files

### Step 2: Select a file (except websocket-action.ts and library-integrated functions)

**Exception**: Do NOT refactor functions that are directly integrated with external libraries and must maintain a specific signature required by that library. Examples include:

- Express route handlers passed directly as middleware (e.g., `usageHandler`, `isRepoCoveredHandler`) - must maintain `(req, res, next?)` signature
- WebSocket handlers that conform to a specific library interface
- Event handlers or callbacks that match a library's expected signature
- Any function where changing the signature would break the integration with an external library

These functions should continue to import and use the logger directly, as they cannot accept custom parameter objects without breaking their integration.

For all other files:

- Remove the `import { logger }` line
- Refactor function signature to use single `params` object containing all arguments including `logger: Logger`
- Import proper type: `import type { Logger } from '@codebuff/types/logger'`
  - Don't manually type as `{ debug: Function; ... }` - will fail typecheck
- Add destructuring at top of function body to extract params

### Step 3: Update all callers

- **Always run full `bun run typecheck`** (not head/tail!) to find ALL errors
- Update function calls to pass object with named properties
- **For tests:** Create a no-op logger constant named `logger` (NOT `mockLogger`!) with all 4 methods:
  ```typescript
  const logger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
  ```
- **Check carefully** - there may be multiple call sites in the same file!
- Repeat typecheck until ALL errors resolved

### Step 4: Run reviewer agent

- After all typechecks pass, spawn the reviewer agent to review the changes
- Address any feedback from the reviewer before committing
- If you make _any_ changes, go back to Step 3.

### Step 5: Commit changes

- **Do NOT use git-committer agent** - it's too slow
- Instead, manually run: `git add <files> && git commit -m "<message>" && git push`
  - This will push to a branch, where I can manually review the changes.
- Keep commit message concise but descriptive
- Include Codebuff footer in commit message

### Step 6: Go back to Step 1 and repeat
