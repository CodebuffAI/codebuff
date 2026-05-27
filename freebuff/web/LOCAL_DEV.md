# Freebuff/Vly Local Development

This runs the migrated Vly app at `http://localhost:3000`, the Codebuff web
harness at `http://localhost:3001`, and Convex against the cloud dev deployment.

Use the root `.env.local` at the repository root. Do not create a
`freebuff/web/.env.local`.

## Prerequisites

- Bun is installed.
- Docker Desktop is running if you need the Codebuff local Postgres database.
- `cloudflared` is installed and authenticated enough to create quick tunnels.
  If it is missing, install it with:

  ```bash
  brew install cloudflared
  ```
- Root `.env.local` contains the normal Freebuff/Codebuff/Vly secrets, including:
  - `CONVEX_DEPLOYMENT`
  - `NEXT_PUBLIC_CONVEX_URL`
  - `NEXT_PUBLIC_CONVEX_SITE_URL`
  - `CODEBUFF_API_KEY`
  - `FREEBUFF_TO_VLY_CALLBACK_TOKEN`
  - `FREEBUFF_GITHUB_ID` or `CODEBUFF_GITHUB_ID`
  - `FREEBUFF_GITHUB_SECRET` or `CODEBUFF_GITHUB_SECRET`

## Why Tunnels Are Required

Convex is running in the cloud, so Convex cannot fetch URLs on
`http://localhost`. The local Freebuff/Vly app must be exposed through a
Cloudflare tunnel so Convex can fetch:

- `https://<vly-tunnel>/api/web/.well-known/jwks.json`

The agent harness also runs locally on port `3001`, so Convex actions need a
second tunnel to call:

- `https://<codebuff-tunnel>/api/v1/freebuff/harness/runs`

Docker is not used for Cloudflare or Convex. Docker is only needed by
`bun start-db`, which starts the local database used by the Codebuff web server.

## Clean Existing Processes

## One-Command Startup

The simplest path is the repo script:

```bash
cd /Users/victorcheng/GitHub/freebuff-private
bun dev:vly:e2e
```

The script will:

- clear listeners on ports `3000` and `3001`
- start the Docker-backed Codebuff database with `bun start-db`
- start a Cloudflare tunnel for `localhost:3000`
- start a Cloudflare tunnel for `localhost:3001`
- set the Convex cloud env vars that depend on those tunnel URLs
- start the Codebuff backend on `http://localhost:3001`
- start Freebuff/Vly on `http://localhost:3000`
- start `convex dev` from `freebuff/web`

By default this keeps startup light and lets Next compile routes on demand. To
compile the common Vly routes up front for easier click-through testing, use:

```bash
bun dev:vly:e2e -- --prewarm
```

Pass `--no-db` if Docker/Postgres is already running:

```bash
bun dev:vly:e2e -- --no-db
```

You can also prewarm routes against an already-running app:

```bash
bun dev:vly:prewarm
```

If you already started Cloudflare tunnels yourself, pass them through the
environment and the script will skip creating new tunnels:

```bash
export VLY_TUNNEL_URL="https://YOUR-3000-TUNNEL.trycloudflare.com"
export CODEBUFF_TUNNEL_URL="https://YOUR-3001-TUNNEL.trycloudflare.com"
bun dev:vly:e2e -- --no-db
```

Pass `--no-kill` if you do not want the script to clear ports first:

```bash
bun dev:vly:e2e -- --no-kill
```

After startup, test the app at:

```text
http://localhost:3000/web
```

The rest of this document shows the manual equivalent.

## Manual Startup

### Clean Existing Processes

```bash
cd /Users/victorcheng/GitHub/freebuff-private

lsof -tiTCP:3000 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:3001 -sTCP:LISTEN | xargs -r kill
```

## Start Cloudflare Tunnels

Terminal 1:

```bash
cloudflared tunnel --url http://localhost:3000
```

Copy the generated `https://...trycloudflare.com` URL. This is
`VLY_TUNNEL_URL`.

Terminal 2:

```bash
cloudflared tunnel --url http://localhost:3001
```

Copy the generated `https://...trycloudflare.com` URL. This is
`CODEBUFF_TUNNEL_URL`.

## Set Convex Cloud Environment

Run this once after the tunnels are created. Replace both tunnel URLs.

