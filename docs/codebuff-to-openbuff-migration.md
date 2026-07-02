# CODEBUFF → OPENBUFF Migration Reference

> **Purpose:** This document catalogs every CODEBUFF→OPENBUFF transition point in the Openbuff codebase. Use it to gauge migration progress, identify remaining work, and avoid regressions when adding new features that should use the Openbuff brand.

## Overview

Openbuff is a fork of Codebuff focused on local-first, bring-your-own-key (BYOK) usage. Current state:

- **Openbuff names** (`OPENBUFF_*`, `openbuff.json`, `openbuff` binary) are the primary and, for routing/config paths, the only names.
- **Codebuff names** (`CODEBUFF_*`, `codebuff.json`, `codebuff` binary) are **selectively retained** as compatibility aliases only where explicitly marked in the tables below. The BYOK legacy purge **removed** the routing/config aliases (`CODEBUFF_LOCAL_MODE`, `CODEBUFF_PROVIDER_CONFIG`, `codebuff.json`, `~/.config/manicode/*`, `~/.config/openbuff-<env>/`) — those no longer work, and there is no migration shim (existing users re-auth).
- The codebase uses `isLocalMode()` to detect BYOK mode and brand accordingly.

### Migration Philosophy

- **Openbuff names are the source of truth** — use `OPENBUFF_*` env vars, `openbuff.json` paths, and `openbuff` branding.
- **Retained Codebuff aliases are compatibility-only** — keep them working only where the tables below mark them as `✅ Alias`; do not introduce new ones.
- **Purged Codebuff/Manicode aliases are gone** — do not reintroduce removed routing/config aliases; surface a clear config error instead (see `docs/configuration.md`).
- **Branding is dynamic** — Openbuff should be the default user-facing brand; legacy Codebuff names should appear only when documenting retained compatibility surfaces.

### Branding Checklist

When adding or editing user-facing docs, examples, CLI help text, website copy, or template files:

- Use **Openbuff** for product branding and prose.
- Use `openbuff`, `OPENBUFF_*`, and `openbuff.json` for new commands, environment variables, and config examples.
- Keep `@codebuff/*`, `CodebuffClient`, `CODEBUFF_*`, `codebuff.json`, `codebuff-local-cli`, and `codebuff/*` agent IDs only when they are the implemented compatibility/API names.
- Label compatibility names explicitly as legacy, compatibility, or current SDK/workspace names.
- Do not link users to upstream Codebuff repositories, issues, docs, support, or star badges unless the context is explicitly historical or compatibility-focused.
- If a new `OPENBUFF_*` alias is documented, verify the alias is implemented in code first.

---

## 1. Environment Variables

### 1.1 Local Mode Control

| Variable | Status | File |
|----------|--------|------|
| `OPENBUFF_LOCAL_MODE` | ✅ Primary | `common/src/constants/local-mode.ts` |
| `CODEBUFF_LOCAL_MODE` | ❌ Removed (BYOK purge) | `common/src/constants/local-mode.ts` |

**Detail:** `isLocalModeEnabled()` checks `OPENBUFF_LOCAL_MODE`, defaults to `true` (local mode on). The `CODEBUFF_LOCAL_MODE` fallback was removed in the BYOK legacy purge.

```
common/src/constants/local-mode.ts
  - OPENBUFF_LOCAL_MODE_ENV_VAR = 'OPENBUFF_LOCAL_MODE'
```

### 1.2 Provider Config Path

| Variable | Status | File |
|----------|--------|------|
| `OPENBUFF_PROVIDER_CONFIG` | ✅ Primary | `sdk/src/provider-config.ts` |
| `CODEBUFF_PROVIDER_CONFIG` | ❌ Removed (BYOK purge) | `sdk/src/provider-config.ts` |

### 1.3 API Key

| Variable | Status | File |
|----------|--------|------|
| `OPENBUFF_API_KEY` | ✅ Primary | `sdk/src/env.ts` |
| `CODEBUFF_API_KEY` | ✅ Compatibility fallback | `sdk/src/env.ts`, `common/src/constants/paths.ts` |

