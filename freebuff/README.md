# FreeBuff

FreeBuff is a free-only variant of the [Codebuff](https://codebuff.com) CLI — an AI coding assistant that runs in your terminal.

## Installation

```bash
npm install -g freebuff
```

## Usage

```bash
cd ~/my-project
freebuff
```

FreeBuff runs in FREE mode only — no subscription or credits required. Just log in and start coding.

## Features

- **AI-powered coding** — Describe what you want, and FreeBuff edits your code
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

FreeBuff connects to the Codebuff backend and uses the FREE mode agent, which is optimized for fast, cost-effective assistance. Ads are shown to support the free tier.

## Project Structure

```
freebuff/
├── cli/       # CLI build & npm release files
└── web/       # (Future) FreeBuff website
```

## Building from Source

```bash
# From the repo root
bun freebuff/cli/build.ts 1.0.0
```

This produces a `freebuff` binary in `cli/bin/`.

## Links

- [Codebuff Documentation](https://codebuff.com/docs)
- [Codebuff Website](https://codebuff.com)

## License

MIT
