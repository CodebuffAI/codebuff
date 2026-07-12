# File manifest — onboarding, project selection, configuration, providers, OAuth, validation

## Scope statement

This manifest covers the CLI path from process start to a usable local/BYOK session: argument parsing and bootstrap, project-root selection, first-project initialization, user settings and environment loading, provider/model setup and routing configuration, ChatGPT/Codex OAuth, and local-agent validation surfaced in the TUI. It identifies implementation, integration, tests, docs, and example configuration only. It intentionally does **not** assess quality or recommend changes.

The structural map used for discovery is `.agents/sessions/audit-cli-next-level-2026-07/MAP.md`. Generated bundles, existing audit findings, and `node_modules` were not searched as implementation sources.

## Primary files grouped into audit subshards

### OC-1 — Process startup and application bootstrap (13 files, ~2.6k LOC)

- `cli/src/index.tsx`
- `cli/src/app.tsx`
- `cli/src/init/init-app.ts`
- `cli/src/init/init-direnv.ts`
- `cli/src/pre-init/tree-sitter-wasm.ts`
- `cli/src/project-files.ts`
- `cli/src/utils/env.ts`
- `cli/src/utils/create-run-config.ts`
- `cli/src/__tests__/cli-args.test.ts`
- `cli/src/__tests__/e2e-cli.test.ts`
- `cli/src/__tests__/home-directory-detection.test.ts`
- `cli/src/init/__tests__/init-direnv.test.ts`
- `cli/src/__tests__/unit/create-run-config.test.ts`

Key symbols and flow:

- `main()` / `parseArgs()` parse `--cwd`, `--agent`, `--continue`, `--plan`, and the compatibility `--local` flag.
- `initializeApp()` applies `cwd`, establishes the module-level project root, initializes analytics/direnv/theme/timestamps, starts the index, and refreshes stored ChatGPT credentials in the background.
- `setProjectRoot()` / `getProjectRoot()` are the root authority used by CLI storage, tools, and plan artifacts.
- `AppWithAsyncAuth` loads the initial file tree, initializes local agents and skills, and passes project-picker state into `App`.
- `createRunConfig()` imports provider-config values (`maxAgentSteps`, indexing) into each SDK run and installs the sensitive-file filter.

### OC-2 — Project and directory selection (11 files, ~2.1k LOC)

- `cli/src/components/project-picker-screen.tsx`
- `cli/src/hooks/use-directory-browser.ts`
- `cli/src/utils/directory-browser.ts`
- `cli/src/utils/project-picker.ts`
- `cli/src/utils/recent-projects.ts`
- `cli/src/hooks/use-path-tab-completion.ts`
- `cli/src/utils/path-completion.ts`
- `cli/src/__tests__/utils/project-picker.test.ts`
- `cli/src/hooks/__tests__/use-directory-browser.test.ts`
- `cli/src/hooks/__tests__/use-path-tab-completion.test.ts`
- `cli/src/__tests__/path-completion.test.ts`

Key symbols and flow:

- `shouldShowProjectPicker(startCwd, homeDir)` gates first-screen project selection.
- `ProjectPickerScreen` combines recent projects, searchable directories, direct path entry, tab completion, keyboard navigation, and the final Open action.
- `useDirectoryBrowser()` delegates filesystem enumeration to `getDirectories()` and path expansion/navigation helpers.
- Selection returns to `cli/src/index.tsx::handleProjectChange()`, which calls `process.chdir`, updates `setProjectRoot`, resets the SDK client, persists recents, and reloads the file tree.
- `App` also exposes switching from a nested directory to the discovered Git root.

### OC-3 — Project initialization and scaffold generation (8 files, ~3.6k LOC)

**Sizing flag:** likely over the ~3k LOC audit target. Split the command/dispatch pair from template-generation sources if the auditor cannot keep all files in context.

- `cli/src/commands/init.ts`
- `cli/src/commands/command-registry.ts`
- `cli/scripts/generate-init-type-sources.ts`
- `common/src/templates/initial-agents-dir/types/agent-definition.ts`
- `common/src/templates/initial-agents-dir/types/tools.ts`
- `common/src/templates/initial-agents-dir/types/util-types.ts`
- `cli/src/commands/__tests__/init.test.ts`
- `cli/src/__tests__/init-type-sources.test.ts`

Key symbols and flow:

- `command-registry.ts` maps slashless/`/init` input to `handleInitializationFlowLocally()`.
- `handleInitializationFlowLocally()` creates `knowledge.md`, `.agents/`, `.agents/types/`, and the three public type files, then returns a `postUserMessage` callback for TUI feedback.
- `generate-init-type-sources.ts` is the source-to-generated bridge used at build time; audit the source templates above rather than the generated payload.

