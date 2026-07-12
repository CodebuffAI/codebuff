# Pattern: Run targeted tests

## When to use

You need to validate a change without running the full test suite — e.g.
after editing one package, or before a reviewer gate.

## Steps

1. **Identify the package** — Openbuff is a monorepo with per-package
   `package.json` scripts. Common packages:
   - `common/` — shared types, constants, utils
   - `packages/agent-runtime/` — agent runtime + tool handlers
   - `cli/` — the Openbuff CLI
   - `sdk/` — the SDK / provider layer
   - `scripts/` — dev scripts + drift guards

2. **Typecheck the package** (run from repo root):

   ```bash
   bun --cwd=common run typecheck
   bun --cwd=packages/agent-runtime run typecheck
   bun --cwd=cli run typecheck
   bun --cwd=scripts run typecheck
   ```

3. **Run a single test file**:

   ```bash
   bun test common/src/util/__tests__/plan-artifacts.test.ts
   bun test packages/agent-runtime/src/tools/handlers/tool/__tests__/update-plan-status.test.ts
   bun test cli/src/commands/__tests__/plan-timeline.test.ts
   ```

4. **Run a directory of tests**:

   ```bash
   bun --cwd=cli test src/commands
   bun --cwd=common test
   ```

5. **Run multiple targeted files in one invocation** (faster than separate
   runs — Bun pays the startup cost once):

   ```bash
   bun test \
     scripts/__tests__/memory-drift-guard.test.ts \
     common/src/util/__tests__/plan-artifacts.test.ts \
     common/src/util/__tests__/router.test.ts
   ```

6. **Drift guards** — the BYOK wording guard and memory-drift guard are
   run via package scripts:
   ```bash
   bun run --cwd=scripts guard:byok-wording
   bun run --cwd=scripts guard:memory-drift
   ```
   The memory-drift guard is expected to exit `1` against the real repo
   (real drift exists); check `STATUS.md` for the documented exceptions.

## Conventions

- Use `--cwd=<package>` to run a package script without `cd`.
- Always typecheck the packages you touched, not just the repo root —
  project references can mask type errors in `tsc --noEmit` at the root.
- Prefer running the smallest test set that covers your change first;
  expand to the full package suite only if the targeted set passes.

## Risks

- `bun test` with no path runs the **entire** repo test suite — slow and
  noisy. Always pass a path for targeted runs.
- The scripts package has many standalone `.ts` files in one TypeScript
  program; a standalone script with no imports/exports needs `export {}`
  near the shebang to be treated as a module (otherwise it collides with
  other global scripts and the typecheck fails).
