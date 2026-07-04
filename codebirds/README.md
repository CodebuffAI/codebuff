# Codebirds

**The free coding agent.** No subscription. No configuration. Start in seconds.

An AI coding agent that runs in your terminal — describe what you want, and Codebirds edits your code.

## Install

```bash
npm install -g codebirds
```

## Usage

```bash
cd ~/my-project
codebirds
```

## Project Structure

```
codebirds/
├── cli/       # CLI build & npm release files
└── web/       # Codebirds website
```

## Building from Source

```bash
# From the repo root
bun codebirds/cli/build.ts 1.0.0
```

---

For everything else — what Codebirds does, how it works, FAQ, and more — see the [repo root README](../README.md). We keep that one up to date as the single source of truth.

## License

MIT
