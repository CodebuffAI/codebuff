# LESSONS

## What went well
- `git diff -- cli/src/index.tsx` immediately after editing made it easy to enforce exact scope for a one-line change.
- Validating with `bun run cli/src/index.tsx --help` gave a quick, non-effectful end-to-end check that startup output works.

## What was tricky
- Bun script invocation shape from repo root was easy to misremember: `bun --cwd cli run typecheck` failed, while `bun run --cwd cli typecheck` succeeded.

## Useful patterns
- Entrypoint logs placed at the top of `main()` apply to all command paths that enter `main()`; verify with a non-interactive path first.
- For tiny requests, combine: (1) minimal code edit, (2) scoped diff check, (3) one runtime smoke check, (4) one typecheck.

## Future efficiency notes
- Put exact validation commands directly in `PLAN.md` to avoid command-syntax backtracking during validation.
