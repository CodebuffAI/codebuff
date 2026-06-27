# Openbuff Configuration

Openbuff is local-first / BYOK: all model routing, provider credentials, and
file-change hooks are declared in JSON config files. There is no hosted
backend fallback — every request resolves to a provider you configure.

This document covers where config lives, how multiple config files combine,
and how to wire up `fileChangeHooks` (the verification gate that runs after an
agent edits files).

## Config file locations

Openbuff loads provider config from the following sources, in order. Later
sources override earlier ones (see [Merge semantics](#merge-semantics) for
the exact rules):

1. **`OPENBUFF_PROVIDER_CONFIG`** — explicit env var pointing at a single
   config file (or a directory of fragments). When set, Openbuff loads *only*
   this path and skips the global + ancestor search below.
2. **`~/.config/openbuff/provider-config.json`** — user-global config.
3. **`~/.config/openbuff/openbuff.json`** — user-global config (alternate
   name).
4. **`openbuff.json` in the current directory and each ancestor** up to (and
   including) the user's home directory — project-local config. The ancestor
   walk is bounded by `MAX_ANCESTOR_SCAN_DEPTH` (10) and never crosses above
   `$HOME` unless `OPENBUFF_TRUST_ANCESTOR_CONFIG=1` is set.

> **Credentials** (`credentials.json`, ChatGPT OAuth tokens) live in
> `~/.config/openbuff/credentials.json` — the same global dir, with no
> env-suffix variants. The directory is created `0700` and the credentials
> file `0600`.

### Fragmented configs (`openbuff.d/`)

Any config file may delegate to a directory of fragments via `extends`,
`include`, or `includes` (or an implicit `openbuff.d/` directory sitting
next to the file). A fragment directory is read alphabetically; each `*.json`
file inside is merged in order before the parent file. This repo uses this
pattern:

```
openbuff.json              # root (minimal / pointer)
openbuff.d/
  providers.json           # provider definitions
  routes.json              # defaultModel, modes, agents overrides
  indexing.json            # local index settings
  hooks.json               # fileChangeHooks (see below)
```

## What goes in a config

```jsonc
{
  // Providers you have keys for.
  "providers": {
    "openai": {
      "type": "openai-compatible",
      "baseURL": "https://api.openai.com/v1",
      "apiKeyEnv": "OPENAI_API_KEY",
      "models": ["gpt-5.5", "gpt-5.4-mini"]
    }
  },

  // Routing — openbuff.json / routes.json is the single source of truth.
  "defaultModel": "openai/gpt-5.5",
  "modes": { "default": "openai/gpt-5.5", "plan": "openai/gpt-5.5" },
  "agents": { "thinker": "openai/gpt-5.5", "code-reviewer": "openai/gpt-5.5" },

  // Verification gate — commands run after an agent edits files.
  "fileChangeHooks": [
    {
      "name": "typecheck-sdk",
      "command": "cd sdk && bun run typecheck",
      "filePattern": "sdk/src/**/*.ts",
      "timeoutSeconds": 240
    }
  ]
}
```

### Model routing resolution

For each agent step, Openbuff resolves the model in this priority order:

1. `modes[mode]` for the built-in root agents (`base`, `base2`, `base2-plan`).
2. `agents[agentId]` for subagents and non-mode agents.
3. `defaultModel` for anything not matched above.
4. An explicit `model` passed by the caller (last resort).
5. **Hard error** — if nothing is configured, Openbuff throws:
   `No model configured for agent '<id>'. Run /setup or set defaultModel
   (or agents['<id>']) in your openbuff.json.`

There is **no hardcoded per-agent fallback**. The `model:` field on agent
templates is documentation of intent only — it is never read at runtime. This
keeps `openbuff.json` / `routes.json` authoritative for BYOK routing.

### Model capabilities

Capabilities (context window, image input, reasoning support, pricing, …) are
resolved **only** from explicit metadata in the provider config:

- `provider.defaultCapabilities` — applied to every model under the provider.
- `provider.modelCapabilities[modelId]` — per-model overrides.

Legacy inference from `contextWindowTokens` / `compatibility.*` has been
removed. Declare capabilities explicitly:

```jsonc
{
  "providers": {
    "pioneer": {
      "type": "openai-compatible",
      "baseURL": "https://api.pioneer.ai/v1",
      "apiKeyEnv": "PIONEER_API_KEY",
      "models": ["claude-opus-4-8", "claude-sonnet-4-6"],
      "defaultCapabilities": { "input": { "image": true } },
      "modelCapabilities": {
        "claude-opus-4-8": {
          "context": { "windowTokens": 200000 },
          "quality": { "tier": "frontier" }
        }
      }
    }
  }
}
```

## Merge semantics

When multiple config sources are loaded (global → ancestor → project, or
parent → fragment), Openbuff merges them with **override wins** semantics.
Most fields use shallow-record merge (`{ ...base, ...override }`): the
override entry replaces the base entry for the same key. Providers, routes,
modes, agents, and reasoning efforts all follow this rule.

### `fileChangeHooks` — concat-with-dedup

`fileChangeHooks` is the exception: it is **concatenated** rather than
replaced, so a project can extend the global hook set without re-declaring it.

- **Identity key:** `command + filePattern + name`. Two hooks with the same
  command, filePattern, and name are considered the same hook.
- **Override wins on conflict:** if a project hook matches a global hook's
  identity, the project's version replaces the global one (e.g. to raise a
  timeout or tweak a command) but keeps the global hook's position in the
  ordering.
