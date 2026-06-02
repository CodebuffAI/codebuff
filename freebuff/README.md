# Freebuff

**The free coding agent.** No subscription. No configuration. Start in seconds.

An AI coding agent that runs in your terminal — describe what you want, and Freebuff edits your code.

## Install

```bash
npm install -g freebuff
```

## Usage

```bash
cd ~/my-project
freebuff
```

## Why Freebuff?

**Simple** — No modes. No config. Just works.

**Fast** — 5–10× speed up. Faster models plus context gathering in seconds rather than minutes.

**Loaded** — Built-in web research, browser use, and more.

**Connect ChatGPT** — Link your ChatGPT subscription for planning and review.

## Features

- **File mentions** — Use `@filename` to reference specific files
- **Agent mentions** — Use `@AgentName` to invoke specialized agents
- **Bash mode** — Run terminal commands with `!command` or `/bash`
- **Chat history** — Resume past conversations with `/history`
- **Knowledge files** — Add `knowledge.md` to your project for context
- **Themes** — Toggle light/dark mode with `/theme:toggle`

## Commands

| Command         | Description                      |
| --------------- | -------------------------------- |
| `/help`         | Show keyboard shortcuts and tips |
| `/new`          | Start a new conversation         |
| `/history`      | Browse past conversations        |
| `/bash`         | Enter bash mode                  |
| `/init`         | Create a starter knowledge.md    |
| `/feedback`     | Share feedback                   |
| `/theme:toggle` | Toggle light/dark mode           |
| `/logout`       | Sign out                         |
| `/exit`         | Quit                             |

## FAQ

**How can it be free?** Freebuff is supported by ads shown in the CLI.

**What models do you use?** DeepSeek V4 Pro (smartest, but its API collects data for training) or DeepSeek V4 Flash as the main coding agent. Gemini 3.1 Flash Lite handles file finding and research, and GPT-5.4 handles deep thinking if you connect your ChatGPT subscription.

**Are you training on my data?** No. We only use model providers that do not train on our requests. Your code stays yours.

**Which countries is Freebuff available in?** Freebuff is currently available in select countries. See [freebuff.com](https://freebuff.com) for the full list.

**What data do you store?** We don't store your codebase. We only collect minimal logs for debugging purposes.

## How It Works

Freebuff connects to a cloud backend and uses models optimized for fast, high-quality assistance. Ads are shown to support the free tier.

## Project Structure

```
freebuff/
├── cli/       # CLI build & npm release files
└── web/       # Freebuff website
```

## Building from Source

```bash
# From the repo root
bun freebuff/cli/build.ts 1.0.0
```

## Links

- [Documentation](https://codebuff.com/docs)
- [GitHub](https://github.com/CodebuffAI/codebuff)
- [Website](https://codebuff.com)

> Built on the [Codebuff](https://codebuff.com) platform.

## License

MIT
