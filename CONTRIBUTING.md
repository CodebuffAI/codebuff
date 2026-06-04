# Contributing

This repository is a public mirror of the Freebuff/Codebuff source tree. The private repository is the source of truth, so accepted public contributions are ported into the private repo and then exported back here.

## Public Contributions

Good public PRs are usually scoped to:

- `cli/`
- `sdk/`
- `common/`
- `agents/`
- `packages/agent-runtime/`
- `packages/code-map/`
- `packages/llm-providers/`
- `freebuff/`, excluding the private web app
- `scripts/tmux/`
- public docs

Please do not add backend, database, billing, deployment, or secret-management code to the public repo.

## Development

Install dependencies:

```bash
bun install
```

Build the SDK:

```bash
bun run build:sdk
```

Build the Freebuff binary:

```bash
bun run build:freebuff
```

## Pull Request Flow

1. Open the PR against the public repo.
2. Public CI validates the exported public packages.
3. A maintainer reviews the change.
4. If accepted, a maintainer ports the patch into the private source repo.
5. The next public export brings the accepted change back into this repo.
