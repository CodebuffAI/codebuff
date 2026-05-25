# Freebuff Web

The Freebuff website (freebuff.com) — a simplified marketing and auth frontend for the Freebuff free coding agent.

## Architecture

- **Separate Next.js app** in `freebuff/web/`, not a conditionally-configured version of `web/`
- **Shared auth**: Same NextAuth config, same database, same GitHub OAuth — one account works for both Codebuff and Freebuff
- **Shared backend**: The Freebuff CLI talks to the Codebuff backend (`codebuff.com`). This website is primarily a marketing + auth frontend.
- **Minimal scope**: Landing page, login, onboard (CLI auth callback). No pricing, store, org management, admin, or docs.

## Key differences from Codebuff web

- No PostHog analytics
- No contentlayer/docs system
- No Stripe billing UI (but auth-options still creates Stripe customers for shared accounts)
- No org management, admin panel, or store
- Freebuff-specific branding (green accent, "Free" emphasis)

## Running locally

```bash
bun --cwd freebuff/web dev
```

Runs on port 3002 by default (to avoid conflicts with Codebuff web on 3000).

## Environment

Same env vars as the main Codebuff web app, plus Freebuff-specific URL overrides. In production, deploy with:
- `NEXT_PUBLIC_CODEBUFF_APP_URL=https://codebuff.com`
- `NEXT_PUBLIC_FREEBUFF_APP_URL=https://freebuff.com`
- `NEXTAUTH_FREEBUFF_URL=https://freebuff.com`
- The Freebuff web app derives NextAuth's runtime URL from `NEXTAUTH_FREEBUFF_URL`, falling back to `NEXT_PUBLIC_FREEBUFF_APP_URL`.
- Same DB credentials as Codebuff
- Potentially a separate GitHub OAuth app for the freebuff.com callback URL
