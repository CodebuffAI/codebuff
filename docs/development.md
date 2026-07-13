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

## Optional Local Integration Services

Openbuff no longer requires a hosted web app, billing system, or BigQuery pipeline for CLI/SDK development. The remaining service helpers are only for local integration dependencies that retained packages may need during development.

1. **Start Services:**

   ```bash
   bun up
   ```

2. **Check Status / Stop Services:**

   ```bash
   bun ps    # Check running services
   bun down  # Stop local services
   ```

3. **Logs:**
   Log outputs are written to `debug/console/`.

## Package Management

- Always use `bun` for package management: `bun install`, `bun add <pkg>`, `bun run ...` (avoid `npm` or `yarn` inside the workspace to keep lockfiles consistent).

## Running Tests

To run the local test suite:

```bash
cd cli
bun test
```

For comprehensive E2E terminal testing (which requires `tmux`):

- See [cli/src/**tests**/README.md](../cli/src/__tests__/README.md) for detailed instructions on E2E test runs.

## Tree-sitter release assets

The compiled CLI and published SDK ship `tree-sitter.wasm`, every language
grammar declared by `packages/code-map/src/wasm-files.ts`, and a
`tree-sitter-manifest.json` containing SHA-256 hashes. Release wrappers verify
that manifest on startup and redownload the current release if an installed
asset is missing or corrupted. Compiled binaries also have a checksum-pinned
legacy-wrapper repair path for installations whose older npm wrapper preserved
the parser runtime but discarded language grammars.

When adding a language, update the canonical WASM manifest, provide a compatible
tag query, add a checksum-pinned repair source when neither dependency publishes
the grammar, and keep `all-language-wasm.test.ts` plus
`grammar-wasm-repair.test.ts` green. Builds fail when an advertised grammar
cannot be packaged or checksum-verified; missing grammars must not be treated as
optional.

## CLI Command References

Use the `openbuff` namespace for new commands and help text. Do not reintroduce `codebuff` command parsers.
