# Common Package Knowledge

This package contains code shared across the Openbuff monorepo, especially the local/BYOK `cli`, `sdk`, agents, and runtime packages.

## Key Areas

- **Utilities (`src/util`)**: Shared helper functions, cache-debug redaction, serialization, diagnostics helpers, and small process/env utilities
- **Types (`src/types`)**: Shared TypeScript types and interfaces used by CLI, SDK, agents, and worker-facing runtime code
- **Constants (`src/constants`)**: Shared constant values for provider names, model metadata, and cross-package feature flags
- **API Keys (`src/api-keys`)**: Local provider credential helpers and sensitive-value utilities that keep secrets out of logs and cache keys
- **MCP client (`src/mcp`)**: Local MCP transport/client helpers with cache keys based on non-secret endpoint identity and hashed credential-derived values
- **Provider config**: Shared validation and contracts for OpenAI-compatible, Anthropic-compatible, and other BYOK providers

## Scope Notes

Openbuff is CLI/SDK-focused and local/BYOK. Do not add new dependencies from `common/` to hosted web, billing, credit, subscription, or BigQuery product surfaces. Provider-owned billing, quota, token usage, and OAuth flows may still be documented when they refer to the user's configured provider rather than an Openbuff-hosted product.
