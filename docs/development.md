# Development Guide

As a Bring Your Own Key (BYOK), local-first fork, developing Openbuff is highly streamlined. Since there is no required hosted backend or remote credit system, most development tasks center around the CLI and SDK running locally on your machine with your own configured LLM keys.

## Getting Started (CLI & SDK Development)

To develop the CLI locally, you do not need to run a web server or database. Simply configure your local providers and run the CLI developer task directly:

1. **Install Dependencies:**
   ```bash
   bun install
   ```

2. **Configure Your API Keys:**
   Set up your preferred OpenAI-compatible or Anthropic-compatible provider keys in your shell:
   ```bash
   export OPENAI_API_KEY="your-api-key"
   # Or for Anthropic/Claude and other providers:
   # export ANTHROPIC_API_KEY="your-key"
   # export OPENROUTER_API_KEY="your-key"
   ```

3. **Start the CLI in Development Mode:**
   ```bash
   bun start-cli
   ```
   This will boot the terminal UI (TUI) client in your current terminal session, pointing to the local monorepo source.

## Optional Backend & Integration Services

While Openbuff is focused entirely on the local BYOK model, the repository retains the upstream web/database monorepo stack for compatibility and integration testing. If you are developing features that interact with these legacy layers or running full-stack integration tests:

1. **Start Services (Web & DB):**
   ```bash
   bun up
   ```
   This starts the local Postgres database, Docker containers, and the Next.js web application.

2. **Check Status / Stop Services:**
   ```bash
   bun ps    # Check running services
   bun down  # Stop all docker services
   ```

3. **Logs:**
   Log outputs for different components are written to `debug/console/` (e.g., `db.log`, `studio.log`, `sdk.log`, `web.log`).

## Package Management

- Always use `bun` for package management: `bun install`, `bun add <pkg>`, `bun run ...` (avoid `npm` or `yarn` inside the workspace to keep lockfiles consistent).

## Database Migrations (Legacy/Optional)

If modifying the upstream schema in `packages/internal/src/db/`:
- Edit the schema using Drizzle's TypeScript DSL.
- Avoid hand-writing migration SQL.
- Run the internal DB scripts to generate and apply migrations locally.

## Running Tests

To run the local test suite:

```bash
cd cli
bun test
```

For comprehensive E2E terminal testing (which requires `tmux`):
- See [cli/src/__tests__/README.md](../cli/src/__tests__/README.md) for detailed instructions on E2E test runs.

## CLI Command References

When adding commands or updating help text, ensure they are written using the `openbuff` namespace rather than the upstream `codebuff`. Ensure any legacy command parsers for `codebuff` redirect or handle flags seamlessly in local mode.
