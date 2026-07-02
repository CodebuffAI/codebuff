# Shard S14 — scripts / guards / config surface

## [MEDIUM] correctness/state mutation — sdk/src/provider-config.ts:989 — Fragmented openbuff.d config edits do not invalidate the provider config cache
- **Risk:** A long-running process that has already loaded `openbuff.json` can keep using stale routes, providers, indexing, or hook definitions after `openbuff.d/*.json` changes because the cache key only stats the root config paths.
- **Fix:** Build the cache key from the full resolved `sourceFilePaths` set (including expanded fragments) or include `openbuff.d` fragment mtimes in the pre-read cache key.
- **Evidence:** `function buildProviderConfigCacheKey(configPaths: string[], explicitConfigPath: string | undefined): string { ... for (const configPath of configPaths) { const stat = fs.statSync(configPath) ... } }` while `readProviderConfigFile` implicitly expands `openbuff.d` fragments.

## [MEDIUM] API/ABI contract breaks/correctness — sdk/src/provider-config.ts:1964 — `/setup` merge drops existing failover and step-limit config
- **Risk:** Running a non-forced provider setup against an existing config silently omits `failoverModels` and `maxAgentSteps` from the merged config, breaking previously configured failover behavior and run limits.
- **Fix:** Preserve `existingConfig.failoverModels` and `existingConfig.maxAgentSteps` in the merge and route/write those keys in fragmented configs.
- **Evidence:** `const mergedConfig: ProviderConfigFile = { providers: ..., defaultModel: ..., modes: ..., agents: ..., indexing: ..., fileChangeHooks: ... }` contains no `failoverModels` or `maxAgentSteps` fields.

## [LOW] security — scripts/generate-tool-definitions.ts:47 — Prettier shell command interpolates unescaped paths
- **Risk:** Running the generator from a checkout path containing shell metacharacters can execute unintended shell syntax because absolute output paths derived from `process.cwd()` are interpolated into a shell command string.
- **Fix:** Invoke Prettier with `execFileSync`/`spawnSync` and an argv array, or escape paths with a shell-safe quoting routine.
- **Evidence:** ``execSync(`npx prettier --write ${outputPaths.map((path) => `"${path}"`).join(' ')}`, { stdio: 'inherit' })``.

## [LOW] correctness/test coverage gaps — scripts/check-tool-registration.ts:49 — Tool registration guard can pass on incidental substring matches
- **Risk:** The readiness guard can report a runtime handler as registered when `packages/agent-runtime/src/tools/handlers/list.ts` merely contains the text `<tool>:` in a comment or unrelated object, letting incomplete tool wiring pass before prompts recommend the tool.
- **Fix:** Import the actual handler registry or parse the exported registry keys instead of using raw substring checks, and add a negative test with an incidental match.
- **Evidence:** `ok: fileMentions('packages/agent-runtime/src/tools/handlers/list.ts', `${tool}:`)`.
