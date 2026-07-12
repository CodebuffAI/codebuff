# Onboarding and configuration audit findings

## [HIGH] correctness — cli/src/utils/openbuff-provider.ts:346 — Route edits overwrite unrelated configuration
- **Risk:** Changing one model route or removing one provider can silently delete vision routing, failover, hooks, run limits, discovery/capability metadata, and reset indexing, turning a harmless setup action into a broad configuration rewrite.
- **Fix:** Build edits from a complete, source-aware config draft and persist only the changed keys/fragments atomically, with regression tests that assert every unrelated schema field remains byte-for-byte or semantically unchanged.
- **Evidence:** `getEditableConfig()` at lines 354-364 clones only providers/default/modes/agents/reasoning fields, while `writeMergedConfig()` at lines 346-351 calls `writeProviderConfigFile(... force: true)`; a direct temporary-directory reproduction starting with `indexing.enabled: false` and writing only providers/routes rewrote `indexing.json` to the schema default `enabled: true`, and `docs/configuration.md:33-48,135-186,231-260` documents fragmented indexing, hooks, and failover as independent supported settings.
- **Confidence:** High — Evidence.

## [HIGH] correctness — cli/src/project-files.ts:50 — Project history identity collides on directory basename
- **Risk:** Two common repositories such as `/work/client/app` and `/work/internal/app` share `~/.config/openbuff/projects/app`, so history, checkpoints, and `--continue` can expose or resume the other project's conversation and run state.
- **Fix:** Derive the storage key from the canonical absolute path plus a stable hash (with a readable basename prefix), record the original root in metadata, and migrate legacy basename-only directories safely.
- **Evidence:** `getProjectDataDir()` uses only `path.basename(root)` at lines 50-59; `loadMostRecentChatState()` in `cli/src/utils/run-state-storage.ts:121-145` falls back to the most recent chat under that shared directory, and no collision test exists for `project-files.ts`.
- **Confidence:** High — Evidence.

## [HIGH] state mutation — cli/src/index.tsx:343 — Project selection does not re-bootstrap project-scoped state
- **Risk:** Selecting a project from the first-run picker changes `cwd` and the root, but leaves direnv variables, local agents/MCP, skills, and the index initialized for the launch directory, so the first usable session can run with missing or wrong project context.
- **Fix:** Replace the partial callback with one cancellable `switchProject()` transaction that validates the path, changes root, reloads environment/config/agents/skills, swaps the index instance, resets project caches, and only then reveals chat.
- **Evidence:** `handleProjectChange()` at lines 343-368 only calls `process.chdir`, `setProjectRoot`, `resetCodebuffClient`, recents, and file-tree state; the omitted initialization occurs once at `initializeApp()` (`cli/src/init/init-app.ts:19-65`) and `initializeAgentRegistry()` / `initializeSkillRegistry()` (`cli/src/index.tsx:293-300`), with no project-switch integration test.
- **Confidence:** High — Evidence.

## [HIGH] API/ABI contract breaks — sdk/src/agents/load-agents.ts:207 — Public loader silently stopped loading project agents by default
- **Risk:** Existing SDK callers of `loadLocalAgents({ verbose: true })` now receive only home agents, breaking project-local workflows without a type error and contradicting the published local-agent contract.
- **Fix:** Preserve the previous default for the exported SDK API or ship the trust change as an explicit major-version contract with a new clearly named safe loader/option and migration documentation; keep CLI trust policy at the CLI boundary.
- **Evidence:** The current worktree diff adds `includeProjectAgents = false` at lines 207-222 and changes default directories from cwd/parent/home to home-only, while the same file's JSDoc at lines 146-172 still says the default searches project and parent directories; `README.md:177` and `docs/agents-and-tools.md:10-12` promise project-local `.agents`, and tests predominantly pass `agentsPath` rather than asserting the default-location contract.
- **Confidence:** High — Evidence (current uncommitted regression).

## [HIGH] correctness — cli/src/components/button.tsx:43 — Core onboarding actions are mouse-only
- **Risk:** A keyboard-only user can browse directories but cannot activate the project picker's `Open` action, and the same primitive makes OAuth auto-configure, disconnect, retry, and close controls inaccessible.
- **Fix:** Give `Button` focus/activation semantics and a consistent keyboard model, then add explicit project-picker shortcuts (for example Enter to open the current path and a separate key to descend) plus end-to-end keyboard tests.
- **Evidence:** `Button` lines 43-69 only handles mouse down/up; `ProjectPickerScreen` maps Enter to directory navigation at `cli/src/components/project-picker-screen.tsx:269-285` and exposes `Open` solely through `onClick` at lines 486-501, while `ChatGptConnectBanner` actions at lines 174-205 and 226-239 are also `onClick`-only.
- **Confidence:** High — Evidence.

