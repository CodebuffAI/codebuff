## Plan: Refactor Logger to Pass as Parameter

### Step 1: Search for logger imports
- Use `code_search` with pattern `import \{ logger` (escape curly braces)
- Set `cwd: "backend"` to limit search scope
- Exclude websocket-action.ts files

### Step 2: For each file (except websocket-action.ts)
- Remove the `import { logger }` line
- Refactor function signature to use single `params` object containing all arguments including `logger: Logger`
- Import proper type: `import type { Logger } from '@codebuff/types/logger'`
  - Don't manually type as `{ debug: Function; ... }` - will fail typecheck
- Add destructuring at top of function body to extract params

### Step 3: Update all callers
- **Always run full `bun run typecheck`** (not head/tail!) to find ALL errors
- Update function calls to pass object with named properties
- For tests: create mock logger constant with all 5 methods (debug, info, warn, error, fatal)
- Use `allowMultiple: true` in str_replace when updating multiple calls in same file
- **Check carefully** - there may be multiple call sites in the same file!
- Repeat typecheck until ALL errors resolved

### Step 4: Commit changes
- **Do NOT use git-committer agent** - it's too slow
- Instead, manually run: `git add <files>` then `git commit -m "<message>"`
- Keep commit message concise but descriptive
- Include Codebuff footer in commit message
