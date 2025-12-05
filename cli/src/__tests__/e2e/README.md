# E2E Testing Infrastructure

This directory contains end-to-end tests for the Codebuff CLI that run against a real web server with a real database.

## Prerequisites

1. **Docker** must be running
2. **SDK** must be built: `cd sdk && bun run build`
3. **psql** must be available (for seeding the database)

## Running E2E Tests

```bash
# Run all e2e tests
cd cli && bun test e2e/e2e-tuistory.test.ts

# Run with verbose output
cd cli && bun test e2e/e2e-tuistory.test.ts --verbose
```

## Architecture

### Per-Describe Isolation

Each `describe` block gets its own:
- Fresh PostgreSQL database container (on a unique port starting from 5433)
- Fresh web server instance (on a unique port starting from 3100)
- Fresh CLI sessions

This ensures complete test isolation - no state leaks between describe blocks.

### Test Flow

1. `beforeAll`: 
   - Start Docker container with PostgreSQL
   - Run Drizzle migrations
   - Seed database with test users
   - Start web server pointing to test database
   - Wait for everything to be ready

2. Tests run with fresh CLI sessions

3. `afterAll`:
   - Close all CLI sessions
   - Stop web server
   - Destroy Docker container

### Test Users

Predefined test users are available in `E2E_TEST_USERS`:

- `default`: 1000 credits, standard test user
- `secondary`: 500 credits, for multi-user scenarios
- `lowCredits`: 10 credits, for testing credit warnings

### Timing

- Database startup: ~5-10 seconds
- Server startup: ~30-60 seconds
- Total setup per describe: ~40-70 seconds

## Files

- `test-db-utils.ts` - Database lifecycle management
- `test-server-utils.ts` - Web server management
- `test-cli-utils.ts` - CLI session management
- `e2e-tuistory.test.ts` - The actual e2e tests
- `index.ts` - Exports for external use

## Important: Web Server Spawning

The E2E tests spawn the Next.js dev server using `bun next dev -p PORT` directly instead of `bun run dev`. This is because:

1. **Bun doesn't expand shell variables** - The npm script `next dev -p ${NEXT_PUBLIC_WEB_PORT:-3000}` uses shell variable expansion, but Bun passes this literally without expanding it
2. **`.env.worktree` overrides** - Worktree-specific environment files can override PORT settings, causing tests to connect to the wrong port

If you modify the `dev` script in `web/package.json`, you may also need to update `test-server-utils.ts` to match. The current implementation in `startE2EServer()` is:

```typescript
spawn('bun', ['next', 'dev', '-p', String(port)], { cwd: WEB_DIR, ... })
```

## Cleanup

If tests fail and leave orphaned containers:

```bash
# Clean up all e2e containers
bun --cwd packages/internal run db:e2e:cleanup

# Or manually:
docker ps -aq --filter "name=manicode-e2e-" | xargs docker rm -f
```

## Adding New Tests

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { createE2ETestContext } from './test-cli-utils'
import { E2E_TEST_USERS } from './test-db-utils'
import type { E2ETestContext } from './test-cli-utils'

describe('E2E: My New Tests', () => {
  let ctx: E2ETestContext

  beforeAll(async () => {
    ctx = await createE2ETestContext('my-new-tests')
  }, 180000) // 3 minute timeout

  afterAll(async () => {
    await ctx?.cleanup()
  }, 60000)

  test('my test', async () => {
    const session = await ctx.createSession(E2E_TEST_USERS.default)
    
    // Wait for CLI to render
    await sleep(5000)
    
    // Interact with CLI
    await session.cli.type('hello')
    await session.cli.press('enter')
    
    // Assert
    const text = await session.cli.text()
    expect(text).toContain('hello')
  }, 60000)
})
```

## Debugging

### View container logs

```bash
docker logs <container-name>
```

### Connect to test database

```bash
PGPASSWORD=e2e_secret_password psql -h localhost -p 5433 -U manicode_e2e_user -d manicode_db_e2e
```

### Check running containers

```bash
docker ps --filter "name=manicode-e2e-"
```