```bash
cd /Users/victorcheng/GitHub/freebuff-private

export VLY_TUNNEL_URL="https://YOUR-3000-TUNNEL.trycloudflare.com"
export CODEBUFF_TUNNEL_URL="https://YOUR-3001-TUNNEL.trycloudflare.com"

set -a
source .env.local
set +a

bun --cwd freebuff/web convex env set VLY_CONVEX_AUTH_ISSUER "$VLY_TUNNEL_URL"
bun --cwd freebuff/web convex env set CODEBUFF_HARNESS_URL "$CODEBUFF_TUNNEL_URL"
bun --cwd freebuff/web convex env set NEXT_PUBLIC_CONVEX_SITE_URL "$NEXT_PUBLIC_CONVEX_SITE_URL"
bun --cwd freebuff/web convex env set CODEBUFF_API_KEY "$CODEBUFF_API_KEY"
bun --cwd freebuff/web convex env set FREEBUFF_TO_VLY_CALLBACK_TOKEN "$FREEBUFF_TO_VLY_CALLBACK_TOKEN"
```

If the tunnel URLs change, rerun the `VLY_CONVEX_AUTH_ISSUER` and
`CODEBUFF_HARNESS_URL` commands, then restart Convex dev.

## Start Codebuff Backend on 3001

Terminal 3:

```bash
cd /Users/victorcheng/GitHub/freebuff-private

set -a
source .env.local
set +a

bun start-db
PORT=3001 \
NEXT_PUBLIC_WEB_PORT=3001 \
NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:3001 \
bun --cwd web dev --port 3001
```

`bun start-db` requires Docker. If the database is already running, it is safe
for the command to no-op or report that the container already exists.

## Start Freebuff/Vly on 3000

Terminal 4:

```bash
cd /Users/victorcheng/GitHub/freebuff-private

export VLY_TUNNEL_URL="https://YOUR-3000-TUNNEL.trycloudflare.com"

set -a
source .env.local
set +a

PORT=3000 \
NEXT_PUBLIC_WEB_PORT=3000 \
NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:3001 \
VLY_CONVEX_AUTH_ISSUER="$VLY_TUNNEL_URL" \
bun --cwd freebuff/web next dev --port 3000
```

Open the app at:

```text
http://localhost:3000/web
```

Use the localhost URL in the browser. Convex uses the tunnel URL only for JWKS
and callbacks.

## Start Convex Dev

Terminal 5:

```bash
cd /Users/victorcheng/GitHub/freebuff-private

export VLY_TUNNEL_URL="https://YOUR-3000-TUNNEL.trycloudflare.com"

set -a
source .env.local
set +a

VLY_CONVEX_AUTH_ISSUER="$VLY_TUNNEL_URL" \
bun --cwd freebuff/web convex dev
```

This deploys function changes, regenerates Convex types, and applies
`freebuff/web/convex/auth.config.ts` to the cloud dev deployment.

## Quick Verification

Check local ports:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:3001 -sTCP:LISTEN
```

Check the JWKS endpoint through the tunnel:

```bash
curl "$VLY_TUNNEL_URL/api/web/.well-known/jwks.json"
```

Expected result: JSON with a `keys` array.

Check the Codebuff harness through the tunnel:

```bash
curl -I "$CODEBUFF_TUNNEL_URL/api/v1/freebuff/harness/runs"
```

Expected result: any HTTP response from the local Codebuff server is enough to
prove the tunnel reaches port `3001`. Auth or method errors are fine.

## Common Failure Modes

### Convex says it cannot fetch JWKS

`VLY_CONVEX_AUTH_ISSUER` is still `localhost`, missing, or points at an expired
tunnel. Set it again with:

```bash
bun --cwd freebuff/web convex env set VLY_CONVEX_AUTH_ISSUER "$VLY_TUNNEL_URL"
```

Then restart `bun --cwd freebuff/web convex dev`.

### Agent says it cannot reach the harness

`CODEBUFF_HARNESS_URL` is missing, expired, or points at the wrong tunnel. Set it
again with:

```bash
bun --cwd freebuff/web convex env set CODEBUFF_HARNESS_URL "$CODEBUFF_TUNNEL_URL"
```

Then restart `bun --cwd freebuff/web convex dev`.

### GitHub login fails

For local browser testing, the GitHub OAuth app must allow:

```text
http://localhost:3000/api/auth/callback/github
```

If you switch the browser itself to the tunnel URL, the GitHub OAuth app must
also allow:

```text
https://YOUR-3000-TUNNEL.trycloudflare.com/api/auth/callback/github
```

The recommended local workflow is to browse at `http://localhost:3000/web` and
use the tunnel only for Convex.

### A command recreates `freebuff/web/.env.local`

Delete it. The migration uses only the root env file:

```bash
rm -f freebuff/web/.env.local
```
