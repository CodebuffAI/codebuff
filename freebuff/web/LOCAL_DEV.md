# Freebuff/Vly Local Dev

Normal Vly testing runs only the Freebuff/Vly Next app on `localhost:3000`,
Convex dev, and one Cloudflare tunnel for JWKS. Freebuff agent completions call
the live Codebuff API at `https://codebuff.com`; the local Codebuff web server
and Docker/Postgres are not required unless you are changing Codebuff web API
code itself.

## One Command

From the repo root:

```bash
bun dev:vly:e2e
```

The script will:

- clear port `3000`
- start a Cloudflare tunnel for `localhost:3000`
- set Convex envs needed for local auth and Freebuff SDK calls
- start Freebuff/Vly Next on `http://localhost:3000`
- start `convex dev` from `freebuff/web`

Open:

```text
http://localhost:3000/web
```

## Required Root Env

Keep env in the repo root `.env.local`; do not add a second
`freebuff/web/.env.local`.

Required for normal local testing:

```bash
NEXT_PUBLIC_CONVEX_URL=...
CONVEX_DEPLOYMENT=...
CODEBUFF_API_KEY=...
NEXTAUTH_SECRET=...
FREEBUFF_GITHUB_ID=...
FREEBUFF_GITHUB_SECRET=...
VLY_JWT_PRIVATE_KEY=...
VLY_JWT_KEY_ID=...
```

The script sets these Convex deployment envs:

```bash
VLY_CONVEX_AUTH_ISSUER=<cloudflare tunnel for localhost:3000>
NEXT_PUBLIC_CODEBUFF_APP_URL=https://codebuff.com
CODEBUFF_API_KEY=<from root env>
```

If you already have a tunnel:

```bash
export VLY_TUNNEL_URL="https://YOUR-3000-TUNNEL.trycloudflare.com"
bun dev:vly:e2e
```

## Manual Run

Install Cloudflare tunnel if needed:

```bash
brew install cloudflared
```

Start the tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
```

Set Convex envs:

```bash
bun --cwd freebuff/web convex env set VLY_CONVEX_AUTH_ISSUER "$VLY_TUNNEL_URL"
bun --cwd freebuff/web convex env set NEXT_PUBLIC_CODEBUFF_APP_URL "https://codebuff.com"
bun --cwd freebuff/web convex env set CODEBUFF_API_KEY "$CODEBUFF_API_KEY"
```

Start Next:

```bash
PORT=3000 \
NEXT_PUBLIC_WEB_PORT=3000 \
NEXT_PUBLIC_CODEBUFF_APP_URL=https://codebuff.com \
NEXTAUTH_URL=http://localhost:3000 \
VLY_CONVEX_AUTH_ISSUER="$VLY_TUNNEL_URL" \
bun --cwd freebuff/web next dev --turbopack --port 3000
```

Start Convex in another terminal:

```bash
VLY_CONVEX_AUTH_ISSUER="$VLY_TUNNEL_URL" \
NEXT_PUBLIC_CODEBUFF_APP_URL=https://codebuff.com \
bun --cwd freebuff/web convex dev
```

## Optional Codebuff Web API Work

Only use Docker/Postgres and the local Codebuff web server when you are changing
`web/` API behavior. Normal Vly Freebuff agent runs do not need them.

```bash
bun dev:vly:e2e --with-db
```

If you start Codebuff web manually, run it separately from Vly; it is no longer
part of the Vly local E2E path.

## Common Checks

JWKS must be publicly reachable through the tunnel:

```bash
curl -I "$VLY_TUNNEL_URL/api/web/.well-known/jwks.json"
```

Convex should see Freebuff SDK envs:

```bash
bun --cwd freebuff/web convex env list
```

No local process should be required on port `3001` for Vly E2E testing.