### OC-4 — User settings, config directory, environment, and theme persistence (14 files, ~2.2k LOC)

- `cli/src/utils/settings.ts`
- `cli/src/utils/auth.ts`
- `cli/src/utils/theme-config.ts`
- `cli/src/hooks/use-theme.tsx`
- `cli/src/state/chat-store.ts`
- `cli/src/utils/env.ts`
- `cli/src/types/env.ts`
- `common/src/env-process.ts`
- `common/src/env.ts`
- `sdk/src/env.ts`
- `sdk/src/types/env.ts`
- `cli/src/__tests__/utils/env.test.ts`
- `common/src/__tests__/env-process.test.ts`
- `sdk/src/__tests__/env.test.ts`

Key symbols and flow:

- CLI storage is rooted at `~/.config/openbuff` via `cli/src/utils/auth.ts::getConfigDir()`.
- `loadSettings()` / `saveSettings()` manage `settings.json`; `loadModePreference()` feeds the initial Zustand chat-store mode.
- `theme-config.ts` and `use-theme.tsx` combine saved theme preferences with terminal detection performed during startup.
- `getBaseEnv()`, `getCliEnv()`, and `getSdkEnv()` define the environment-DI boundary; SDK helpers resolve `OPENBUFF_API_KEY`, the retained `CODEBUFF_API_KEY` alias, provider keys, and OAuth token aliases.
- Direnv mutation itself belongs to OC-1, but its resulting environment feeds this subshard.

### OC-5A — Provider/model picker overlays and command dispatch (7 files, ~5k+ LOC)

**Sizing flag:** over ~3k LOC. Prefer symbol-range review of `chat.tsx` and `command-registry.ts`; their unrelated chat/rendering and command implementations are not part of this scope.

- `cli/src/components/provider-picker-screen.tsx`
- `cli/src/components/model-route-picker.tsx`
- `cli/src/chat.tsx`
- `cli/src/commands/command-registry.ts`
- `cli/src/components/selectable-list.tsx`
- `cli/src/hooks/use-searchable-list.ts`
- `cli/src/commands/__tests__/router-input.test.ts`

Key symbols and flow:

- `/setup`, `/provider`, and `/models` dispatch from `command-registry.ts` and return overlay-open or input-mode state.
- `Chat` owns `providerPickerOpen` / `modelRoutePickerOpen`, renders the full-screen overlays, and applies `ProviderPickerSelection` through provider helpers.
- `ProviderPickerScreen` covers built-in presets, Codex OAuth selection, environment-key status, and a custom-provider draft.
- `ModelRoutePicker` edits default, mode, agent, vision, and reasoning-effort routes against the currently loaded provider/model set.
- Shared searchable/selectable-list primitives define keyboard, filtering, focus, and selection behavior.

### OC-5B — CLI provider setup, config mutation, and pre-send readiness (5 files, ~4.4k LOC)

**Sizing flag:** over ~3k LOC, largely because the focused readiness test file also covers adjacent send-message behavior. Review only provider-readiness symbols in that test if necessary.

- `cli/src/utils/openbuff-provider.ts`
- `cli/src/hooks/use-send-message.ts`
- `cli/src/hooks/helpers/send-message.ts`
- `cli/src/utils/__tests__/openbuff-provider.test.ts`
- `cli/src/hooks/helpers/__tests__/send-message.test.ts`

Key symbols and flow:

- `setupOpenbuffProviderFromArgs()`, `addCustomOpenbuffProvider()`, and `handleOpenbuffProviderCommand()` implement presets, custom providers, provider removal, discovery commands, and Codex connect/disconnect dispatch.
- `configureOpenbuffModelFromArgs()`, `setRouteModel()`, and picker-facing helpers mutate route configuration.
- `writeMergedConfig()` / `getEditableConfig()` bridge CLI choices into SDK config parsing and persistence.
- `getOpenbuffProviderReadiness()` resolves the selected agent/mode before a message is sent and returns user-facing setup, missing-route, missing-key, or missing-OAuth status.
- `use-send-message.ts` invokes readiness; `cleanupProviderReadinessFailure()` restores UI/queue state when the gate blocks a send.

### OC-6 — SDK provider configuration, discovery, and model resolution (9 files, ~6.8k+ LOC)

**Sizing flag:** substantially over ~3k LOC. Split `provider-config.ts` schema/load/write logic from model discovery/resolution tests, or review the named symbols below by ranges.

