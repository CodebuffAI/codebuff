# Openbuff Local/BYOK Provider Mode

Openbuff is an independent, local-first fork of Codebuff focused entirely on a Bring Your Own Key (BYOK) model with no backend fallback, credits, or subscriptions. You provide your own keys for user-configured providers (such as OpenAI, OpenRouter, or local models). Openbuff does not require Codebuff cloud authentication, credits, hosted run tracking, or hosted model inference.

There is absolutely no backend fallback. Every LLM request must resolve to either:

1. an OpenAI-compatible provider in `openbuff.json`, or
2. an optional direct ChatGPT/Codex OAuth route for supported OpenAI models.

To maintain seamless compatibility, all existing technical compatibility aliases remain fully supported and explained below.

## Start Openbuff

```bash
openbuff
# compatibility while this fork still builds the old binary name:
codebuff --local
```

`OPENBUFF_LOCAL_MODE=true` is the default. `CODEBUFF_LOCAL_MODE=true` is still
accepted as a compatibility alias.

## Configure providers

Openbuff looks for provider config in this order:

1. `OPENBUFF_PROVIDER_CONFIG`
2. `CODEBUFF_PROVIDER_CONFIG` compatibility alias
3. `~/.config/openbuff/provider-config.json`
4. `~/.config/openbuff/openbuff.json`
5. `~/.config/openbuff-<env>/provider-config.json` compatibility path
6. `~/.config/openbuff-<env>/openbuff.json` compatibility path
7. `~/.config/manicode/provider-config.json` compatibility path
8. `~/.config/manicode/codebuff.json` compatibility path
9. `openbuff.json` in the current directory or any parent directory
10. `codebuff.json` compatibility path in the current directory or any parent
   directory

The quickest setup path is the built-in preset command:

```text
/setup opencode-go
/setup openai
/setup codex
/setup openrouter
/setup ollama
/setup glm
```

Use `/provider` to inspect the loaded config and missing environment variables.
Use `/models` to inspect mode-to-agent-to-model routing.

For guided setup/configuration inside the TUI:

```text
/provider add
/provider connect codex
/provider disconnect codex
/models configure
/models set mode plan codex/gpt-5.5
/models set agent code-reviewer openai/gpt-5.5
/models set editor-proposal 2 opencode-go/glm-5.1
/models set editor-selector codex/gpt-5.5
```

Openbuff supports OpenAI-compatible providers and a first-class
`chatgpt-oauth` provider for a ChatGPT/Codex subscription:

```json
{
  "defaultModel": "openai/gpt-5.5",
  "modes": {
    "default": "openai/gpt-5.5",
    "lite": "openai/gpt-5.4-mini",
    "max": "openai/gpt-5.5",
    "plan": "openai/gpt-5.5"
  },
  "agents": {
    "base2": "openai/gpt-5.5",
    "thinker": "codex/gpt-5.5",
    "code-searcher": "local/qwen-coder"
  },
  "editorMultiPrompt": {
    "proposalModels": [
      "opencode-go/kimi-k2.6",
      "opencode-go/glm-5.1",
      "opencode-go/deepseek-v4-pro"
    ],
    "selectorModel": "codex/gpt-5.5"
  },
  "providers": {
    "openai": {
      "type": "openai-compatible",
      "baseURL": "https://api.openai.com/v1",
      "apiKeyEnv": "OPENAI_API_KEY",
      "supportsStructuredOutputs": true,
      "compatibility": {
        "stripCacheControl": true,
        "stringifyTextContent": true,
        "supportsTools": true,
        "supportsStopSequences": false,
        "stripProviderMetadata": true
      },
      "models": ["gpt-5.5", "gpt-5.4-mini", "gpt-5.4-nano"]
    },
    "zai": {
      "type": "openai-compatible",
      "baseURL": "https://api.z.ai/api/paas/v4",
      "apiKeyEnv": "ZAI_API_KEY",
      "models": ["glm-4.6"]
    },
    "codex": {
      "type": "chatgpt-oauth",
      "models": ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.1-codex"]
    },
    "local": {
      "type": "openai-compatible",
      "baseURL": "http://localhost:11434/v1",
      "models": ["qwen-coder"]
    }
  }
}
```