**Detail:** The SDK resolves the API key as `process.env.OPENBUFF_API_KEY ?? process.env.CODEBUFF_API_KEY` (`sdk/src/env.ts`), so `OPENBUFF_API_KEY` is primary and `CODEBUFF_API_KEY` is the sole retained runtime fallback. Used for legacy/hosted Codebuff API auth and live integration tests. BYOK mode doesn't require it.
```
sdk/src/env.ts
  - return process.env.OPENBUFF_API_KEY ?? process.env.CODEBUFF_API_KEY
common/src/constants/paths.ts
  - API_KEY_ENV_VAR = 'CODEBUFF_API_KEY'
```

### 1.4 BYOK OpenRouter

| Variable | Status | File |
|----------|--------|------|
| `CODEBUFF_BYOK_OPENROUTER` | ⚠️ Only name | `common/src/constants/byok.ts` |

**Detail:** The header is `x-openrouter-api-key`. This env var was never given an Openbuff alias.

### 1.5 ChatGPT OAuth Token

| Variable | Status | File |
|----------|--------|------|
| `CODEBUFF_CHATGPT_OAUTH_TOKEN` | ✅ Compatibility fallback (legacy precedence) | `common/src/constants/chatgpt-oauth.ts`, `sdk/src/env.ts` |
| `OPENBUFF_CHATGPT_OAUTH_TOKEN` | ✅ Alias | `common/src/constants/chatgpt-oauth.ts`, `common/src/env-ci.ts` |

**Detail:** The SDK resolves the ChatGPT OAuth token as `process.env.CODEBUFF_CHATGPT_OAUTH_TOKEN ?? process.env.OPENBUFF_CHATGPT_OAUTH_TOKEN` (`sdk/src/env.ts`). Note the **reversed precedence** vs. the API key: the legacy `CODEBUFF_*` name takes precedence over the `OPENBUFF_*` alias here (pre-existing inconsistency). `common/src/env-ci.ts` mirrors both into the CI env contract.

### 1.6 CI/Internal Variables

| Variable | Status | File | Notes |
|----------|--------|------|-------|
| `CODEBUFF_GITHUB_ACTIONS` | ⚠️ Only name | `common/src/env.ts` | `IS_CI` check |
| `CODEBUFF_GITHUB_TOKEN` | ✅ Compatibility fallback | `cli/scripts/release.ts` | Release script reads `OPENBUFF_GITHUB_TOKEN` (primary) then `CODEBUFF_GITHUB_TOKEN` (fallback); eval/CI scripts still use `CODEBUFF_GITHUB_TOKEN` only |
| `CODEBUFF_IS_BINARY` | ⚠️ Only name | `cli/scripts/build-binary.ts` | Build flag |
| `CODEBUFF_CLI_VERSION` | ⚠️ Only name | `cli/scripts/build-binary.ts` | Build flag |
| `CODEBUFF_CLI_TARGET` | ⚠️ Only name | `cli/scripts/build-binary.ts` | Build flag |
| `CODEBUFF_CLI_EDITOR` | ⚠️ Only name | `cli/src/types/env.ts`, `common/src/types/contracts/env.ts` | CLI editor override |
| `CODEBUFF_EDITOR` | ⚠️ Only name | `cli/src/types/env.ts` | Fallback editor |
| `CODEBUFF_GIT_BASH_PATH` | ⚠️ Only name | `sdk/src/tools/run-terminal-command.ts` | Windows bash.exe path override |
| `CODEBUFF_FULL_TELEMETRY` | ⚠️ Only name | `common/src/util/analytics-sampling.ts` | Debug telemetry |
| `CODEBUFF_RG_PATH` | ⚠️ Only name | `sdk/src/env.ts` | Ripgrep binary path |
| `CODEBUFF_WASM_DIR` | ⚠️ Only name | `sdk/src/env.ts` | WASM directory |
| `CODEBUFF_NPM_REGISTRY` | ⚠️ Only name | `cli/scripts/build-binary.ts` | Build flag |
| `NEXT_PUBLIC_CODEBUFF_APP_URL` | ⚠️ Required primary field | `common/src/env-schema.ts` | Web app URL |
| `NEXT_PUBLIC_OPENBUFF_APP_URL` | ✅ Optional alias field | `common/src/env-schema.ts` | Optional public client env field; current primary app URL accessors still read `NEXT_PUBLIC_CODEBUFF_APP_URL` |
| `NEXT_PUBLIC_CODEBUFF_BACKEND_URL` | ⚠️ Only name | `scripts/cleanup-worktree.ts` | Backend URL |

