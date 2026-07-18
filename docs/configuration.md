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
   config file (or a directory of fragments). When set, Openbuff loads _only_
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
      "models": ["gpt-5.5", "gpt-5.4-mini"],
    },
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
      "timeoutSeconds": 240,
    },
  ],
}
```

### Model routing resolution

For each agent step, Openbuff resolves the model in this priority order:

1. `modes[mode]` for the built-in root agents (`base`, `base2` in default mode; `base-plan`, `base2-plan` in plan mode).
2. `agents[agentId]` for subagents and non-mode agents.
3. `defaultModel` for anything not matched above.
4. An explicit `model` passed by the caller (last resort).
5. **Hard error** — if nothing is configured, Openbuff throws:
   `No model configured for agent '<id>'. Run /setup or set defaultModel
(or agents['<id>']) in your openbuff.json.`

There is **no hardcoded per-agent fallback**. The `model:` field on agent
templates is documentation of intent only — it is never read at runtime. This
keeps `openbuff.json` / `routes.json` authoritative for BYOK routing.

Fresh presets seed routes for shipped implementation, repair, review, and specialist agents. These route entries reuse the selected preset model; they do not add provider definitions or credentials. Existing installations preserve their provider settings, and a user with one configured model can route every agent to that same model. `providers.json` changes only when a provider itself is added, removed, or edited.

### Model discovery auth

OpenAI-compatible providers can discover available models from a provider
endpoint. Inferred discovery endpoints use `<baseURL>/models` (or provider-
specific auto-detection such as Ollama `/api/tags`). A `discovery.endpoint`
lets you point model discovery at a custom catalog endpoint without blocking
local/BYOK workflows.

When a provider has `apiKeyEnv`, discovery auth is controlled by
`discovery.auth`:

- `auto` (default): send `Authorization: Bearer <apiKeyEnv>` for inferred
  endpoints and explicit endpoints on the same origin as `baseURL`; omit it for
  explicit cross-origin endpoints.
- `provider`: always send the provider Authorization header, including to a
  cross-origin custom discovery endpoint you explicitly trust.
- `none`: never send the provider Authorization header for discovery.

```jsonc
{
  "providers": {
    "custom": {
      "type": "openai-compatible",
      "baseURL": "https://api.example.com/v1",
      "apiKeyEnv": "EXAMPLE_API_KEY",
      "models": [],
      "discovery": {
        "strategy": "custom",
        "endpoint": "https://catalog.example.com/models",
        "auth": "provider",
        "arrayPath": "results.models",
        "idPath": "slug",
      },
    },
  },
}
```

### Failover routing

Failover is a _secondary_ layer that sits on top of the model-routing
resolution above. It does not change how a request's primary model is chosen;
it only kicks in _after_ the primary model has been selected and the provider
request has failed in a failover-eligible way.

The `failoverModels` field (top-level in `openbuff.json` / `routes.json`)
lists model IDs to try as backup providers when the primary fails:

```jsonc
{
  "defaultModel": "openai/gpt-5.5",
  "failoverModels": [
    "openrouter/anthropic/claude-sonnet-4.5",
    "opencode-go/glm-5.1",
  ],
}
```

Behavior, matched to the implementation in `sdk/src/impl/failover.ts` and
`sdk/src/impl/llm.ts`:

- **Entry list is model IDs, not provider IDs.** Each entry is routed through
  the same provider-resolution step as the primary, so it must resolve to a
  provider in `providers`.
- **Primary is always attempted first.** The failover list is deduped against
  the primary, so a `failoverModels` entry that repeats the primary does not
  cause a redundant same-model attempt (`resolveModelsToTry`).
- **Duplicate backups are collapsed automatically.** `resolveModelsToTry` also
  dedupes _within_ `failoverModels` itself, preserving first-seen order — so a
  misconfigured list like `["backup-a", "backup-a", "backup-b"]` is treated as
  `["backup-a", "backup-b"]` and the loop never wastefully retries the same
  backup model twice.
- **Failover-eligible errors:** `401`, `403` (auth) and `500`, `502`, `503`,
  `504` (server). These match `FAILOVER_ELIGIBLE_STATUS_CODES`. Auth errors
  failover immediately (the inner retry loop does not retry them); 5xx are
  retried first by the inner loop, and only failover once retries exhaust.
- **Retry-only carve-out:** `429` (rate limit) and `408` (timeout) are **not**
  failover-eligible — backoff is the proven response and failing over on 429
  risks cascading load across providers.
- **No-content-yielded gate:** failover fires **only when no content has been
  yielded yet**, so partial output is never duplicated across attempts. If the
  stream has already produced tokens, the error surfaces instead.
- **`preferModelParam` bypass:** on each backup attempt the failover loop sets
  `preferModelParam: failoverIndex > 0` when resolving the agent's model. This
  makes the explicit backup model ID win over mode/agent/defaultModel routing
  for that attempt, so each `failoverModels` entry is actually tried instead
  of being silently re-resolved back to the primary via `openbuff.json`
  routing. The primary attempt (index 0) still honors routing normally.

Failover is independent of `fileChangeHooks`: it is a provider-request-level
mechanism, not a post-edit verification gate.

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
          "quality": { "tier": "frontier" },
        },
      },
    },
  },
}
```