## How model routing works

For each agent step:

1. The agent's built-in model is looked up.
2. `modes.default`, `modes.lite`, `modes.max`, or `modes.plan` overrides the
   built-in root agents (`base2`, `base2-lite`, `base2-max`, `base2-plan`).
3. `agents[agentId]` overrides subagents and other non-mode agents when present.
4. `defaultModel` overrides every remaining agent when present.
5. The resulting requested model is matched against provider `models`.
6. If nothing matches, Openbuff fails with a clear config error.

Agent keys may use the exact ID (`thinker`), a published ID
(`publisher/agent@1.2.3`), or the unversioned/unpublished short ID.

### Multi-prompt editor routing

`editor-multi-prompt` is a best-of-N editor. It spawns proposal agents, compares
their proposed diffs, then applies only the selected implementation. Configure
the proposal and selector models with:

```json
{
  "editorMultiPrompt": {
    "proposalModels": [
      "opencode-go/kimi-k2.6",
      "opencode-go/glm-5.1",
      "opencode-go/deepseek-v4-pro"
    ],
    "selectorModel": "codex/gpt-5.5"
  }
}
```

This maps to agent overrides for `editor-implementor-proposal-1`,
`editor-implementor-proposal-2`, `editor-implementor-proposal-3`, and
`best-of-n-selector2`. If more prompts are supplied than configured proposal
models, Openbuff keeps using the last proposal agent.

Provider `models` can be either a list:

```json
{
  "providers": {
    "opencode-go": {
      "type": "openai-compatible",
      "baseURL": "https://opencode.ai/zen/go/v1",
      "apiKeyEnv": "OPENCODE_GO_API_KEY",
      "models": ["glm-5.1", "glm-5", "kimi-k2.6", "kimi-k2.5", "mimo-v2.5-pro", "mimo-v2.5", "qwen3.6-plus", "qwen3.5-plus", "minimax-m2.7", "minimax-m2.5", "deepseek-v4-pro", "deepseek-v4-flash"]
    }
  },
  "defaultModel": "opencode-go/kimi-k2.6"
}
```

For `chatgpt-oauth`, run `/provider connect codex` before routing traffic to
the provider. Disconnect or rotate the subscription credentials with
`/provider disconnect codex` and connect again.

or a mapping from Openbuff-requested model to provider model:

```json
{
  "providers": {
    "openai": {
      "type": "openai-compatible",
      "baseURL": "https://api.openai.com/v1",
      "apiKeyEnv": "OPENAI_API_KEY",
      "models": {
        "anthropic/claude-opus-4.7": "gpt-5.5",
        "anthropic/claude-sonnet-4.6": "gpt-5.5"
      }
    }
  }
}
```

## Provider compatibility flags

Strict OpenAI-compatible APIs differ on which request fields they accept. Each
provider can declare compatibility behavior:

```json
{
  "compatibility": {
    "stripCacheControl": true,
    "stringifyTextContent": true,
    "supportsTools": true,
    "supportsRequiredToolChoice": true,
    "supportsStopSequences": false,
    "stripProviderMetadata": true
  }
}
```

- `stripCacheControl`: removes Anthropic/OpenRouter prompt-cache metadata.
- `stringifyTextContent`: sends text-only user messages as a plain string.
- `supportsTools`: set `false` for chat-only providers that reject tool schemas.
- `supportsRequiredToolChoice`: set `false` for providers that accept tools but reject `tool_choice: "required"`.
- `supportsStopSequences`: set `true` only for OpenAI-compatible providers that accept the `stop` request field; otherwise Openbuff enforces stop sequences locally.
- `stripProviderMetadata`: omits Codebuff/OpenRouter-specific provider metadata.

## Smoke test

After configuring a provider and exporting its API key:

```bash
bun run smoke:openbuff
```