> ⚠️ **Note about `NEXT_PUBLIC_*` variables:** These are build-time/client env vars that must stay coordinated across the env schema, env fixtures, and all accessors. `NEXT_PUBLIC_OPENBUFF_APP_URL` is already accepted as an optional schema field, but `NEXT_PUBLIC_CODEBUFF_APP_URL` remains the required primary field used by current app URL accessors. Further `OPENBUFF_*` aliases should be handled in a separate build-config migration phase.

**TODO:** Consider adding `OPENBUFF_*` aliases for the most commonly used ones (at minimum: `OPENBUFF_CLI_VERSION`, `OPENBUFF_IS_BINARY`). <!-- allow-todo -->

---

## 2. Config File Paths

### 2.1 Provider Config Files

| Path | Status | File |
|------|--------|------|
| `openbuff.json` (project dir + ancestors) | ✅ Primary | `sdk/src/provider-config.ts` |
| `codebuff.json` (project dir) | ❌ Removed (BYOK purge) | `sdk/src/provider-config.ts` |

### 2.2 Global Config Directories

| Path | Status | File |
|------|--------|------|
| `~/.config/openbuff/` | ✅ Primary | `sdk/src/provider-config.ts` (`getOpenbuffConfigDirs()`) |
| `~/.config/openbuff/provider-config.json` | ✅ Primary | `sdk/src/provider-config.ts` |
| `~/.config/openbuff/openbuff.json` | ✅ Primary | `sdk/src/provider-config.ts` |
| `~/.config/openbuff-<env>/` | ❌ Removed (BYOK purge) | `sdk/src/provider-config.ts` |
| `~/.config/openbuff-<env>/provider-config.json` | ❌ Removed (BYOK purge) | `sdk/src/provider-config.ts` |
| `~/.config/openbuff-<env>/openbuff.json` | ❌ Removed (BYOK purge) | `sdk/src/provider-config.ts` |
| `~/.config/manicode/provider-config.json` | ❌ Removed (BYOK purge) | `sdk/src/provider-config.ts` |
| `~/.config/manicode/codebuff.json` | ❌ Removed (BYOK purge) | `sdk/src/provider-config.ts` |

> 📝 **Note on `manicode` / env-suffix paths:** The `~/.config/manicode/` directory (from the **Manicode** project — a separate, earlier fork) and the `~/.config/openbuff-<env>/` env-suffix variants were removed in the BYOK legacy purge so that `~/.config/openbuff/` is the single global config dir. There is no migration shim; existing users re-auth via `/setup` or `/provider connect codex`. See [docs/configuration.md](./configuration.md).

**Detail:** The provider config discovery order is defined in `loadProviderConfigSync()`. Only `openbuff.json` is searched in the current directory and ancestor directories.

```
sdk/src/provider-config.ts
  - PROVIDER_CONFIG_ENV_VAR = 'OPENBUFF_PROVIDER_CONFIG'
  - PROVIDER_CONFIG_FILE_NAME = 'openbuff.json'
  - GLOBAL_PROVIDER_CONFIG_FILE_NAME = 'provider-config.json'
  - getOpenbuffConfigDirs() returns [getConfigDir()]  // ~/.config/openbuff only
  - getConfigDir() returns ~/.config/openbuff (no env suffix)
```

---

## 3. Constants

### 3.1 BYOK Constants

| Constant | Value | Status | File |
|----------|-------|--------|------|
| `BYOK_OPENROUTER_HEADER` | `'x-openrouter-api-key'` | ⚠️ Only name | `common/src/constants/byok.ts` |
| `BYOK_OPENROUTER_ENV_VAR` | `'CODEBUFF_BYOK_OPENROUTER'` | ⚠️ Only name | `common/src/constants/byok.ts` |

