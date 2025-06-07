# Plan: Move `common/src/db` to `packages/internal`

This plan outlines the steps to move the database-related code from the `common` package to the `packages/internal` package. This will prevent the DB code from being included in client-side bundles like `npm-app`.

## 1. Move Database Files

Move the entire `common/src/db` directory to `packages/internal/src/db`.

```bash
# (From project root)
mv common/src/db packages/internal/src/
```

## 2. Update `packages/internal` Dependencies

The database code has dependencies that now need to be declared in `packages/internal/package.json`.

- **Add dependencies:** `drizzle-orm`, `pg`, `@t3-oss/env-core`, `zod`, `dotenv`.
- **Add devDependencies:** `drizzle-kit`, `@types/pg`.

The versions should match what's currently in `common/package.json`.

Also, add `db:generate` and `db:migrate` scripts to the `scripts` section of `packages/internal/package.json`, pointing to the new config file location.

## 3. Update `common` package

Remove the DB-related dependencies from `common/package.json` if they are no longer used by any other code in `common`.

## 4. Update Configuration Files

Several configuration files need to be updated to reflect the new location of the DB code.

### `tsconfig.base.json`

- Ensure there's a path alias for `@codebuff/internal/*` pointing to `packages/internal/src/*`. It should look like this:
  ```json
  "paths": {
    // ... other paths
    "@codebuff/internal/*": ["packages/internal/src/*"]
  }
  ```

### `packages/internal/src/db/drizzle.config.ts`

This file's paths are relative to its location. After moving, the `out` path will correctly point to `packages/internal/src/db/migrations`. No changes should be needed here.

### `packages/internal/src/db/env.mjs`

The relative paths to load environment variables will break. They need to be updated.

- Change `dotenv.config({ path: '../stack.env' })` to `dotenv.config({ path: '../../../stack.env' })`.
- Change `const DOTENV_PATH = ... ? '/etc/secrets' : '..'` to `const DOTENV_PATH = ... ? '/etc/secrets' : '../../..'`.

### `codebuff.json`

The startup process for Drizzle Studio needs to be updated.

- Find the `drizzle` startup process.
- Its command is `bun start-studio`. This script is likely in the root `package.json` and executes a command within the `common` package.
- Update the root `package.json` script `start-studio` to run the command in `packages/internal` instead of `common`. For example, change `bun --cwd common run studio` to `bun --cwd packages/internal run studio`.
- The `studio` script in `packages/internal/package.json` would be `drizzle-kit studio --config=./src/db/drizzle.config.ts`.

Also, update `fileChangeHooks`:
- Remove or update the `common-typecheck` and `common-unit-tests` hooks.
- Add new hooks for the `internal` package: `internal-typecheck` and `internal-unit-tests`.

## 5. Update Imports Across the Codebase

This is the most extensive step. All imports from `common/src/db` must be changed.

- Search the entire codebase for the import path `@codebuff/common/db`.
- Replace all occurrences of `@codebuff/common/db` with `@codebuff/internal/db`.

Example:
```typescript
// Before
import db from '@codebuff/common/db';
import { user } from '@codebuff/common/db/schema';

// After
import db from '@codebuff/internal/db';
import { user } from '@codebuff/internal/db/schema';
```

The main places to check are:
- `backend/`
- `web/`
- `packages/billing/`

## 6. Verification

After making all the changes, verify that the application still works correctly.

1.  **Install dependencies:** Run `bun install` from the project root.
2.  **Type check:** Run `bun run typecheck` for all affected packages (`backend`, `web`, `common`, `internal`, `billing`).
3.  **Test:** Run `bun test` for all affected packages.
4.  **Run the app:** Use `codebuff` to start the dev servers and ensure there are no runtime errors.
