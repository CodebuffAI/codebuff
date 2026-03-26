# Evalbuff

Codebase-specific evals, context, and review for AI coding agents.

## Quick Start

```bash
# Initialize evalbuff in your project
evalbuff init

# Get context before starting a task
evalbuff context "add user authentication"

# Review your changes
evalbuff review "added JWT auth to API routes"
```

## Commands

| Command | Description |
|---------|-------------|
| `evalbuff init` | Initialize evalbuff in a project |
| `evalbuff context <prompt>` | Get relevant files, knowledge, and gotchas |
| `evalbuff review [prompt]` | Review code changes with structured feedback |
| `evalbuff login` | Authenticate with evalbuff |
| `evalbuff logout` | Clear stored credentials |

## Development

From the monorepo root:

```bash
bun install
bun --cwd evalbuff/cli run dev -- --help
```

See [PHASE-1-SPEC.md](./PHASE-1-SPEC.md) for the full specification.
