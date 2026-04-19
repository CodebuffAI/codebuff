# Development

## Getting Started

Start the web server first:

```bash
bun up
```

Then start the CLI separately:

```bash
bun start-cli
```

Other service commands:

```bash
bun ps    # check running services
bun down  # stop services
```

## Worktrees

To run multiple stacks on different ports, create `.env.development.local`:

```bash
PORT=3001
NEXT_PUBLIC_WEB_PORT=3001
NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:3001
```

## Logs

Logs are in `debug/console/` (`db.log`, `studio.log`, `sdk.log`, `web.log`).

## Package Management

- Use `bun install`, `bun run ...` (avoid `npm`).

## Database Migrations

Edit schema using Drizzle's TS DSL (don't hand-write migration SQL), then run the internal DB scripts to generate/apply migrations.

## Running Scripts Against Prod

Scripts in `scripts/` connect to whatever environment Infisical injects. To run a script against the production database and services, prefix it with `infisical run --env=prod`:

```bash
infisical run --env=prod -- bun scripts/<name>.ts
```

You can also inline a one-off query:

```bash
infisical run --env=prod -- bun -e "import db from '@codebuff/internal/db'; /* ... */"
```

Add `--silent` to suppress the Infisical banner. Default env is `dev` — always pass `--env=prod` explicitly when you want prod. Prefer read-only queries; coordinate before running anything that writes.
