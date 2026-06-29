# Openbuff Local/BYOK Provider Mode

Openbuff is local-first software focused entirely on local/BYOK operation with no backend fallback, credits, or Openbuff subscription. You provide your own keys for user-configured providers (such as OpenAI, Anthropic/Claude, OpenRouter, or local models). Openbuff does not require hosted authentication, credits, run tracking, or hosted model inference.

There is absolutely no backend fallback. Every LLM request must resolve to either:

1. an OpenAI-compatible or Anthropic-compatible provider in `openbuff.json`, or
2. a configured ChatGPT/Codex OAuth provider for supported OpenAI models.

Legacy `codebuff.json` / `manicode` config paths and most `CODEBUFF_*` env-var aliases were removed in the BYOK legacy purge; `openbuff.json` and `OPENBUFF_*` are now the primary names. The sole exception is `CODEBUFF_API_KEY`, accepted as a fallback for `OPENBUFF_API_KEY`. See [docs/configuration.md](./configuration.md) for the full config layering and merge semantics.

## Start Openbuff

```bash
openbuff          # primary binary
# codebuff --local  # retained only where the legacy binary alias is installed
```

Openbuff is always local/BYOK — there is no cloud-mode toggle.

## Configure providers

Openbuff looks for provider config in this order (see
[docs/configuration.md](./configuration.md) for full layering details):

1. `OPENBUFF_PROVIDER_CONFIG` — explicit env var; when set, only this path is
   loaded
2. `~/.config/openbuff/provider-config.json` — user-global config
3. `~/.config/openbuff/openbuff.json` — user-global config (alternate name)
4. `openbuff.json` in the current directory and each ancestor directory up to
   (and including) the user's home directory — project-local config

The quickest setup path is the built-in preset command:

```text
/setup opencode-go
/setup openai
/setup anthropic
/setup codex
/setup openrouter
/setup ollama
/setup glm
/setup bedrock
/setup freemodel
```

Use `/provider status` to inspect the loaded config and missing environment variables.
Use `/models` to open the model routing picker.

### Plan artifact commands (PlanLink)

Durable plan artifacts live under `.agents/sessions/<plan>/` and are
attached to a TUI session via PlanLink. The available slash commands are:

- `/resume-plan` — re-attach the current session to an existing plan
  artifact and rehydrate its working context.
- `/update-plan` — open the plan artifact for an incremental edit pass.
- `/plan-status` — print the current task/milestone status from
  `STATUS.md`.
- `/lessons` — append or review lesson notes captured during the plan.

For agent-driven updates, prefer `update_plan_status` for incremental
`STATUS.md` and lesson-note edits (it preserves user prose), and reserve
`create_plan` for whole-artifact creation or rewrite. See
[Agents and Tools](./agents-and-tools.md) for tool details.

For guided setup/configuration inside the TUI:

```text
/provider
/provider add
/provider status
/provider connect codex
/provider disconnect codex
/models configure
/models set mode plan codex/gpt-5.5
/models set agent code-reviewer openai/gpt-5.5
/models set editor-proposal 2 opencode-go/glm-5.1
/models set editor-selector codex/gpt-5.5
```

Openbuff supports OpenAI-compatible providers, Anthropic-compatible Claude
Messages API providers, and a first-class `chatgpt-oauth` provider for a
ChatGPT/Codex subscription:

```json
{
  "defaultModel": "openai/gpt-5.5",
  "modes": {
    "default": "openai/gpt-5.5",
    "plan": "openai/gpt-5.5"
  },
  "agents": {
    "base2": "openai/gpt-5.5",
    "thinker": "codex/gpt-5.5",
    "code-searcher": "local/qwen-coder"
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
    "anthropic": {
      "type": "anthropic-compatible",
      "baseURL": "https://api.anthropic.com",
      "apiKeyEnv": "ANTHROPIC_API_KEY",
      "models": ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"]
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

Model routing is driven entirely by `openbuff.json` / `routes.json` — there is no
hardcoded per-agent model fallback. For each agent step:

1. `modes.default` or `modes.plan` overrides the built-in root agents (`base`, `base2` in default mode; `base-plan`, `base2-plan` in plan mode).
2. `agents[agentId]` overrides subagents and other non-mode agents when present.
3. `defaultModel` overrides every remaining agent when present.
4. An explicit `model` passed by the caller is a last-resort fallback.
5. The resulting requested model is matched against provider `models`.
6. If nothing is configured, Openbuff fails with a hard error: `No model
   configured for agent '<id>'. Run /setup or set defaultModel (or
   agents['<id>']) in your openbuff.json.`

Failover to backup providers on auth/server errors is a separate layer on top
of routing — see the [Failover routing](./configuration.md#failover-routing)
subsection for the `failoverModels` field, eligible HTTP status codes
(401/403/5xx), the no-content-yielded gate, and the `preferModelParam` bypass.

Agent keys may use the exact ID (`thinker`), a published ID
(`publisher/agent@1.2.3`), or the unversioned/unpublished short ID.

Provider `models` can be either a list:

```json
{
  "providers": {
    "opencode-go": {
      "type": "openai-compatible",
      "baseURL": "https://opencode.ai/zen/go/v1",
      "apiKeyEnv": "OPENCODE_GO_API_KEY",
      "models": [
        "glm-5.1",
        "glm-5",
        "kimi-k2.6",
        "kimi-k2.5",
        "mimo-v2.5-pro",
        "mimo-v2.5",
        "qwen3.6-plus",
        "qwen3.5-plus",
        "minimax-m2.7",
        "minimax-m2.5",
        "deepseek-v4-pro",
        "deepseek-v4-flash"
      ]
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