- **Ordering:** base (global) entries that are not overridden come first, in
  their original order, followed by override-only entries in override order.
- **Dedup within base:** duplicate entries inside the same layer are collapsed.

This means a global `~/.config/openbuff/openbuff.json` can define a broad
typecheck hook, and a project `openbuff.json` (or `openbuff.d/hooks.json`)
can add project-specific hooks or tune the global one without losing either.

Example:

```jsonc
// ~/.config/openbuff/openbuff.json (global)
{
  "fileChangeHooks": [
    { "name": "prettier", "command": "prettier --check", "filePattern": "**/*.{ts,tsx}" }
  ]
}
```

```jsonc
// openbuff.d/hooks.json (project)
{
  "fileChangeHooks": [
    { "name": "typecheck-sdk", "command": "cd sdk && bun run typecheck", "filePattern": "sdk/src/**/*.ts", "timeoutSeconds": 240 },
    // Override the global prettier hook to also write fixes.
    { "name": "prettier", "command": "prettier --write", "filePattern": "**/*.{ts,tsx}" }
  ]
}
```

Merged result (in order): `[prettier (project version), typecheck-sdk]`.

## File-change hooks (verification gate)

`fileChangeHooks` are the commands Openbuff runs automatically after an agent
edits files. They power the "verification gate" — typechecks, linters, and
tests that block the agent from ending its turn until they pass.

### Hook fields

```jsonc
{
  "name": "typecheck-sdk",            // optional, used for display + dedup identity
  "command": "cd sdk && bun run typecheck", // shell command, run from repo root
  "filePattern": "sdk/src/**/*.ts",   // optional glob; hook runs only when a changed file matches
  "timeoutSeconds": 240                // optional; default 180, max 3600
}
```

- A hook **without** `filePattern` runs on every file change.
- A hook **with** `filePattern` runs only when at least one changed file
  matches the glob (matched against the repo-root-relative path).
- Hooks run from the repository root, so use `cd <pkg> && …` to scope a
  command to a package.

### Recommended recipe (this repo)

This monorepo has independent `typecheck` scripts per package, so a single
root-level `bun run typecheck` would re-check unrelated packages. The
per-package pattern below scopes each hook to the package whose files changed,
keeping the gate fast and avoiding false blockers from unrelated failures.

```jsonc
// openbuff.d/hooks.json
{
  "fileChangeHooks": [
    { "name": "typecheck-common",       "command": "cd common && bun run typecheck",                "filePattern": "common/src/**/*.ts",            "timeoutSeconds": 180 },
    { "name": "typecheck-sdk",          "command": "cd sdk && bun run typecheck",                   "filePattern": "sdk/src/**/*.ts",               "timeoutSeconds": 240 },
    { "name": "typecheck-cli",          "command": "cd cli && bun run typecheck",                    "filePattern": "cli/src/**/*.{ts,tsx}",         "timeoutSeconds": 240 },
    { "name": "typecheck-agents",       "command": "cd agents && bun run typecheck",                 "filePattern": "agents/**/*.ts",                "timeoutSeconds": 180 },
    { "name": "typecheck-.agents",      "command": "cd .agents && bun run typecheck",               "filePattern": ".agents/**/*.ts",               "timeoutSeconds": 180 },
    { "name": "typecheck-agent-runtime","command": "cd packages/agent-runtime && bun run typecheck","filePattern": "packages/agent-runtime/src/**/*.ts", "timeoutSeconds": 240 },
    { "name": "typecheck-indexer",      "command": "cd packages/indexer && bun run typecheck",      "filePattern": "packages/indexer/src/**/*.ts",   "timeoutSeconds": 180 }
  ]
}
```

### Tips

- **Scope by package** to avoid one package's failing test blocking work in
  another. Each hook's `filePattern` should match only the files that hook
  validates.
- **Use `name`** so the gate output identifies which hook ran, and so a
  project can override a global hook by identity.
- **Set `timeoutSeconds`** generously for typechecks (240s+) — a timed-out
  hook is treated as a failure and blocks the turn.
- **Hooks are additive across layers.** Put universally-useful hooks (e.g.
  prettier) in `~/.config/openbuff/openbuff.json` and project-specific hooks
  in the repo's `openbuff.d/hooks.json`. See
  [Merge semantics](#filechangehooks--concat-with-dedup) for how they combine.

## See also

- [Local / BYOK provider mode](./local-mode.md) — provider setup, presets,
  `/setup`, `/provider`, `/models` commands.
- [Environment variables](./environment-variables.md) — `apiKeyEnv` names,
  `OPENBUFF_PROVIDER_CONFIG`, `OPENBUFF_TRUST_ANCESTOR_CONFIG`.
- [Codebuff → Openbuff migration](./codebuff-to-openbuff-migration.md) —
  notes on the legacy brand rename.