### 3.2 Local Mode Constants

| Constant | Value | Status | File |
|----------|-------|--------|------|
| `OPENBUFF_LOCAL_MODE_ENV_VAR` | `'OPENBUFF_LOCAL_MODE'` | ✅ Primary | `common/src/constants/local-mode.ts` |
| `CODEBUFF_LOCAL_MODE_ENV_VAR` | `'CODEBUFF_LOCAL_MODE'` | ❌ Removed (BYOK purge) | `common/src/constants/local-mode.ts` |
| `LOCAL_MODE_API_KEY` | `'openbuff-local-mode'` | ✅ Openbuff | `common/src/constants/local-mode.ts` |
| `LOCAL_MODE_USER_ID` | `'local-user'` | — Generic | `common/src/constants/local-mode.ts` |
| `LOCAL_MODE_USER_EMAIL` | `'local@openbuff.local'` | ✅ Openbuff | `common/src/constants/local-mode.ts` |

### 3.3 API Key

| Constant | Value | Status | File |
|----------|-------|--------|------|
| `API_KEY_ENV_VAR` | `'CODEBUFF_API_KEY'` | ⚠️ Only name | `common/src/constants/paths.ts` |

### 3.4 ChatGPT OAuth

| Constant | Value | Status | File |
|----------|-------|--------|------|
| `CHATGPT_OAUTH_TOKEN_ENV_VAR` | `'CODEBUFF_CHATGPT_OAUTH_TOKEN'` | ✅ Primary (legacy precedence) | `common/src/constants/chatgpt-oauth.ts` |
| `OPENBUFF_CHATGPT_OAUTH_TOKEN_ENV_VAR` | `'OPENBUFF_CHATGPT_OAUTH_TOKEN'` | ✅ Alias | `common/src/constants/chatgpt-oauth.ts` |

### 3.5 Analytics Events

| Event | Status | File |
|-------|--------|------|
| `UPDATE_CODEBUFF_FAILED` | ⚠️ Codebuff name | `common/src/constants/analytics-events.ts` |
| `CODEBUFF_REFERRER_ATTRIBUTED` | ⚠️ Codebuff name | `common/src/constants/analytics-events.ts` |

---

## 4. Binary & Brand Naming

### 4.1 Brand Name Resolution Pattern

Throughout the CLI codebase, branding is dynamically resolved:

```typescript
// Compatibility pattern in retained CLI surfaces:
const brandName = isLocalMode() ? 'Openbuff' : 'Codebuff'
const cliName = isLocalMode() ? 'openbuff' : 'codebuff'
```

### 4.2 Files Using Dynamic Branding

| File | Usage |
|------|-------|
| `cli/src/hooks/use-send-message.ts` (line ~368) | Error message branding |
| `cli/src/hooks/use-exit-handler.ts` (line ~31) | "To continue this session later, run: <name>" |
| `cli/src/hooks/use-send-message.ts` (line ~368) | Analytics product name |
| `cli/src/hooks/use-exit-handler.ts` (line ~31) | Login header and "run <name> to start" |
| `cli/src/utils/terminal-title.ts` (line ~18) | Terminal window title prefix |
| `cli/src/utils/chatgpt-oauth.ts` (line ~125) | OAuth UI branding |
| `cli/src/commands/init.ts` (line ~20) | Initialization branding |

### 4.3 CLI Entry Point

| File | Detail |
|------|--------|
| `cli/src/index.tsx` | Description: `'Openbuff CLI - local/BYOK AI coding assistant'` |
| `cli/src/index.tsx` | Flag: `--local` for local/BYOK mode (compatibility) |

### 4.4 Binary Names

| Binary | Status |
|--------|--------|
| `openbuff` | ✅ Primary binary name |
| `codebuff` | ✅ Compatibility alias (while fork still builds the old binary name) |

---

## 5. Package Names & SDK

### 5.1 Published Package