- `sdk/src/provider-config.ts`
- `sdk/src/model-discovery.ts`
- `sdk/src/impl/model-provider.ts`
- `sdk/src/__tests__/model-provider.test.ts`
- `sdk/src/impl/__tests__/provider-options-metadata.test.ts`
- `openbuff.d.example/providers.json`
- `openbuff.d.example/routes.json`
- `openbuff.d.example/indexing.json`
- `openbuff.json.example`

Key symbols and flow:

- `providerConfigFileSchema` defines providers, routes, reasoning effort, vision fallback, failover, indexing, hooks, and run limits.
- `loadProviderConfigSync()` loads the explicit `OPENBUFF_PROVIDER_CONFIG` path or merges global/project/ancestor config, `extends`/`include` fragments, and implicit `openbuff.d/*.json`, with source attribution and mtime caching.
- `writeProviderConfigFile()` validates and writes monolithic or fragmented configuration; `createProviderPresetConfig()` materializes built-in setup presets.
- `resolveConfiguredAgentModelConfig()` applies mode → agent → default → explicit fallback routing; `resolveConfiguredProviderModel()` maps the routable model to provider model and environment key.
- `discoverProviderModels()`, cache helpers, and `addDiscoveredModelToProviderConfig()` cover provider model discovery and persistence.
- `getModelForRequest()` is the SDK integration boundary that consumes the resolved configuration. Transport internals beyond that boundary belong to the provider/runtime audit.

### OC-7A — ChatGPT/Codex OAuth CLI and TUI flow (10 files, ~2.4k LOC)

- `cli/src/utils/chatgpt-oauth.ts`
- `cli/src/components/chatgpt-connect-banner.tsx`
- `cli/src/components/input-mode-banner.tsx`
- `cli/src/components/chat-input-bar.tsx`
- `cli/src/utils/input-modes.ts`
- `cli/src/commands/router.ts`
- `cli/src/data/slash-commands.ts`
- `common/src/constants/chatgpt-oauth.ts`
- `cli/src/utils/__tests__/chatgpt-oauth.test.ts`
- `cli/src/commands/__tests__/router-connect-chatgpt.test.ts`

Key symbols and flow:

- `/provider connect codex` or the provider picker sets the `connect:chatgpt` input mode.
- `ChatGptConnectBanner` starts the flow, displays the browser URL/status, supports retry/disconnect, and offers post-connect Codex preset creation.
- `connectChatGptOAuth()` creates PKCE verifier/state, opens the browser, and starts the localhost callback server; `exchangeChatGptCodeForTokens()` supports callback URL or manual-code input.
- `routeUserPrompt()` handles authorization-code input when the connect mode is active.
- `CHATGPT_OAUTH_*` constants define endpoints, redirect URI, token aliases, and the allowlisted model mapping.

### OC-7B — OAuth credential storage and SDK request integration (9 files, ~6.4k LOC)

**Sizing flag:** substantially over ~3k LOC because `llm.ts` and `model-provider.test.ts` are high-fanout files. Restrict those files to OAuth credential refresh, OAuth model resolution, backend request transformation, and stream fallback symbols.

- `sdk/src/credentials.ts`
- `sdk/src/env.ts`
- `sdk/src/impl/model-provider.ts`
- `sdk/src/impl/chatgpt-backend-fetch.ts`
- `sdk/src/impl/llm.ts`
- `sdk/src/__tests__/credentials.test.ts`
- `sdk/src/__tests__/chatgpt-backend-fetch.test.ts`
- `sdk/src/impl/__tests__/llm-chatgpt-oauth-policy.test.ts`
- `sdk/src/__tests__/model-provider.test.ts`

Key symbols and flow:

- `getChatGptOAuthCredentials()` resolves environment override before `~/.config/openbuff/credentials.json`.
- `saveChatGptOAuthCredentials()`, `clearChatGptOAuthCredentials()`, `refreshChatGptOAuthToken()`, and `getValidChatGptOAuthCredentials()` own persistence, permissions, expiry, refresh, and refresh deduplication.
- `initializeApp()` in OC-1 triggers best-effort background refresh when credentials exist.
- `getModelForRequest()` selects a configured `chatgpt-oauth` provider or the allowlisted direct-OAuth path.
- `createChatGptBackendFetch()` / request-body transforms adapt AI SDK requests to the ChatGPT backend; `llm.ts` owns stream auth/rate-limit classification, refresh/retry, and fallback behavior.

### OC-8 — Local-agent loading, validation contracts, and validation UX (14 files, ~5.2k LOC)

**Sizing flag:** over ~3k LOC. Split local-agent load/common-schema validation from the small TUI formatting/popover group if necessary.

