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