| Name | Status | File |
|------|--------|------|
| `@openbuff/sdk` | ✅ Primary (published) | `sdk/package.json` |

> **Note:** The old `@codebuff/sdk` package on npm is the upstream Codebuff package, not this fork. This fork publishes and consumes `@openbuff/sdk`.

### 5.2 SDK Client Class

| Name | Status | File |
|------|--------|------|
| `OpenbuffClient` | ✅ Primary | `sdk/src/client.ts` |
| `CodebuffClient` | ✅ Compatibility alias | `sdk/src/client.ts` |

**Detail:** Both `OpenbuffClient` and `CodebuffClient` are exported from `@openbuff/sdk`; `OpenbuffClient` is the primary class and `CodebuffClient` is a retained compatibility alias.

### 5.3 Import Paths

All internal packages use `@codebuff/*` import paths (the published SDK is `@openbuff/sdk`, listed in 5.1 above):

| Package | Status |
|---------|--------|
| `@codebuff/common` | ⚠️ Codebuff name (internal-only) |
| `@codebuff/internal` | ⚠️ Codebuff name (internal-only) |
| `@codebuff/agent-runtime` | ⚠️ Codebuff name (internal-only) |
| `@codebuff/code-map` | ⚠️ Codebuff name (internal-only) |
| `@codebuff/indexer` | ⚠️ Codebuff name (internal-only) |

**TODO:** These require significant migration effort (package.json renames, import rewrites across hundreds of files). <!-- allow-todo -->

### 5.4 SDK README

`sdk/README.md` documents that the package is published as `@openbuff/sdk` with `OpenbuffClient` as the primary export and `CodebuffClient` retained as a compatibility alias.

---

## 6. Config File Format

### 6.1 JSON Config Keys

The config file format uses `codebuff_metadata` as the key name in chat completion requests:

```typescript
// sdk/src/impl/llm.ts (line ~1045)
extraCodebuffMetadata?: Record<string, string>
```

> ⚠️ **WARNING: `codebuff_metadata` is a compatibility wire protocol key.**
> This field name is still used by SDK/client compatibility code. Renaming it to `openbuff_metadata` would require a coordinated SDK/client migration. Do **not** rename this without a compatibility plan.

### 6.2 Config File Content

The config keys in `openbuff.json` / `codebuff.json` are provider-focused and don't contain "Codebuff" in their key names (`providers`, `defaultModel`, `modes`, `agents`). These are already migration-neutral.

---

## 7. System Prompt Placeholders

### 7.1 Template Placeholders

The system prompt infrastructure uses `CODEBUFF_*` placeholders that get substituted at runtime:

| Placeholder | File |
|-------------|------|
| `{CODEBUFF_TOOLS_PROMPT}` | Multiple agent definitions |
| `{CODEBUFF_AGENTS_PROMPT}` | Multiple agent definitions |
| `{CODEBUFF_FILE_TREE_PROMPT}` | Multiple agent definitions |
| `{CODEBUFF_SYSTEM_INFO_PROMPT}` | Multiple agent definitions |
| `{CODEBUFF_GIT_CHANGES_PROMPT}` | Multiple agent definitions |

**Detail:** These are defined in `.agents/types/secret-agent-definition.ts` using the pattern `{CODEBUFF_${name}}`.

**TODO:** Consider renaming to `{OPENBUFF_*}` or making them generic, but this is low priority since they're internal. <!-- allow-todo -->

---

## 8. Removed Free-Mode Product Surfaces

The upstream Freebuff/free-mode web product, waiting room, hosted auth, and instance metadata flow are removed from active Openbuff. Openbuff local/BYOK mode routes directly to the user's configured providers and does not require product admission, hosted sessions, or free-mode queue metadata.

---

## 9. Documentation References

### 9.1 Files Still Mentioning "Codebuff" Heavily

