# @codebuff/internal

This package contains internal utilities, database schema, and shared server-side code.

## Database Commands

### Why `bunx --bun` for Drizzle Commands

All drizzle-kit scripts in `package.json` use `bunx --bun` instead of calling `drizzle-kit` directly:

```json
"db:generate": "bunx --bun drizzle-kit generate --config=./src/db/drizzle.config.ts",
"db:migrate": "bunx --bun drizzle-kit push --config=./src/db/drizzle.config.ts",
"db:studio": "bunx --bun drizzle-kit studio --config=./src/db/drizzle.config.ts"
```

**Why this is necessary:**

1. `drizzle-kit` runs via Node.js (not Bun) by default - it has `#!/usr/bin/env node` in its shebang
2. Node.js does NOT auto-load `.env.local` files like Bun does
3. Without `--bun`, drizzle-kit won't have access to environment variables like `DATABASE_URL`
4. The `--bun` flag forces the command to run via Bun's runtime, which properly loads `.env.local`

**If you add new drizzle-kit scripts**, always use `bunx --bun drizzle-kit ...` to ensure environment variables are available.
