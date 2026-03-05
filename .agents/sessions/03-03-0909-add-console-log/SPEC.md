# SPEC

## Overview
Add a single startup `console.log` to the CLI entrypoint so there is explicit stdout output when the CLI boots.

## Requirements
1. Modify `cli/src/index.tsx` only for functional code changes.
2. Add exactly one `console.log(...)` statement.
3. Place the log at the start of `main()`.
4. Use a static message string (no timestamp or dynamic args). Chosen message: `Codebuff CLI starting`.
5. The log should print for any execution path that enters `main()` (including normal startup and command modes like `login`/`publish`).
6. Keep all existing behavior unchanged aside from the added stdout line.

## Technical Approach
Insert one `console.log('Codebuff CLI starting')` call as the first statement inside `main()` so it prints once per process run before the rest of startup flow proceeds.

## Files to Create/Modify
- `cli/src/index.tsx` (modify)
- `.agents/sessions/03-03-0909-add-console-log/SPEC.md` (this spec)

## Out of Scope
- Replacing existing logger usage with `console.log`
- Adding additional logs
- Refactoring startup flow or command handling
- Any server/web/API changes