| File | Notes |
|------|-------|
| `README.md` | Fork compatibility note explains the naming situation |
| `README.zh-CN.md` | Same as above in Chinese |
| `CONTRIBUTING.md` | References to `CODEBUFF_*` env vars |
| `WINDOWS.md` | Notes about local/BYOK vs cloud mode |
| `sdk/README.md` | Documents the naming compatibility surface |
| `docs/local-mode.md` | BYOK provider setup docs |
| `docs/environment-variables.md` | Env var documentation |
| `common/src/templates/initial-agents-dir/README.md` | Agent README template that should use Openbuff branding and label compatibility names explicitly |
| `.github/knowledge.md` | CI configuration |
| `cli/release-staging/README.md` | Release notes |

### 9.2 Files with Codebuff in the Path (Hardcoded)

| Path | Status |
|------|--------|
| `common/src/constants/byok.ts` (not in path, just content) | — |
| No actual file paths contain "codebuff" as a directory name that needs migration. | — |

---

## 10. Migration Status Summary

### ✅ Complete (Openbuff Primary, Legacy Codebuff Names Removed by BYOK Purge)

- Local mode env var — `OPENBUFF_LOCAL_MODE` only (`CODEBUFF_LOCAL_MODE` removed)
- Provider config env var — `OPENBUFF_PROVIDER_CONFIG` only (`CODEBUFF_PROVIDER_CONFIG` removed)
- Config file path — `openbuff.json` only (`codebuff.json` removed)
- Global config directory — `~/.config/openbuff/` only (`manicode/*` and `openbuff-<env>/` variants removed; no migration shim)
- CLI description text ("Openbuff CLI - local/BYOK AI coding assistant")
- Dynamic branding for retained Openbuff/Codebuff compatibility surfaces
- `--local` CLI flag maintained as compatibility
- `openbuff` binary name
- SDK published as `@openbuff/sdk` (`OpenbuffClient` primary, `CodebuffClient` retained compatibility alias — both exported from `@openbuff/sdk`)
- `OPENBUFF_API_KEY` primary with `CODEBUFF_API_KEY` runtime fallback (`sdk/src/env.ts`)

### ⚠️ Uses Only CODEBUFF Name (no Openbuff Alias)

- `CODEBUFF_BYOK_OPENROUTER` — no alias
- `CODEBUFF_IS_BINARY`, `CODEBUFF_CLI_VERSION`, `CODEBUFF_CLI_TARGET` — build-time only
- `CODEBUFF_CLI_EDITOR`, `CODEBUFF_EDITOR` — CLI config
- `CODEBUFF_GITHUB_ACTIONS` — no alias (`IS_CI` check in `common/src/env.ts`); `CODEBUFF_GITHUB_TOKEN` has `OPENBUFF_GITHUB_TOKEN` as primary in the CLI release script (`CODEBUFF_GITHUB_TOKEN` compatibility fallback), though eval/CI scripts still use `CODEBUFF_GITHUB_TOKEN` only
- `CODEBUFF_FULL_TELEMETRY` — debug telemetry
- `NEXT_PUBLIC_CODEBUFF_APP_URL` — required primary app URL used by retained legacy interfaces; `NEXT_PUBLIC_OPENBUFF_APP_URL` exists as an optional schema field but is not the primary app URL accessor
- Analytics events (`UPDATE_CODEBUFF_FAILED`, `CODEBUFF_REFERRER_ATTRIBUTED`)

### ⚠️ Package Ecosystem (Non-trivial Migration)

- All `@codebuff/*` internal import paths (`@codebuff/common`, `@codebuff/internal`, `@codebuff/agent-runtime`, `@codebuff/code-map`, `@codebuff/indexer`)
- These require coordinated changes across package.json files, build configs, and all import statements

### ⚠️ Internal Placeholders

- `{CODEBUFF_TOOLS_PROMPT}` and similar template placeholders
- Adding `{OPENBUFF_*}` aliases would be backward compatible

---

## 11. Migration Plan (Suggested Order)