## [MEDIUM] security — cli/src/utils/skill-registry.ts:22 — Project skills bypass the new project-trust boundary
- **Risk:** Opening an untrusted repository directly can load a project skill that overrides a familiar global skill name and injects repository-controlled instructions into the next `/skill:*` invocation even when project agents and MCP are not trusted.
- **Fix:** Apply the same trust decision to project `.agents/skills` and `.claude/skills`, show each skill's origin in suggestions, and require confirmation when a project skill shadows a global skill.
- **Evidence:** `initializeSkillRegistry()` always calls `loadSkills({ cwd })` at lines 22-31; `sdk/src/skills/load-skills.ts:159-178,221-234` loads project skills last so they override globals, and `createSkillCommand()` injects the selected file's full content into the user prompt at `cli/src/commands/command-registry.ts:1013-1069`, whereas `--trust-project-agents` only gates agent/MCP loading in `cli/src/index.tsx:125-133,293-300`.
- **Confidence:** Medium — Inference grounded in the prompt-loading path.

## [MEDIUM] error handling — sdk/src/provider-config.ts:1177 — Malformed normal configs disappear without a diagnostic
- **Risk:** A syntax or schema error in global/project `openbuff.json` is silently ignored and later presented as missing setup or missing routes, preventing users from repairing the actual file and making first-run failures look unrelated.
- **Fix:** Preserve per-source parse diagnostics in `LoadedProviderConfig`, surface them in `/provider status` and readiness errors, and add a `openbuff doctor`/repair view that names the exact file and schema path without printing secrets.
- **Evidence:** `loadProviderConfigSync()` catches and discards every non-explicit config error at lines 1182-1194 and only records successful `sourceFilePaths`; `/provider status` renders only `describeLoadedProviderConfig()` plus missing env values (`cli/src/utils/openbuff-provider.ts:259-276`), while tests only require explicit malformed config to fail (`sdk/src/__tests__/model-provider.test.ts:1559` and 1682-1695).
- **Confidence:** High — Evidence.

## [MEDIUM] error handling — cli/src/utils/chatgpt-oauth.ts:293 — OAuth token operations have no network timeout
- **Risk:** A stalled token endpoint can leave manual authorization or background refresh pending indefinitely, with the module-global refresh promise blocking all later refresh attempts.
- **Fix:** Attach bounded abort signals to authorization-code exchange and refresh fetches, distinguish timeout from auth failure, and always clear/abort outstanding work when the banner or callback server closes.
- **Evidence:** `exchangeChatGptCodeForTokens()` calls `fetch()` without `signal` at lines 293-305 and `refreshChatGptOAuthToken()` does the same at `sdk/src/credentials.ts:235-247`; the five-minute callback timer only calls `stopChatGptOAuthServer()` (`chatgpt-oauth.ts:164-168`) and does not abort the fetch, while `chatGptRefreshPromise` remains occupied until the fetch settles (`credentials.ts:221-292`).
- **Confidence:** High — Evidence.

## [MEDIUM] error handling — sdk/src/agents/load-agents.ts:229 — Broken agent modules vanish from validation diagnostics
- **Risk:** Syntax errors, import-time exceptions, missing IDs, and missing environment variables make a custom agent disappear with no actionable TUI error because the CLI loads with `verbose: false` and only schema-valid imported agents reach validation.
- **Fix:** Collect file-aware load diagnostics for every skipped module and merge them with schema diagnostics, while still loading healthy agents.
- **Evidence:** Import and pre-validation failures at lines 229-280 only log when `verbose` is true, but `initializeAgentRegistry()` uses `{ verbose: false, validate: true }` at `cli/src/utils/local-agent-registry.ts:63-76`; `cli/src/__tests__/integration/local-agents.test.ts:187-217,915-993` merely verifies that healthy agents continue loading and never asserts that the broken file is reported.
- **Confidence:** High — Evidence.

## [MEDIUM] error handling — cli/src/commands/init.ts:61 — `/init` can throw out of the command router after partial scaffolding
- **Risk:** A read-only directory, disk-full condition, or failed directory creation can abort the slash command after some files were created, without a coherent repair message or rollback.
- **Fix:** Preflight writability, perform scaffold writes through a single error-returning operation using temporary files, and convert partial failures into explicit per-path TUI guidance with a safe retry.
- **Evidence:** Knowledge and directory creation at lines 61-90 are outside the per-type-file try/catch, `routeUserPrompt()` directly awaits command handlers without a catch at `cli/src/commands/router.ts:443-462`, and tests explicitly expect knowledge/mkdir failures to throw at `cli/src/commands/__tests__/init.test.ts:289-331` despite naming them graceful-handling cases.
- **Confidence:** High — Evidence.

## [MEDIUM] performance — cli/src/utils/directory-browser.ts:15 — First-run browsing performs synchronous filesystem fan-out on the render thread
- **Risk:** Opening a large home directory, network mount, or slow filesystem can freeze the TUI while every entry is synchronously statted and every child receives another `.git` stat.
- **Fix:** Enumerate asynchronously in cancellable batches, render partial results, limit concurrent git detection, and cache directory metadata while the picker is open.
- **Evidence:** `getDirectories()` synchronously calls `readdirSync`, `statSync(fullPath)`, and `hasGitDirectory(fullPath)` for every item at lines 15-49, and `useDirectoryBrowser()` invokes it during render memoization at `cli/src/hooks/use-directory-browser.ts:41-47`; tests cover small temporary directories but no high-cardinality or slow-I/O behavior.
- **Confidence:** Medium — Inference from synchronous hot-path I/O.

