# Common Package Knowledge

This package contains code shared across the Openbuff monorepo, especially the local/BYOK `cli`, `sdk`, agents, and runtime packages.

## Key Areas

- **Utilities (`src/util`)**: Shared helper functions
- **Types (`src/types`)**: Shared TypeScript types and interfaces
- **Constants (`src/constants`)**: Shared constant values
- **API Keys (`src/api-keys`)**: Local provider credential helpers and sensitive-value utilities
- **Provider config**: Shared validation and contracts for OpenAI-compatible, Anthropic-compatible, and other BYOK providers

## Scope Notes

Openbuff is CLI/SDK-focused and local/BYOK. Do not add new dependencies from `common/` to hosted web, billing, credit, subscription, or BigQuery product surfaces. Provider-owned billing, quota, token usage, and OAuth flows may still be documented when they refer to the user's configured provider rather than an Openbuff-hosted product.