### Phase 1: Low-Hanging Fruit
1. ✅ DONE — Add `OPENBUFF_API_KEY` as alias alongside `CODEBUFF_API_KEY` (`OPENBUFF_API_KEY` primary with `CODEBUFF_API_KEY` runtime fallback; see §1.3 and §10)
2. Add `OPENBUFF_BYOK_OPENROUTER` alias
3. ✅ DONE — Add `OPENBUFF_CHATGPT_OAUTH_TOKEN` alias (`OPENBUFF_CHATGPT_OAUTH_TOKEN_ENV_VAR` in `common/src/constants/chatgpt-oauth.ts`; SDK resolves `CODEBUFF_CHATGPT_OAUTH_TOKEN ?? OPENBUFF_CHATGPT_OAUTH_TOKEN`; note reversed precedence vs. API key — see §1.5)
4. Add `OPENBUFF_CLI_EDITOR` / `OPENBUFF_EDITOR` aliases

### Phase 2: Build/CI Variables
5. Add `OPENBUFF_IS_BINARY`, `OPENBUFF_CLI_VERSION`, `OPENBUFF_CLI_TARGET` aliases
6. Expand `OPENBUFF_GITHUB_*` support beyond the CLI release script where other CI/release scripts still use only `CODEBUFF_GITHUB_*`

### Phase 3: Package Ecosystem (Major Effort)
7. ✅ DONE — Rename `@codebuff/sdk` → `@openbuff/sdk` (published; `@openbuff/sdk` is live on npm)
8. ✅ DONE — Rename `CodebuffClient` → `OpenbuffClient` (with retained `CodebuffClient` compat alias; both exported from `@openbuff/sdk`)
9. Rename `@codebuff/*` internal packages → `@openbuff/*` (still outstanding)
10. Update all import paths across the codebase (still outstanding)

> ✅ **Completed:** `@openbuff/sdk` is live on npm with `OpenbuffClient` primary and `CodebuffClient` compatibility alias (both exported from `@openbuff/sdk`). The historical dual-publishing note for context: Renaming the legacy `@codebuff/sdk` package to `@openbuff/sdk` would break all downstream consumers who import `CodebuffClient` via the old `@codebuff/sdk` package path. This requires a **dual-publishing deprecation period** where both the legacy `@codebuff/sdk` and the new `@openbuff/sdk` are published to npm simultaneously for at least one major version. During this period, the legacy `@codebuff/sdk` should emit deprecation warnings directing users to migrate to `@openbuff/sdk`. The same applies to `CodebuffClient` → `OpenbuffClient` (export both names from both packages during the transition).

### Phase 4: Template Placeholders
11. Add `{OPENBUFF_*}` placeholder aliases that map to the same values
12. Update built-in agent templates to use new placeholders

---

## 12. Files to Update When Adding New Openbuff Names

When adding a new `OPENBUFF_*` alias, these files typically need updates:

1. **Constant definition:** The file where the constant is defined (e.g., `common/src/constants/paths.ts`)
2. **Env type schemas:** `common/src/types/contracts/env.ts`, `cli/src/types/env.ts`, etc.
3. **Env accessors — `common/src/env-process.ts`:** This is the **central file** that explicitly enumerates all `CODEBUFF_*` env vars exposed to the runtime. Any new alias must be added here alongside the existing Codebuff name. Also update `sdk/src/env.ts` and `cli/src/utils/env.ts`.
4. **Provider config schema — `sdk/src/provider-config.ts`:** Contains the Zod schema (`providerConfigFileSchema`) that validates provider configuration. Any config key renames (e.g., `codebuff_metadata` → `openbuff_metadata`) require schema updates here. Also contains `PROVIDER_CONFIG_ENV_VAR` and `LEGACY_PROVIDER_CONFIG_ENV_VAR` constants.
5. **Test env fixtures:** `common/src/testing-env-process.ts`, `cli/src/testing/env.ts`, etc.
6. **Documentation:** `docs/environment-variables.md`, this file
7. **README / CONTRIBUTING:** Update any referenced variable names

### Validation Checklist
- [ ] New constant defined with both names (Openbuff primary + Codebuff compat)
- [ ] `isLocalMode()` / `isLocalModeEnabled()` checks updated if needed
- [ ] TypeScript types updated
- [ ] Test fixtures updated
- [ ] Documentation updated
- [ ] Smoke tests still pass
- [ ] Legacy Codebuff env var still works