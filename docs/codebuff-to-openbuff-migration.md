# CODEBUFF → OPENBUFF Migration Reference

> **Purpose:** This document catalogs every CODEBUFF→OPENBUFF transition point in the Openbuff codebase. Use it to gauge migration progress, identify remaining work, and avoid regressions when adding new features that should use the Openbuff brand.

## Overview

Openbuff is a fork of Codebuff focused on local-first, bring-your-own-key (BYOK) usage. During the transition:

- **Openbuff names** (`OPENBUFF_*`, `openbuff.json`, `openbuff` binary) are the primary names.
- **Codebuff names** (`CODEBUFF_*`, `codebuff.json`, `codebuff` binary) remain as **fully supported legacy compatibility aliases**.
- The codebase uses `isLocalMode()` to detect BYOK mode and brand accordingly.

### Migration Philosophy

- **Add new Openbuff names alongside existing Codebuff ones** — never break backward compatibility.
- **Prefer Openbuff names in new code** — use `OPENBUFF_*` env vars, `openbuff.json` paths, and `openbuff` branding.
- **Keep legacy aliases working** — users with existing `codebuff.json` configs or `CODEBUFF_*` env vars must not break.
- **Branding is dynamic** — Openbuff should be the default user-facing brand; legacy Codebuff names should appear only when documenting compatibility surfaces.

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
| `CODEBUFF_LOCAL_MODE` | ✅ Alias (compat) | `common/src/constants/local-mode.ts` |

**Detail:** `isLocalModeEnabled()` checks `OPENBUFF_LOCAL_MODE` first, falls back to `CODEBUFF_LOCAL_MODE`, defaults to `true` (local mode on).

```
common/src/constants/local-mode.ts
  - OPENBUFF_LOCAL_MODE_ENV_VAR = 'OPENBUFF_LOCAL_MODE'
  - CODEBUFF_LOCAL_MODE_ENV_VAR = 'CODEBUFF_LOCAL_MODE'
```

### 1.2 Provider Config Path

| Variable | Status | File |
|----------|--------|------|
| `OPENBUFF_PROVIDER_CONFIG` | ✅ Primary | `sdk/src/provider-config.ts` |
| `CODEBUFF_PROVIDER_CONFIG` | ✅ Alias (compat) | `sdk/src/provider-config.ts` |

### 1.3 API Key

| Variable | Status | File |
|----------|--------|------|
| `CODEBUFF_API_KEY` | ⚠️ Only name (no Openbuff alias) | `common/src/constants/paths.ts` |