## [MEDIUM] test coverage gaps — cli/src/__tests__/cli-args.test.ts:15 — CLI argument tests do not exercise the production parser
- **Risk:** Flags central to onboarding (`--cwd`, `--continue`, `--plan`, `--local`, and the new `--trust-project-agents`) can regress while the argument suite remains green.
- **Fix:** Export a pure production `parseArgs(argv)` helper and test its exact Commander definition, help text, interactions, invalid paths, and trust behavior rather than rebuilding a smaller test-only command.
- **Evidence:** `parseTestArgs()` lines 15-51 constructs a separate command named `codecane` with only `--agent` and `--clear-logs`, while production `parseArgs()` defines the omitted flags at `cli/src/index.tsx:107-164`; the targeted suite passed all 12 tests without touching those production branches.
- **Confidence:** High — Evidence.

## [LOW] dependency hygiene — cli/src/index.tsx:25 — Runtime import is not declared by the CLI package
- **Risk:** `picocolors` currently resolves through workspace/transitive installation, so dependency graph changes or isolated packaging can break CLI startup unexpectedly.
- **Fix:** Add `picocolors` as a direct pinned CLI dependency and add an isolated-package/binary smoke check that rejects undeclared runtime imports.
- **Evidence:** `cli/src/index.tsx:25` imports `picocolors`, but `cli/package.json:34-71` does not declare it and repository package manifests contain no direct `picocolors` entry.
- **Confidence:** High — Evidence.

## Strengths observed

- Provider schemas reject non-HTTP(S) endpoints, require HTTPS when an API key is attached, and restrict plain HTTP to localhost (`sdk/src/provider-config.ts:177-221,253-293`).
- Model discovery has a 30-second cancellable timeout and avoids sending provider authorization to cross-origin custom endpoints by default (`sdk/src/model-discovery.ts:140-202,313-352`).
- OAuth uses PKCE, state validation, a loopback-only callback listener, escaped callback HTML, sanitized exchange errors, and owner-only credential permissions (`cli/src/utils/chatgpt-oauth.ts:72-106,156-237`; `sdk/src/credentials.ts:34-53,150-184`).
- Provider readiness produces actionable missing-route, missing-key, and missing-OAuth messages before a send (`cli/src/utils/openbuff-provider.ts:1176-1227`; `sdk/src/provider-config.ts:1577-1619`).
- Agent validation is local by default, filters invalid definitions before runtime, and the provider/config cache has meaningful invalidation coverage.
- The selected targeted suite completed with 216 passing tests and no failures across CLI args, project/path helpers, init, provider setup, OAuth sanitization, SDK credentials, local-agent loading, and validation.

## Coverage / files actually read

- **OC-1 startup:** `cli/src/index.tsx`, `cli/src/init/init-app.ts`, `cli/src/init/init-direnv.ts`, `cli/src/project-files.ts`, `cli/src/utils/env.ts`, `cli/src/utils/create-run-config.ts`, and the listed startup/argument/direnv tests by direct read or targeted symbol review.
- **OC-2 project selection:** `project-picker-screen.tsx`, `use-directory-browser.ts`, `directory-browser.ts`, `project-picker.ts`, `recent-projects.ts`, `use-path-tab-completion.ts`, `path-completion.ts`, `selectable-list.tsx`, `use-searchable-list.ts`, and all listed helper tests.
- **OC-3 init:** `commands/init.ts`, the init branch of `command-registry.ts`, the generator script and source-template surface, plus init and generated-source test references.
- **OC-4 settings/env/theme:** `settings.ts`, `auth.ts`, `theme-config.ts`, `use-theme.tsx`, relevant `chat-store.ts`, CLI/common/SDK env helpers and types, and their listed tests/docs.
- **OC-5 provider UX/readiness:** provider picker, model route picker, relevant `chat.tsx` and command/router branches, `openbuff-provider.ts`, send-readiness hooks/helpers, selectable/searchable primitives, and provider/router/readiness tests.
- **OC-6 provider SDK:** schema, load/merge/cache/write and model-resolution ranges of `provider-config.ts`; discovery implementation; model-provider integration ranges; example JSON files; and the relevant model-provider tests.
- **OC-7 OAuth:** CLI OAuth utility/banner/input routing, constants, credential storage, backend fetch/request transformation and OAuth policy ranges in `llm.ts`, plus listed OAuth/credential/backend tests.
- **OC-8 validation:** CLI registry and validation UX helpers, SDK agent loading/validation, common validator/schema ranges, and listed CLI/SDK/common tests (including `sdk/src/__tests__/load-agents.test.ts` as corroboration).
- **Docs/examples:** `README.md`, `.env.example`, `docs/configuration.md`, `docs/local-mode.md`, `docs/environment-variables.md`, `docs/request-flow.md`, `docs/development.md` references, `docs/agents-and-tools.md`, `docs/openbuff-provider-model-setup-ux.md`, and all four example configuration files.
- Existing `.agents/sessions/**` and prior audit finding/report files were not read.