- `cli/src/utils/local-agent-registry.ts`
- `sdk/src/agents/load-agents.ts`
- `sdk/src/validate-agents.ts`
- `common/src/templates/agent-validation.ts`
- `common/src/types/dynamic-agent-template.ts`
- `cli/src/hooks/use-agent-validation.ts`
- `cli/src/components/validation-error-popover.tsx`
- `cli/src/utils/validation-error-formatting.ts`
- `cli/src/utils/validation-error-helpers.ts`
- `cli/src/utils/format-validation-errors-for-message.ts`
- `cli/src/__tests__/integration/local-agents.test.ts`
- `sdk/src/__tests__/validate-agents.test.ts`
- `common/src/__tests__/agent-validation.test.ts`
- `cli/src/utils/__tests__/validation-error-formatting.test.ts`

Key symbols and flow:

- Startup calls `initializeAgentRegistry()`, which discovers project/user agent directories and delegates loading to the SDK.
- `loadLocalAgents()` imports agent modules, resolves MCP environment references, optionally validates, removes invalid definitions, and returns file-aware validation diagnostics.
- SDK `validateAgents()` adapts arrays to the common validator; common `validateAgents()` / `validateSingleAgent()` enforce the dynamic-agent schemas and duplicate-ID rules.
- `useAgentValidation()` runs local validation before send, filters network-only errors, and exposes state to the chat UI.
- `ValidationErrorPopover` and formatting helpers map validator IDs/messages back to local files and user-facing field labels.

## Related documentation and example configuration

- `docs/configuration.md` — authoritative config locations, fragment/merge semantics, routing resolution, discovery, capabilities, indexing, and hook configuration.
- `docs/local-mode.md` — active local/BYOK provider setup and routing behavior.
- `docs/openbuff-provider-model-setup-ux.md` — design/proposal context for the current provider/model setup surfaces; distinguish proposed phases from shipped behavior.
- `docs/environment-variables.md` — environment naming, DI helpers, and load order.
- `docs/request-flow.md` — CLI → SDK → configured provider request path and validation-gate context.
- `docs/development.md` — development-time direnv and local setup behavior.
- `docs/agents-and-tools.md` — local agent structure and validation/tool contracts.
- `README.md` — public CLI start, custom-agent init, and provider configuration promises.
- `.env.example` — documented key/env surface.
- `openbuff.d.example/providers.json`, `openbuff.d.example/routes.json`, `openbuff.d.example/indexing.json`, `openbuff.json.example` — executable examples that should be checked against the SDK schema and CLI-generated output.

## Shared/high-fanout files

- `cli/src/index.tsx`, `cli/src/app.tsx`, `cli/src/chat.tsx`, and `cli/src/commands/command-registry.ts` connect multiple subshards. Audit only the startup, project-picker, setup/model/provider, init, and OAuth branches listed above.
- `sdk/src/provider-config.ts`, `sdk/src/impl/model-provider.ts`, and `sdk/src/__tests__/model-provider.test.ts` are intentionally cross-referenced because configuration, model routing, provider selection, and OAuth converge there.
- `cli/src/utils/local-agent-registry.ts` participates in both startup and validation; its implementation is assigned to OC-8, while OC-1 should only verify the startup call order.

## Explicit exclusions

- `node_modules/`, lockfile contents, compiled binaries, release artifacts, and generated agent bundles.
- `cli/src/data/initial-agent-type-sources.generated.ts` as an audit source. Its generator and source templates are included in OC-3.
- Existing audit/session findings under `.agents/sessions/**/findings/` and `/tmp/openbuff-cli-audit-2026-07/findings/`; this manifest was independently derived from source, tests, docs, examples, and the structural map.
- `docs/authentication.md` and legacy hosted Codebuff login/device-code/cloud-auth behavior. That document explicitly describes the removed cloud flow; only the shared credentials-file boundary is relevant here.
- Deep provider transport behavior, token accounting, retry policy unrelated to ChatGPT OAuth, and agent-runtime execution after `getModelForRequest()`; those belong to request/runtime/provider audit shards.
- Index construction/ranking internals; only bootstrap, config, status, and run-config integration are in scope.
- General chat rendering, message history, attachments, plans, review UI, command implementations unrelated to `init`, `setup`, `provider`, `models`, or ChatGPT connect.
- MCP configuration, agent prompt quality, shipped agent behavior, evals, website/backend code, release/install/update UX, and `agents-graveyard/`.
- The future phases in `docs/openbuff-provider-model-setup-ux.md` are reference context, not assumed shipped functionality.