This repo's `openbuff.d/providers.json` sets
`defaultCapabilities.context.windowTokens: 500000` on every provider as a
fallback baseline. A model that does not declare an explicit
`modelCapabilities[modelId].context.windowTokens` override therefore trims at
~450k tokens (500k − 10% reserve) rather than getting no trimming at all.
Per-model overrides still win over the provider default — declare
`context.windowTokens` on a model when its true context window differs from the
500k baseline. (The 500k value is a repo-local config choice in
`defaultCapabilities`, the field that is read; it does not revive the removed
legacy top-level `contextWindowTokens` field.)

### Indexing and retrieval

The `indexing` config (loaded from `openbuff.d/indexing.json`) controls the
local repository index used by `query_index`. Lexical and graph metadata stay
on the local machine. Semantic indexing is opt-in and sends a bounded sample of
each eligible file (path, symbols, headings, concepts, and up to 4,000
characters of implementation text) to the embedding model configured by the
user. That can incur provider cost and disclose source to that provider, so do
not enable it for a repository whose source may not be sent to the selected
BYOK provider.

```jsonc
{
  "indexing": {
    "enabled": true,
    "cacheDir": ".codebuff-index",
    "exclude": [],
    "maxFiles": 20000,
    "weights": {
      "lexical": {
        "fileName": 5,
        "path": 2,
        "symbol": 3,
        "heading": 2.5,
        "concept": 1.5,
        "import": 1,
      },
      "graph": {
        "defines": 1,
        "imports": 0.7,
        "references": 0.9,
        "containsHeading": 0.8,
        "mentions": 0.6,
        "calls": 1.1,
      },
      "semanticBlend": 1,
    },
    "semantic": {
      "enabled": false,
      "model": "openai/text-embedding-3-small",
    },
  },
}
```

- `enabled` (`true`) — disables all index construction and queries when false.
- `cacheDir` (`.codebuff-index`) — must be one hidden directory name and may
  not be `.git`. Openbuff owns this directory and only excludes its owned cache
  output from Git.
- `exclude` (`[]`) — additional directory names or ignore-style paths. The
  walker also enforces mandatory sensitive-path rules, nested `.gitignore` and
  `.openbuffignore` files, and default transient/build exclusions including
  `.agents/sessions`, `.omx`, `node_modules`, build output, caches, and
  generated eval logs. Project-local agent definitions elsewhere under
  `.agents` remain indexable.
- `maxFiles` (`20000`, allowed range `100..100000`) — maximum indexed files.
  Traversal is deterministic. If the cap is reached, status reports partial
  coverage, skipped counts, and uncovered prefixes instead of presenting the
  index as complete.
- `lexical` — term-match weights per match location:
  - `fileName` (5), `path` (2), `symbol` (3), `heading` (2.5),
    `concept` (1.5), `import` (1).
- `graph` — code-graph edge weights:
  - `defines` (1), `imports` (0.7), `references` (0.9),
    `containsHeading` (0.8), `mentions` (0.6), `calls` (1.1).
- `semanticBlend` (1) — how strongly semantic similarity blends into the final
  lexical+graph score. Set it to `0` to disable semantic-only contributions.
- `semantic.enabled` (`false`) and `semantic.model` — opt into embeddings with
  an explicitly configured model. Existing vectors are reused by file content
  hash; only changed files are re-embedded.

