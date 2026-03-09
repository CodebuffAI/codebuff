# Freebuff

**The world's strongest free coding agent.** 3–10x faster than Claude Code.

Freebuff is a free AI coding agent that runs in your terminal. It's blazing fast — describe what you want, and Freebuff edits your code in seconds. No subscription or credits required.

## Installation

```bash
npm install -g freebuff
```

## Usage

```bash
cd ~/my-project
freebuff
```

## Features

- **AI-powered coding** — Describe what you want, and Freebuff edits your code
- **File mentions** — Use `@filename` to reference specific files
- **Agent mentions** — Use `@AgentName` to invoke specialized agents
- **Bash mode** — Run terminal commands with `!command` or `/bash`
- **Image attachments** — Attach images with `/image` or `Ctrl+V`
- **Chat history** — Resume past conversations with `/history`
- **Knowledge files** — Add `knowledge.md` to your project for context
- **Themes** — Toggle light/dark mode with `/theme:toggle`

## Commands

| Command | Description |
|---|---|
| `/help` | Show keyboard shortcuts and tips |
| `/new` | Start a new conversation |
| `/history` | Browse past conversations |
| `/bash` | Enter bash mode |
| `/init` | Create a starter knowledge.md |
| `/feedback` | Share feedback |
| `/theme:toggle` | Toggle light/dark mode |
| `/logout` | Sign out |
| `/exit` | Quit |

## How It Works

Freebuff connects to a cloud backend and uses a model optimized for fast, high-quality assistance. Ads are shown to support the free tier.

## Project Structure

```
freebuff/
├── cli/       # CLI build & npm release files
└── web/       # (Future) Freebuff website
```

## Building from Source

```bash
# From the repo root
bun freebuff/cli/build.ts 1.0.0
```

This produces a `freebuff` binary in `cli/bin/`.

## Links

- [Documentation](https://codebuff.com/docs)
- [Website](https://codebuff.com)

> Freebuff is built on the [Codebuff](https://codebuff.com) platform.

## License

MIT