**Detail:** Used for legacy/hosted Codebuff API auth and live integration tests. BYOK mode doesn't require it.
```
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
| `CODEBUFF_CHATGPT_OAUTH_TOKEN` | ⚠️ Only name | `common/src/constants/chatgpt-oauth.ts` |

### 1.6 CI/Internal Variables

| Variable | Status | File | Notes |
|----------|--------|------|-------|
| `CODEBUFF_GITHUB_ACTIONS` | ⚠️ Only name | `common/src/env.ts` | `IS_CI` check |
| `CODEBUFF_GITHUB_ID` | ⚠️ Only name | `packages/internal/src/env-schema.ts` | GitHub OAuth |
| `CODEBUFF_GITHUB_SECRET` | ⚠️ Only name | `packages/internal/src/env-schema.ts` | GitHub OAuth |
| `CODEBUFF_GITHUB_TOKEN` | ⚠️ Only name | Various | Release scripts, eval scripts |
| `CODEBUFF_IS_BINARY` | ⚠️ Only name | `cli/scripts/build-binary.ts` | Build flag |
| `CODEBUFF_CLI_VERSION` | ⚠️ Only name | `cli/scripts/build-binary.ts` | Build flag |
| `CODEBUFF_CLI_TARGET` | ⚠️ Only name | `cli/scripts/build-binary.ts` | Build flag |
| `CODEBUFF_CLI_EDITOR` | ⚠️ Only name | `cli/src/types/env.ts`, `common/src/types/contracts/env.ts` | CLI editor override |
| `CODEBUFF_EDITOR` | ⚠️ Only name | `cli/src/types/env.ts` | Fallback editor |
| `CODEBUFF_FULL_TELEMETRY` | ⚠️ Only name | `common/src/util/analytics-sampling.ts` | Debug telemetry |
| `CODEBUFF_RG_PATH` | ⚠️ Only name | `sdk/src/env.ts` | Ripgrep binary path |
| `CODEBUFF_WASM_DIR` | ⚠️ Only name | `sdk/src/env.ts` | WASM directory |
| `CODEBUFF_NPM_REGISTRY` | ⚠️ Only name | `cli/scripts/build-binary.ts` | Build flag |
| `NEXT_PUBLIC_CODEBUFF_APP_URL` | ⚠️ Only name | `common/src/env-schema.ts` | Web app URL |
| `NEXT_PUBLIC_CODEBUFF_BACKEND_URL` | ⚠️ Only name | `scripts/cleanup-worktree.ts` | Backend URL |

> ⚠️ **Note about `NEXT_PUBLIC_*` variables:** These are Next.js build-time env vars baked into the client bundle at compile time (via `next.config.js`). Adding an `OPENBUFF_*` alias for these is **not** as simple as adding a runtime fallback — it requires changes to the Next.js build pipeline, the env schema, and the `env-process.ts` accessors in coordination. These should be handled in a separate build-config migration phase.

**TODO:** Consider adding `OPENBUFF_*` aliases for the most commonly used ones (at minimum: `OPENBUFF_CLI_VERSION`, `OPENBUFF_IS_BINARY`, `OPENBUFF_API_KEY`).

---

## 2. Config File Paths

### 2.1 Provider Config Files

| Path | Status | File |
|------|--------|------|
| `openbuff.json` (project dir) | ✅ Primary | `sdk/src/provider-config.ts` |
| `codebuff.json` (project dir) | ✅ Alias (compat) | `sdk/src/provider-config.ts` |

### 2.2 Global Config Directories

| Path | Status | File |
|------|--------|------|
| `~/.config/openbuff/` | ✅ Primary | `sdk/src/provider-config.ts` (`getOpenbuffConfigDirs()`) |
| `~/.config/openbuff-<env>/` | ✅ Primary | `sdk/src/provider-config.ts` |
| `~/.config/openbuff/provider-config.json` | ✅ Primary | `sdk/src/provider-config.ts` |
| `~/.config/openbuff/openbuff.json` | ✅ Primary | `sdk/src/provider-config.ts` |
| `~/.config/openbuff-<env>/provider-config.json` | ✅ Alias (compat) | `sdk/src/provider-config.ts` |
| `~/.config/openbuff-<env>/openbuff.json` | ✅ Alias (compat) | `sdk/src/provider-config.ts` |
| `~/.config/manicode/provider-config.json` | ✅ Alias (compat) | `sdk/src/provider-config.ts` |
| `~/.config/manicode/codebuff.json` | ✅ Alias (compat) | `sdk/src/provider-config.ts` |

> 📝 **Note on `manicode` paths:** The `~/.config/manicode/` directory is from the **Manicode** project — a separate, earlier fork that predates Openbuff. These paths are preserved for backward compatibility with Manicode users who migrated to Openbuff, but they are not part of the Codebuff→Openbuff transition itself. They can be removed in a future major version after a deprecation notice.

**Detail:** The provider config discovery order is defined in `loadProviderConfigSync()`. Both Openbuff (`openbuff.json`) and legacy Codebuff (`codebuff.json`) filenames are searched in the current directory and all ancestor directories.

```
sdk/src/provider-config.ts
  - PROVIDER_CONFIG_ENV_VAR = 'OPENBUFF_PROVIDER_CONFIG'
  - LEGACY_PROVIDER_CONFIG_ENV_VAR = 'CODEBUFF_PROVIDER_CONFIG'
  - PROVIDER_CONFIG_FILE_NAME = 'openbuff.json'
  - LEGACY_PROVIDER_CONFIG_FILE_NAME = 'codebuff.json'
  - GLOBAL_PROVIDER_CONFIG_FILE_NAME = 'provider-config.json'
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
| `CODEBUFF_LOCAL_MODE_ENV_VAR` | `'CODEBUFF_LOCAL_MODE'` | ✅ Alias | `common/src/constants/local-mode.ts` |
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
| `CHATGPT_OAUTH_TOKEN_ENV_VAR` | `'CODEBUFF_CHATGPT_OAUTH_TOKEN'` | ⚠️ Only name | `common/src/constants/chatgpt-oauth.ts` |

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
// Pattern found in multiple files:
const brandName = IS_FREEBUFF ? 'Freebuff' : isLocalMode() ? 'Openbuff' : 'Codebuff'
const cliName = IS_FREEBUFF ? 'freebuff' : isLocalMode() ? 'openbuff' : 'codebuff'
```

### 4.2 Files Using Dynamic Branding

| File | Usage |
|------|-------|
| `cli/src/hooks/use-send-message.ts` (line ~368) | Error message branding |
| `cli/src/hooks/use-exit-handler.ts` (line ~31) | "To continue this session later, run: <name>" |
| `cli/src/hooks/use-gravity-ad.ts` (line ~493) | Analytics product name |
| `cli/src/login/plain-login.ts` (lines ~25, ~77) | Login header and "run <name> to start" |
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
| `@codebuff/sdk` | ⚠️ Still Codebuff name | `sdk/package.json` |

### 5.2 SDK Client Class

| Name | Status | File |
|------|--------|------|
| `CodebuffClient` | ⚠️ Still Codebuff name | `sdk/src/client.ts` |

### 5.3 Import Paths

All internal packages use `@codebuff/*` import paths:

| Package | Status |
|---------|--------|
| `@codebuff/common` | ⚠️ Codebuff name |
| `@codebuff/sdk` | ⚠️ Codebuff name |
| `@codebuff/internal` | ⚠️ Codebuff name |
| `@codebuff/billing` | ⚠️ Codebuff name |
| `@codebuff/bigquery` | ⚠️ Codebuff name |
| `@codebuff/agent-runtime` | ⚠️ Codebuff name |

**TODO:** These require significant migration effort (package.json renames, import rewrites across hundreds of files).

### 5.4 SDK README

`sdk/README.md` explicitly documents that the package name and class name remain Codebuff-named compatibility surfaces during the fork transition.

---

## 6. Config File Format

### 6.1 JSON Config Keys

The config file format uses `codebuff_metadata` as the key name in chat completion requests:

```typescript
// sdk/src/impl/llm.ts (line ~1045)
extraCodebuffMetadata?: Record<string, string>
```

> ⚠️ **WARNING: `codebuff_metadata` is a wire protocol key.**
> This field name is part of the API contract with the server-side chat completions endpoint. Renaming it to `openbuff_metadata` would **break the server-side API** and require coordinated changes to the web backend (`web/src/app/api/v1/chat/completions/_post.ts`), the SDK, and all clients. Do **not** rename this without a coordinated server/client migration plan.

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

**TODO:** Consider renaming to `{OPENBUFF_*}` or making them generic, but this is low priority since they're internal.

---

## 8. Freebuff Integration

### 8.1 Freebuff-Specific Code

The Freebuff variant uses its own env vars that fall back to Codebuff ones:

```typescript
// freebuff/web/src/app/api/auth/[...nextauth]/auth-options.ts (line ~88)
clientId: env.FREEBUFF_GITHUB_ID ?? env.CODEBUFF_GITHUB_ID,
clientSecret: env.FREEBUFF_GITHUB_SECRET ?? env.CODEBUFF_GITHUB_SECRET,
```

### 8.2 Freebuff Instance Metadata

Freebuff sessions inject `freebuff_instance_id` into `codebuff_metadata`:

```typescript
// cli/src/hooks/use-send-message.ts
extraCodebuffMetadata:
  IS_FREEBUFF && freebuffInstanceId
    ? { freebuff_instance_id: freebuffInstanceId }
    : undefined,
```

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
| `freebuff/README.md` | Freebuff description |

### 9.2 Files with Codebuff in the Path (Hardcoded)

| Path | Status |
|------|--------|
| `common/src/constants/byok.ts` (not in path, just content) | — |
| No actual file paths contain "codebuff" as a directory name that needs migration. | — |

---

## 10. Migration Status Summary

### ✅ Complete (Dual Aliases, Openbuff Primary)

- Local mode env vars (`OPENBUFF_LOCAL_MODE` ↔ `CODEBUFF_LOCAL_MODE`)
- Provider config env vars (`OPENBUFF_PROVIDER_CONFIG` ↔ `CODEBUFF_PROVIDER_CONFIG`)
- Config file paths (`openbuff.json` ↔ `codebuff.json`)
- Global config directories (`~/.config/openbuff/` + legacy paths)
- CLI description text ("Openbuff CLI - local/BYOK AI coding assistant")
- Dynamic branding (resolves to Openbuff/Freebuff/Codebuff automatically)
- `--local` CLI flag maintained as compatibility
- `openbuff` binary name

### ⚠️ Uses Only CODEBUFF Name (no Openbuff Alias)

- `CODEBUFF_API_KEY` — no `OPENBUFF_API_KEY` alias
- `CODEBUFF_BYOK_OPENROUTER` — no alias
- `CODEBUFF_CHATGPT_OAUTH_TOKEN` — no alias
- `CODEBUFF_IS_BINARY`, `CODEBUFF_CLI_VERSION`, `CODEBUFF_CLI_TARGET` — build-time only
- `CODEBUFF_CLI_EDITOR`, `CODEBUFF_EDITOR` — CLI config
- `CODEBUFF_GITHUB_*` — CI/release specific; `OPENBUFF_GITHUB_TOKEN` is supported by the CLI release script as the primary token name with `CODEBUFF_GITHUB_TOKEN` as a compatibility fallback
- `CODEBUFF_FULL_TELEMETRY` — debug telemetry
- `NEXT_PUBLIC_CODEBUFF_APP_URL` — web app URL
- Analytics events (`UPDATE_CODEBUFF_FAILED`, `CODEBUFF_REFERRER_ATTRIBUTED`)

### ⚠️ Package Ecosystem (Non-trivial Migration)

- `@codebuff/sdk` package name
- `CodebuffClient` class name
- All `@codebuff/*` import paths
- These require coordinated changes across package.json files, build configs, and all import statements

### ⚠️ Internal Placeholders

- `{CODEBUFF_TOOLS_PROMPT}` and similar template placeholders
- Adding `{OPENBUFF_*}` aliases would be backward compatible

---

## 11. Migration Plan (Suggested Order)

### Phase 1: Low-Hanging Fruit
1. Add `OPENBUFF_API_KEY` as alias alongside `CODEBUFF_API_KEY`
2. Add `OPENBUFF_BYOK_OPENROUTER` alias
3. Add `OPENBUFF_CHATGPT_OAUTH_TOKEN` alias
4. Add `OPENBUFF_CLI_EDITOR` / `OPENBUFF_EDITOR` aliases

### Phase 2: Build/CI Variables
5. Add `OPENBUFF_IS_BINARY`, `OPENBUFF_CLI_VERSION`, `OPENBUFF_CLI_TARGET` aliases
6. Expand `OPENBUFF_GITHUB_*` support beyond the CLI release script where other CI/release scripts still use only `CODEBUFF_GITHUB_*`

### Phase 3: Package Ecosystem (Major Effort)
7. Rename `@codebuff/sdk` → `@openbuff/sdk` (coordinated with build/release)
8. Rename `CodebuffClient` → `OpenbuffClient` (with compat alias)
9. Rename `@codebuff/*` internal packages → `@openbuff/*`
10. Update all import paths across the codebase

> ⚠️ **Dual-publishing required:** Renaming `@codebuff/sdk` to `@openbuff/sdk` would break all downstream consumers who `import { CodebuffClient } from '@codebuff/sdk'`. This requires a **dual-publishing deprecation period** where both `@codebuff/sdk` and `@openbuff/sdk` are published to npm simultaneously for at least one major version. During this period, `@codebuff/sdk` should emit deprecation warnings directing users to migrate to `@openbuff/sdk`. The same applies to `CodebuffClient` → `OpenbuffClient` (export both names from both packages during the transition).

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