All ranking weights must be finite and non-negative. Omitting a weight uses the
default shown above.

#### Index lifecycle, status, and repair

Openbuff loads a compatible cached snapshot immediately, incrementally
reconciles it with filesystem changes, and serves the snapshot as explicitly
`stale` while refresh is running. Cache age alone does not force a full parse or
full re-embedding. A full rebuild is reserved for incompatible configuration or
schema changes, an invalid/unowned cache, or an explicit rebuild request.

Index status distinguishes `disabled`, `building`, `ready`, `stale`,
`degraded`, and `empty`. It also reports semantic state, indexed file count,
age, refresh state, parse diagnostics, and partial-coverage details. In the
CLI, use `/index status` to inspect it, `/index explain <query>` to inspect
ranking evidence, and `/index rebuild` to repair the cache. A degraded index
keeps usable last-known-good metadata where possible; returned paths are still
discovery hints and should be verified with `read_files` or `read_subtree`.

The example at `openbuff.d.example/indexing.json` mirrors these defaults.

## Adaptive reasoning

`adaptiveReasoning` defaults to enabled and never changes the resolved model
or provider. Explicit mode, agent, or default reasoning efforts remain
authoritative. Otherwise, the selected model's declared capabilities choose
high effort for planning/debugging/review, medium for implementation and root
orchestration, and low for retrieval or context compression. Models declaring
reasoning unsupported receive no reasoning parameter. A one-model setup simply
reuses that model for every phase. Set `"adaptiveReasoning": false` to disable
this fallback.

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
    {
      "name": "prettier",
      "command": "prettier --check",
      "filePattern": "**/*.{ts,tsx}",
    },
  ],
}
```

```jsonc
// openbuff.d/hooks.json (project)
{
  "fileChangeHooks": [
    {
      "name": "typecheck-sdk",
      "command": "cd sdk && bun run typecheck",
      "filePattern": "sdk/src/**/*.ts",
      "timeoutSeconds": 240,
    },
    // Override the global prettier hook to also write fixes.
    {
      "name": "prettier",
      "command": "prettier --write",
      "filePattern": "**/*.{ts,tsx}",
    },
  ],
}
```

Merged result (in order): `[prettier (project version), typecheck-sdk]`.

## Harness approval mode

`approvalMode` controls when terminal effects pause for confirmation:

```jsonc
{
  "approvalMode": "balanced", // balanced | strict | allow-all
}
```

- `balanced` is the default. Dependency changes, commits, feature-branch
  pushes, pull requests, and ordinary downloads proceed without prompts.
  Destructive operations, default-branch pushes, releases, deployments,
  migrations, uploads/remote shells, and arbitrary code evaluation ask once.
- `strict` asks for every classified package, Git, remote, or destructive
  effect.
- `allow-all` suppresses approval prompts but does not disable project-root
  containment, mandatory secret filtering, global/system install blocks,
  owned-path staging, or force/delete-push protection.

## File-change hooks (verification gate)

`fileChangeHooks` are the commands Openbuff runs automatically after an agent
edits files. They power the "verification gate" — typechecks, linters, and
tests that block the agent from ending its turn until they pass.

When `autoFileChangeHooks` is unset or `true`, Openbuff also infers safe,
non-mutating default hooks from common project manifests and merges them with
configured `fileChangeHooks` using the concat-with-dedup rules above. Set
`"autoFileChangeHooks": false` to run only explicitly configured hooks.

Inferred hooks currently include:

| Manifest                               | Inferred hooks                                                                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`                         | `bunx eslint .` when `eslint` is listed in `dependencies` or `devDependencies`; `bunx tsc --noEmit` when `typescript` is listed. Openbuff does not infer or execute `package.json` scripts by default. |
| `go.mod`                               | `gofmt -l .` checked through a non-mutating pipeline, `go vet ./...`, `go test ./...`                                                                                                                  |
| `Cargo.toml`                           | `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`                                                                                                                        |
| `pyproject.toml` or `requirements.txt` | `ruff check .`                                                                                                                                                                                         |
| `Gemfile`                              | `rubocop`                                                                                                                                                                                              |
| `Package.swift`                        | `swift-format lint --recursive .`                                                                                                                                                                      |
| `*.csproj`                             | `dotnet format --verify-no-changes`                                                                                                                                                                    |

