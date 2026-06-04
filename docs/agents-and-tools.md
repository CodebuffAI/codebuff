# Agents and Tools in Openbuff

Openbuff operates as an orchestrator of specialized, local-first agents. Instead of running model orchestration on a hosted backend, all agent loops, prompt generation, tool calls, and model routing are processed locally on your machine via the `agent-runtime` and `sdk` packages, utilizing your Bring Your Own Key (BYOK) providers.

## Agents

Agents in Openbuff can be either prompt-based or programmatic (utilizing `handleSteps` generator functions).
- Shipped agents reside in the `agents/` monorepo package.
- Project-local or custom agents live in the `.agents/` folder of your project.
- Programmatic agent generator functions execute in a secure sandbox; agent templates define tool permissions and which subagents can be spawned.

### Model Routing and Configuration

Because Openbuff does not rely on a hosted model registry or credit-balance router, all agent routing is configured directly in your local configuration (`openbuff.json` or its legacy alias `codebuff.json`). Under [Local BYOK Mode](./local-mode.md), you map individual agents (e.g., `thinker`, `code-reviewer`, or custom agents) to specific providers and models.

### Shell Shims

You can run individual specialized agents as direct terminal commands without the `openbuff` prefix. This is handled by shell shims:

```bash
openbuff shims install openbuff/base-lite@1.0.0
eval "$(openbuff shims env)"
base-lite "fix this bug"
```

For backward compatibility, the `codebuff` command prefix and legacy shims continue to function identically.

## Tools

Tools represent the capabilities given to agents to interact with your system.
- Tool schemas and validators live in `common/src/tools` as Zod definitions.
- Tool executions are handled securely by the SDK on your local machine (reading/writing files, executing commands, searching codebase).
- Since Openbuff has no hosted proxy backend, tool execution is extremely low-latency, and all outputs are processed directly by your locally configured models.
