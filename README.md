# Freebuff

English | [简体中文](./README.zh-CN.md)

**Five free AI products for coding, building, and research.** No subscription, credits, or API key required.

[Freebuff](https://freebuff.com) brings specialized agents and a choice of leading models to your terminal, desktop, browser, and GitHub repositories. Text ads support access to the included models.

## Choose your Freebuff

| Product              | What it does                        | Get started                                                           |
| -------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| **Freebuff Desktop** | Run parallel agents locally         | [Download for macOS, Windows, or Linux](https://freebuff.com/desktop) |
| **Freebuff CLI**     | Code from your terminal             | [Install the CLI](https://freebuff.com/cli)                           |
| **Freebuff Web**     | Build and ship full-stack apps      | [Build an app](https://freebuff.com/web)                              |
| **Freebuff Cloud**   | Run agents on any GitHub repository | [Connect a repository](https://freebuff.com/cloud)                    |
| **Freebuff Chat**    | Research and think with AI          | [Start a chat](https://freebuff.com/chat)                             |

## Quick start

Run Freebuff in any project from your terminal:

```bash
npm install -g freebuff
cd ~/my-project
freebuff
```

Then describe what you want. Freebuff finds the relevant files, makes changes, and runs the checks that matter for your project.

## Models

Freebuff includes a curated model catalog. The regular picker currently offers:

| Model                       | Access                  | Best for                                                           |
| --------------------------- | ----------------------- | ------------------------------------------------------------------ |
| **GPT-5.6 Luna**            | Full access             | The default everywhere in full mode; deep reasoning, native images |
| **DeepSeek V4 Flash 07/31** | Full access             | Fast coding and tool use; capped at one session a day              |
| **MiniMax M3**              | Full access             | Fast responses with image support                                  |
| **MiMo 2.5**                | Full and limited access | The limited-mode default; balanced performance with image support  |
| **DeepSeek V4 Pro**         | Full access             | Deepest reasoning; shares DeepSeek's one session a day             |

While upstream prices are high, two things are **temporary**: V4 Flash uses a premium session rather than being unlimited, and the DeepSeek models may serve from a quantized (Q8_0) build to keep costs down. MiMo 2.5 is unlimited in the meantime. Both are intended to be reverted.

Beyond the regular picker:

- **GLM 5.2** is available through earned sessions rather than as an always-unlocked model.
- **Gemini 3.1 Flash Lite** powers specialist tasks such as file finding and research rather than appearing in the main picker.

Availability and limits depend on your access tier, product, and current capacity. Freebuff Desktop can also run locally installed Claude Code and Codex agents using your existing provider account; those connected models are separate from Freebuff's included catalog.

## How Freebuff works

Freebuff uses specialized agents instead of sending every task through one model and one prompt. Depending on the task, agents gather context, plan, edit or research, run tools, and review the result.

- **Codebase context** — File-finding agents map the relevant parts of a project before editing.
- **Implementation and review** — Agents can divide work, make changes, run commands, and inspect the result.
- **Research and browser use** — Agents can investigate documentation and test applications in a real browser.
- **Parallel local work** — Desktop isolates concurrent agents in separate workspaces.
- **Hosted environments** — Web and Cloud provide sandboxes, previews, terminals, and deployment workflows.

## Free access

Freebuff is available in every country. Supported regions receive full access; other regions and VPN users receive limited access, currently MiMo 2.5 with three one-hour sessions per day, earnable up to seven.

Text ads support the included models. Freebuff shows the applicable session limits and any model-specific data-use notice before you start.

<!-- BEGIN GENERATED FREEBUFF DATA USE -->

**Is my data used to train AI?** Only when a model or feature says data may be used for AI training. Freebuff or the provider may then keep submissions to develop, train, test, evaluate, fine-tune, and improve AI models or products.

**How is my data used and stored?** We use prompts, messages, code, files, and repository data to provide the service. We may analyze prompts and messages—including pasted content—to personalize ads, using Freebuff systems and service providers acting on our behalf. Separate uploads and connected repositories are not provided to advertising providers. Where required by law, we provide advertising choices and honor recognized opt-out signals; elsewhere, this processing may be required to use the free service. See the Privacy Policy for retention and details.

See the [Privacy Policy](https://freebuff.com/privacy-policy) for complete details.

<!-- END GENERATED FREEBUFF DATA USE -->

## Contributing

Freebuff is a TypeScript monorepo built with Bun. Contributions to the products, agents, tools, documentation, and underlying runtime are welcome.

Local development requires Docker and a configured `.env.local`; see the
[Contributing Guide](./CONTRIBUTING.md) before starting the services.

```bash
git clone https://github.com/CodebuffAI/freebuff.git
cd freebuff
bun install
bun up
```

Start the CLI separately with:

```bash
bun start-cli
```

See the [Contributing Guide](./CONTRIBUTING.md), [development guide](./docs/development.md), and [testing guide](./docs/testing.md) for environment setup and the checks to run before opening a pull request.

## Built on Codebuff

Freebuff is built on [Codebuff](https://codebuff.com), the open multi-agent framework that powers its orchestration, tools, and SDK. To create custom agents or embed them in another application, see the [Codebuff documentation](https://codebuff.com/docs) and [`@codebuff/sdk`](https://www.npmjs.com/package/@codebuff/sdk).

## Links

- [Website](https://freebuff.com)
- [GitHub](https://github.com/CodebuffAI/freebuff)
- [Discord](https://discord.gg/yXG3w7wxfs)
- [Privacy Policy](https://freebuff.com/privacy-policy)
- [License](./LICENSE)