These commands are validation-only by default. For safety, inferred hooks use fixed
commands selected from dependency/manifest presence; they do not run
repo-controlled `package.json` scripts unless you explicitly add those commands
as configured `fileChangeHooks`. If an inferred tool is missing, the hook
reports the shell error for that command; install the tool, add an overriding
hook with a project-specific command, or disable inferred hooks with
`autoFileChangeHooks: false`.

### Hook fields

```jsonc
{
  "name": "typecheck-sdk", // optional, used for display + dedup identity
  "command": "cd sdk && bun run typecheck", // shell command, run from repo root
  "filePattern": "sdk/src/**/*.ts", // optional glob; hook runs only when a changed file matches
  "timeoutSeconds": 240, // optional; default 180, max 3600
}
```

- A hook **without** `filePattern` runs on every file change.
- A hook **with** `filePattern` runs only when at least one changed file
  matches the glob (matched against the repo-root-relative path).
- Hooks run from the repository root, so use `cd <pkg> && …` to scope a
  command to a package.

### Hook naming convention

The `name` field is a **free-form string** — there is no schema field or
validation enforcing a naming pattern. However, the orchestrator's repair loop
surfaces hook names directly in gate-state boxes and repair guidance (e.g.
`typecheck-sdk failed (exit 1)`), so a consistent prefix convention makes it
immediately clear to the agent _what kind_ of validation failed and how to
react.

**Convention: prefix hook names with their validation category.**

| Prefix       | Purpose                                | Example name         |
| ------------ | -------------------------------------- | -------------------- |
| `typecheck-` | TypeScript / language typechecking     | `typecheck-sdk`      |
| `lint-`      | Linters (eslint, prettier, ruff, etc.) | `lint-cli`           |
| `test-`      | Test suites (unit, integration, e2e)   | `test-agent-runtime` |
| `build-`     | Compilation / bundling                 | `build-sdk`          |

- **Why a convention, not a schema field?** The `FileChangeHook` type has no
  `kind`/`category` field — adding one would require a migration of all
  existing `hooks.json` configs and provider-config merge logic. A naming
  prefix is zero-cost, backward-compatible, and sufficient for the agent to
  infer the failure category from the `hookName` string.
- **Mixed prefixes are fine.** A repo can have both `typecheck-*` and `lint-*`
  hooks; the gate runs all matching hooks and reports each by name.
- **No prefix is also fine** — a hook named `prettier` or `my-custom-check`
  still works; the agent just won't get the category hint in its repair
  guidance.

### Recommended recipe (this repo)

This monorepo has independent `typecheck` scripts per package, so a single
root-level `bun run typecheck` would re-check unrelated packages. The
per-package pattern below scopes each hook to the package whose files changed,
keeping the gate fast and avoiding false blockers from unrelated failures.

```jsonc
// openbuff.d/hooks.json
{
  "fileChangeHooks": [
    {
      "name": "typecheck-common",
      "command": "cd common && bun run typecheck",
      "filePattern": "common/src/**/*.ts",
      "timeoutSeconds": 180,
    },
    {
      "name": "typecheck-sdk",
      "command": "cd sdk && bun run typecheck",
      "filePattern": "sdk/src/**/*.ts",
      "timeoutSeconds": 240,
    },
    {
      "name": "typecheck-cli",
      "command": "cd cli && bun run typecheck",
      "filePattern": "cli/src/**/*.{ts,tsx}",
      "timeoutSeconds": 240,
    },
    {
      "name": "typecheck-agents",
      "command": "cd agents && bun run typecheck",
      "filePattern": "agents/**/*.ts",
      "timeoutSeconds": 180,
    },
    {
      "name": "typecheck-.agents",
      "command": "cd .agents && bun run typecheck",
      "filePattern": ".agents/**/*.ts",
      "timeoutSeconds": 180,
    },
    {
      "name": "typecheck-agent-runtime",
      "command": "cd packages/agent-runtime && bun run typecheck",
      "filePattern": "packages/agent-runtime/src/**/*.ts",
      "timeoutSeconds": 240,
    },
    {
      "name": "typecheck-indexer",
      "command": "cd packages/indexer && bun run typecheck",
      "filePattern": "packages/indexer/src/**/*.ts",
      "timeoutSeconds": 180,
    },
  ],
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
