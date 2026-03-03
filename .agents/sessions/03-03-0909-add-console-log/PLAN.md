# PLAN

## Implementation Steps
1. Update `cli/src/index.tsx` by adding `console.log('Codebuff CLI starting')` as the first statement in `main()`.
2. Inspect the diff to confirm scope: exactly one new `console.log` line in `cli/src/index.tsx` and no unintended edits.
3. Run lightweight validation for CLI startup behavior:
   - Run a non-interactive path (`--help`) and confirm the line appears once.
   - Confirm the log sits before command branching in `main()` so it applies to all `main()` paths.

## Dependencies / Ordering
- Step 1 must happen before Step 2 and Step 3.
- Step 2 should complete before Step 3 to ensure we validate the intended change only.

## Risk Areas
- Low risk overall.
- Minor UX risk: the new stdout line appears for all command paths entering `main()` (including `--help`, `login`, and `publish`). This is intentional per spec.
