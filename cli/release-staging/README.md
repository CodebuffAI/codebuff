# 🚀 Openbuff — The most powerful coding agent (STAGING / `codecane`)

**⚠️ This is a staging/beta release for testing purposes.** The published staging package name is `codecane` (intentionally distinct from the stable `@openbuff/cli`), and the installed binary is also `codecane`. Install the stable release from [`@openbuff/cli`](https://www.npmjs.com/package/@openbuff/cli) instead.

Openbuff is an open-source, **local-first** agentic coding CLI that edits your codebase through natural language instructions using your configured OpenAI-compatible or Anthropic-compatible providers. No backend fallback, no credits, no subscription — bring your own keys (BYOK).

Instead of using one model for everything, Openbuff coordinates **specialized agents** that work together to understand your project and make precise changes.

1. Run `codecane` from your project directory
2. Tell it what to do
3. It will read and write to files and run commands to produce the code you want

Note: Openbuff will run commands in your terminal as it deems necessary to fulfill your request.

## Installation

To install the staging/beta release, run:

```bash
npm install -g codecane@beta
```

(Use `sudo` if you get a permission error.)

## Usage

After installation, you can start the staging CLI by running:

```bash
codecane --cwd /path/to/project
```

If `--cwd` is omitted, Codecane uses the current directory. Positional
arguments are treated as the initial coding prompt, not as a project path.

Once running, simply chat with Openbuff to say what coding task you want done.

## Features

- Understands your whole codebase
- Creates and edits multiple files based on your request
- Can run your tests or type checker or linter; can install packages
- It's powerful: ask Openbuff to keep working until it reaches a condition and it will
- **Multi-agent orchestration** — a File Picker Agent, Planner Agent, Editor Agent, and Reviewer Agent work together so each step gets the right specialist
- **Provider-flexible (BYOK)** — route each agent to OpenAI, Anthropic/Claude, ChatGPT/Codex OAuth, OpenRouter, opencode gateways, GLM/Z.ai, or local Ollama/LM Studio
- **Custom agents** — run the `/init` command to create your own `.agents/` with TypeScript generators for programmatic control

Our users regularly use Openbuff to implement new features, write unit tests, refactor code, write scripts, or give advice.

## Knowledge Files

To unlock the full benefits of modern LLMs, we recommend storing knowledge alongside your code. Add a `knowledge.md` file anywhere in your project to provide helpful context, guidance, and tips for the LLM as it performs tasks for you.

Openbuff can fluently read and write files, so it will add knowledge as it goes. You don't need to write knowledge manually!

Some have said every change should be paired with a unit test. In 2024, every change should come with a knowledge update!

## Tips

1. Type `/help` or just `/` to see available commands.
2. Create a `knowledge.md` file and collect specific points of advice. The assistant will use this knowledge to improve its responses.
3. Type `undo` or `redo` to revert or reapply file changes from the conversation.
4. Press `Esc` or `Ctrl+C` while Openbuff is generating a response to stop it.
5. Run `/setup opencode-go` (or `openai`, `anthropic`, `codex`, `openrouter`, `ollama`, `glm`) to configure a provider, then `/provider` to manage config and `/models` to route individual agents.

## Troubleshooting

### Permission Errors

If you are getting permission errors during installation, try using `sudo`:

```
sudo npm install -g codecane@beta
```

If you still have errors, it's a good idea to [reinstall Node](https://nodejs.org/en/download).

### Corporate Proxy / Firewall

If you see `Failed to download openbuff: Request timeout` or `Failed to determine latest version`, you may be behind a corporate proxy or firewall.

Openbuff respects standard proxy environment variables. Set `HTTPS_PROXY` to route traffic through your proxy:

**Linux / macOS (bash/zsh):**

```bash
export HTTPS_PROXY=http://your-proxy-server:port
codecane
```

**Windows (PowerShell):**

```powershell
$env:HTTPS_PROXY = "http://your-proxy-server:port"
codecane
```

**Windows (CMD):**

```cmd
set HTTPS_PROXY=http://your-proxy-server:port
codecane
```

To make it permanent, add the `export` or `set` line to your shell profile (e.g. `~/.bashrc`, `~/.zshrc`, or Windows System Environment Variables).

**Supported environment variables:**

| Variable                      | Purpose                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `HTTPS_PROXY` / `https_proxy` | Proxy for HTTPS requests (recommended)                                            |
| `HTTP_PROXY` / `http_proxy`   | Fallback proxy for HTTP requests                                                  |
| `NO_PROXY` / `no_proxy`       | Comma-separated list of hostnames to bypass the proxy (port suffixes are ignored) |

Both `http://` and `https://` proxy URLs are supported. Proxy authentication is supported via URL credentials (e.g. `http://user:password@proxy:port`).

## Feedback

We value your input! Please open a [GitHub issue](https://github.com/AnzoBenjamin/openbuff/issues) with your feedback on this staging release. Thank you for using Openbuff!
