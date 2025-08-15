Briefing (Read First)
- Monorepo + Bun basics
  - Monorepo with TypeScript + Bun everywhere. Local runs often use `.bin/bun`, which can inject dev env (`NEXT_PUBLIC_CB_ENVIRONMENT=dev`). Prefer plain `bun` in CI to avoid unintended dev defaults.
  - The SDK runner is at `scripts/git-evals/run-single-eval.ts` and imports from `../../sdk/src`. It streams conversation/events to console.

- SDK connectivity + auth
  - Today the SDK hard-requires the `codebuff` CLI in PATH (constructor checks with `which/where`). Install with `npm i -g codebuff` OR implement the skip flag below.
  - Add an optional skip flag (recommended): if `CODEBUFF_SKIP_BINARY_CHECK=1`, skip the CLI presence check.
  - Default WS URL depends on env. In CI/remote, explicitly set `CODEBUFF_WEBSOCKET_URL=ws://127.0.0.1:4242/ws` so the SDK connects to your ephemeral backend (and not prod/dev defaults).
  - Provide an API key as `CODEBUFF_API_KEY`. In seed mode, this comes from Drizzle seed output. In bypass mode, reuse `CODEBUFF_TEST_AUTH_TOKEN`.

- Docker containment (backend stays Docker‑agnostic)
  - All infra (Compose, Dockerfile, scripts, seeding) lives under `evals/`. The backend does not reference Docker.
  - Compose binds backend to loopback only (`127.0.0.1:4242`), so nothing is publicly exposed in CI.

- Readiness + flake control
  - Don’t just wait for HTTP bind—wait for `/healthz` to return 200 AND ensure WS is accepting connections. Use a curl loop with a strict timeout (60–90s) or enhance `/healthz` to signal WS readiness.
  - Stream backend logs on failure to diagnose quickly.

- Seeding strategy: Drizzle (preferred)
  - Seed lives in `evals/seeds/seed-evals.ts` and imports tables from `backend/db/schema.ts`.
  - Use deterministic IDs + `onConflictDoNothing()` for idempotency.
  - Print exactly one line: `CODEBUFF_API_KEY=...`. The runner parses this—avoid extra logs.
  - Align with the backend’s token model: confirm whether API tokens live in `session` or a dedicated `api_keys` table, and include required fields (e.g., `expiresAt`, `createdAt`).

- Test‑only auth bypass (fastest fallback)
  - If `CODEBUFF_TEST_AUTH_TOKEN` is set AND `NODE_ENV=test`, accept that token in WS auth and attach a minimal user context. Skip DB lookups; great for smoke tests.

- CI specifics
  - Use Docker Compose under `evals/` for parity and a one‑liner.
  - Install `codebuff` globally in the runner (or use the skip flag after we add it).
  - Set `CODEBUFF_WEBSOCKET_URL` + `CODEBUFF_API_KEY` explicitly; mask secrets; tear down with `docker compose down -v`.
  - Concurrency: separate Compose project names or only use internal networking.

- Common pitfalls
  - `.bin/bun` locally can set dev defaults and point SDK at localhost. In CI, always set `CODEBUFF_WEBSOCKET_URL`.
  - `/healthz` returning 200 before WS is ready → flakiness. Gate readiness on WS availability.
  - Seed failures: wrong import path or missing required columns. Inspect `backend/db/schema.ts` and insert minimum viable fields.
  - Token mismatch: ensure seeded token matches WS auth expectations. If unsure, use bypass first.
  - No `codebuff` in PATH → SDK throws. Install it or use the skip flag once implemented.

- Quick execution checklist
  - `npm i -g codebuff` (or set `CODEBUFF_SKIP_BINARY_CHECK=1` after we add it)
  - `docker compose -f evals/docker-compose.evals.yml up -d --build db backend`
  - Wait for `http://127.0.0.1:4242/healthz` OK (WS-ready semantics)
  - Seed (Drizzle) → capture `CODEBUFF_API_KEY` OR set bypass envs
  - `CODEBUFF_WEBSOCKET_URL=ws://127.0.0.1:4242/ws bun scripts/git-evals/run-single-eval.ts --prompt "..."`
  - `docker compose -f evals/docker-compose.evals.yml down -v`

---

New Tweaks and TODOs (from review)
- Implement SDK skip flag (env guard) and WS URL override:
```
// sdk/src/client.ts (skip flag pseudo-patch)
const SKIP = process.env.CODEBUFF_SKIP_BINARY_CHECK === '1'
if (!SKIP) {
  const isWindows = process.platform === 'win32'
  if (
    execFileSync(isWindows ? 'where' : 'which', [CODEBUFF_BINARY])
      .toString()
      .trim() === ''
  ) {
    throw new Error('Missing codebuff binary ...')
  }
}
```
```
// sdk/src/constants.ts (WS override pseudo-patch)
const WS_FROM_ENV = process.env.CODEBUFF_WEBSOCKET_URL || process.env.CB_WS_URL
export const WEBSOCKET_URL = WS_FROM_ENV ?? (
  IS_PROD ? 'wss://manicode-backend.onrender.com/ws' : 'ws://localhost:4242/ws'
)
```

