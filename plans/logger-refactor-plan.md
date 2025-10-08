## Plan: Refactor Logger to Pass as Parameter

This is a live document. You should update it with any unintutive cases you find while running through the steps below. Do _not_ add items in a dedicated section, but just update the sections themselves. Feel free to split one step into multiple steps if it is too long/complicated.

### Step 1: Search for logger imports

- Use `code_search` with pattern `import \{ logger` (escape curly braces)
- Set `cwd: "backend"` to limit search scope
- Exclude websocket-action.ts files

### Step 2: For each file (except websocket-action.ts and library-integrated functions)

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
- For tests: create mock logger constant called `logger` with all 4 methods (debug, info, warn, error)
- Use `allowMultiple: true` in str_replace when updating multiple calls in same file
- **Check carefully** - there may be multiple call sites in the same file!
- Repeat typecheck until ALL errors resolved

### Step 4: Commit changes

- **Do NOT use git-committer agent** - it's too slow
- Instead, manually run: `git add <files> && git commit -m "<message>" && git push`
  - This will push to a branch, where I can manually review the changes.
- Keep commit message concise but descriptive
- Include Codebuff footer in commit message