- Health readiness contract: ensure /healthz implies WS is ready. If needed, add a WS-ready flag in server startup before returning 200:
```
// backend readiness (pseudo-code)
let wsReady = false
startWebsocketServer(() => { wsReady = true })
app.get('/healthz', (req, res) => {
  return wsReady ? res.status(200).send('ok') : res.status(503).send('starting')
})
```

- Backend start command: confirm the backend has a script that starts the WS server on 4242; otherwise define one and call it from the Dockerfile:
```
// package.json (backend) pseudo-snippet
{
  "scripts": {
    "start:ws": "bun run dev" // or explicit entry that starts WS on 4242
  }
}
```
```
# evals/backend.Dockerfile (if needed)
CMD ["bun", "--cwd", "backend", "start:ws"]
```

- Drizzle seed alignment: verify exact token table/columns and adjust seed accordingly (examples):
```
// evals/seeds/seed-evals.ts (pseudo)
await db.insert(session).values({
  id: token,
  userId,
  expiresAt: new Date(Date.now() + 24*60*60*1000),
  createdAt: new Date(),
  // any other required columns
}).onConflictDoNothing()
```

- Container path sanity: ensure import path is correct from inside the seeder container:
```
// from evals/seeds/seed-evals.ts
import { user, session } from '../../backend/db/schema'
```

- Debugging playbook additions:
```
# On failure dump logs
docker compose -f evals/docker-compose.evals.yml logs backend --tail=200 || true
# If healthz flaps, add a longer timeout
bash evals/scripts/wait-for-healthz.sh http://127.0.0.1:4242/healthz 120
```

---

1) Directory layout (all infra under evals/; backend stays Docker-agnostic)
- Place all Dockerfiles, compose files, seed scripts, and run scripts in `evals/`
- Build backend image using project root as build context while specifying the Dockerfile inside `evals/`

```
repo-root/
  evals/
    docker-compose.evals.yml
    backend.Dockerfile
    scripts/
      run-remote.sh
      wait-for-healthz.sh
    seeds/
      seed-evals.ts     # Drizzle seed script (preferred)
    README.md
  backend/
    db/
      schema.ts        # existing drizzle schema (used by seed)
      # ...migrations, drizzle config; unchanged
  # other packages unchanged
```

2) Compose file (db + backend), healthchecks, no public exposure
- Build backend from repo root as build context, using Dockerfile at evals/backend.Dockerfile
- Bind backend to localhost only; SDK connects via ws://127.0.0.1:4242/ws
- Use a separate seeder service (or run seeding via `docker compose run --rm seeder`)

```
# evals/docker-compose.evals.yml
version: '3.9'
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: codebuff
      POSTGRES_PASSWORD: codebuff
      POSTGRES_DB: codebuff
    command: [
      "postgres",
      "-c", "fsync=off",
      "-c", "synchronous_commit=off",
      "-c", "full_page_writes=off"
    ]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U codebuff -d codebuff"]
      interval: 5s
      timeout: 3s
      retries: 20

  backend:
    build:
      context: ..                 # project root
      dockerfile: ./evals/backend.Dockerfile
    environment:
      DATABASE_URL: postgresql://codebuff:codebuff@db:5432/codebuff
      NODE_ENV: test
      # Optional test-only bypass (see Section 5)
      CODEBUFF_TEST_AUTH_TOKEN: ${CODEBUFF_TEST_AUTH_TOKEN}
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "127.0.0.1:4242:4242"     # loopback only
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:4242/healthz"]
      interval: 5s
      timeout: 3s
      retries: 30

  seeder:
    image: oven/bun:1.1.34
    working_dir: /app
    volumes:
      - ..:/app:ro
    environment:
      DATABASE_URL: postgresql://codebuff:codebuff@db:5432/codebuff
    entrypoint: ["bun", "run", "evals/seeds/seed-evals.ts"]
    depends_on:
      db:
        condition: service_healthy
```

3) Backend image build (Dockerfile living in evals/)
- Keep backend unaware of Docker by placing the Dockerfile in evals; reference backend code via build context

```
# evals/backend.Dockerfile
FROM oven/bun:1.1.34 as base
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
EXPOSE 4242
CMD ["bun", "--cwd", "backend", "dev"]
```

4) SDK URL override (prefer explicit WS URL; no prod/dev confusion)
- Allow CODEBUFF_WEBSOCKET_URL to override default; keeps CI/local targeting explicit

```
// sdk/src/constants.ts (pseudo-patch)
const WS_FROM_ENV = process.env.CODEBUFF_WEBSOCKET_URL || process.env.CB_WS_URL
export const WEBSOCKET_URL = WS_FROM_ENV ?? (
  IS_PROD ? 'wss://manicode-backend.onrender.com/ws' : 'ws://localhost:4242/ws'
)
```

5) Test-only auth bypass (optional, fastest)
- Minimal code change in backend auth path (no Docker coupling). If `CODEBUFF_TEST_AUTH_TOKEN` is set and matches incoming token, accept it and attach minimal user context.

```
// backend/src/websockets/auth.ts (pseudo-code)
export function getUserInfoFromAuthToken(authToken: string): UserInfo | null {
  const bypass = process.env.CODEBUFF_TEST_AUTH_TOKEN
  if (process.env.NODE_ENV === 'test' && bypass && authToken === bypass) {
    return { userId: 'test-user', email: 'evals@test.local', isAdmin: false }
  }
  // ...existing lookup against sessions/users...
}
```

6) Drizzle seed (preferred over raw SQL)
- Seed a minimal user/org/session/API key using Drizzle ORM, talking directly to Postgres in Compose
- Keep seed entirely under evals/; import schema from backend/db/schema.ts for type safety
- Print a single line: `CODEBUFF_API_KEY=...` for the runner to capture

```
// evals/seeds/seed-evals.ts (pseudo-code with Drizzle)
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import {
  user, session, org, /* other tables as needed */
} from '../../backend/db/schema'  // adjust import path if needed

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL!
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  const db = drizzle(client)

  // deterministic IDs for idempotency
  const userId = 'test-user'
  const email = 'evals@test.local'
  const token = crypto.randomUUID() // or deterministic for replay

  // upsert user
  await db
    .insert(user)
    .values({ id: userId, email /* ...other required fields */ })
    .onConflictDoNothing()

  // upsert org (optional; link user as owner)
  // await db.insert(org).values({ ... }).onConflictDoNothing()

  // upsert session / api token row
  await db
    .insert(session)
    .values({ id: token, userId, /* expiresAt, createdAt, etc. */ })
    .onConflictDoNothing()

  console.log(`CODEBUFF_API_KEY=${token}`)
  await client.end()
}

main().catch((err) => { console.error(err); process.exit(1) })
```

7) One-liner runner script (spin up, wait, seed with Drizzle, run, tear down)
- Lives entirely in evals/scripts; wires envs and points SDK to ephemeral WS
- Supports: bypass mode OR real seeding mode via Drizzle

```
# evals/scripts/run-remote.sh
set -euo pipefail
MODE="${1:-seed}"  # 'seed' (Drizzle) or 'bypass'
export CODEBUFF_WEBSOCKET_URL="ws://127.0.0.1:4242/ws"
export CODEBUFF_SKIP_BINARY_CHECK=1  # after skip flag is added

# Start services
docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" up -d --build db backend
"$(dirname "$0")/wait-for-healthz.sh" "http://127.0.0.1:4242/healthz" 90 || {
  echo 'Healthz failed; dumping backend logs...'
  docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" logs backend --tail=200 || true
  exit 1
}

if [ "$MODE" = "bypass" ]; then
  export CODEBUFF_TEST_AUTH_TOKEN="$(openssl rand -hex 16)"
  export CODEBUFF_API_KEY="$CODEBUFF_TEST_AUTH_TOKEN"
else
  # Drizzle seed via compose for network access to db
  KEY_LINE=$(docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" run --rm seeder | tail -n1)
  export CODEBUFF_API_KEY="${KEY_LINE#CODEBUFF_API_KEY=}"
fi

bun scripts/git-evals/run-single-eval.ts \
  --prompt "Say hi and print the working directory" \
  --max-steps 10

docker compose -f "$(dirname "$0")/../docker-compose.evals.yml" down -v
```

```
# evals/scripts/wait-for-healthz.sh
set -euo pipefail
URL="$1"; TIMEOUT="${2:-60}"
for i in $(seq 1 "$TIMEOUT"); do
  if curl -fsS "$URL" >/dev/null 2>&1; then exit 0; fi
  sleep 1
  echo "waiting for backend... ($i s)"
done
echo "backend healthz did not become ready in $TIMEOUT seconds" >&2
exit 1
```

8) GitHub Actions sketch (contained orchestration)
- The workflow calls the one-liner; Drizzle seed by default

```
# .github/workflows/remote-evals.yml (pseudo-snippet)
jobs:
  remote-evals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - name: Install codebuff CLI (SDK binary check)
        run: npm i -g codebuff
      - name: Run remote eval (Drizzle seed)
        run: bash evals/scripts/run-remote.sh seed
```
