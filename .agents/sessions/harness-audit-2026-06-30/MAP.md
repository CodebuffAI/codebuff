# Structural Map — openbuff

- **Project root:** `/home/ben/Code/CLI/openbuff`
- **Built at:** 2026-07-01T04:03:51.215Z
- **Total files indexed:** 1533
- **Graph:** 13348 nodes, 66364 edges

> Pin this file in context. Every audit shard navigates from here instead of doing fuzzy round-trip discovery.

## Entry points
- `cli/src/index.tsx`
- `packages/code-map/src/index.ts`
- `packages/indexer/src/index.ts`
- `packages/internal/src/index.ts`

## Directories (by size, biggest first)

| dir | files | total size | top symbols |
| --- | --- | --- | --- |
| `cli` | 413 | 2.8 MB | render, main, TestItem, tmux, createErrorMessage, formatTimestamp |
| `packages` | 296 | 2.0 MB | Greeting, greet, start, Greeter, flush, doGenerate |
| `sdk` | 156 | 1.2 MB | main, run, createMockFs, log, resolveMcpEnv, errorResult |
| `common` | 225 | 950.1 KB | createMockLogger, getStringProperty, process, sleep, size, BROWSER_DEFAULTS |
| `agents` | 78 | 921.5 KB | extractInlineFunctionSource, parseGateStateBlock, collectToolInputFiles, isFileChangingTool, hasEditArtifact, TaskDefinition |
| `evals` | 62 | 785.7 KB | main, run, log, PROMPT_PREFIX, assertCleanWorktree, RunOutput |
| `scripts` | 67 | 508.1 KB | main, parseArgs, computeCost, ConversationMessage, TurnResult, makeConversationStreamRequest |
| `.omx` | 20 | 363.0 KB | — |
| `agents-graveyard` | 121 | 350.6 KB | createBase2WithTaskResearcher, getLatestEditToolResults, extractSpawnResults, getSpawnResults, createResearchImplementOrchestrator, createBase2Implementor |
| `bun.lock` | 1 | 269.8 KB | — |
| `󰎞_001.webp` | 1 | 251.8 KB | — |
| `.agents` | 27 | 198.5 KB | publisher, getSpawnerPrompt, getSystemPrompt, getInstructionsPrompt, getDefaultReviewModeInstructions, getWorkModeInstructions |
| `docs` | 13 | 116.0 KB | — |
| `.github` | 14 | 50.7 KB | — |
| `openbuff.d` | 4 | 20.4 KB | — |
| `openbuff.d.bak` | 3 | 13.7 KB | — |
| `openbuff-2.d.bak` | 3 | 13.4 KB | — |
| `LICENSE` | 1 | 11.1 KB | — |
| `.bin` | 1 | 8.5 KB | — |
| `README.zh-CN.md` | 1 | 8.1 KB | — |
| `README.md` | 1 | 8.0 KB | — |
| `WINDOWS.md` | 1 | 7.3 KB | — |
| `CONTRIBUTING.md` | 1 | 5.6 KB | — |
| `CODE_OF_CONDUCT.md` | 1 | 4.5 KB | — |
| `eslint.config.js` | 1 | 4.0 KB | — |
| `package.json` | 1 | 2.5 KB | — |
| `INFISICAL_SETUP_GUIDE.md` | 1 | 2.4 KB | — |
| `AGENTS.md` | 1 | 2.3 KB | — |
| `ROUTER.md` | 1 | 1.9 KB | — |
| `.env.example` | 1 | 1.7 KB | — |
| `tsconfig.json` | 1 | 839 B | — |
| `SECURITY.md` | 1 | 519 B | — |
| `.gitignore` | 1 | 484 B | — |
| `.vscode` | 1 | 438 B | — |
| `bunfig.toml` | 1 | 432 B | — |
| `.prettierrc` | 1 | 389 B | — |
| `tsconfig.base.json` | 1 | 386 B | — |
| `test` | 1 | 332 B | setup |
| `knowledge.md` | 1 | 284 B | — |
| `.e2e-scratch` | 2 | 279 B | add, greet, multiply |
| `NOTICE` | 1 | 156 B | — |
| `openbuff.json` | 1 | 118 B | — |
| `.commandcode` | 1 | 86 B | — |
| `.envrc` | 1 | 30 B | — |
| `.bun-version` | 1 | 7 B | — |

## Largest files per directory

### `cli`
- `cli/bin/tree-sitter.wasm` — 200.7 KB, 0 symbols
- `cli/src/chat.tsx` — 53.0 KB, 1 symbols
- `cli/src/hooks/helpers/__tests__/send-message.test.ts` — 51.0 KB, 0 symbols
- `cli/src/utils/__tests__/send-message-helpers.test.ts` — 47.7 KB, 0 symbols
- `cli/src/utils/__tests__/message-block-helpers.test.ts` — 42.9 KB, 0 symbols

### `packages`
- `packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts` — 92.3 KB, 1 symbols
- `packages/agent-runtime/src/__tests__/process-str-replace.test.ts` — 67.4 KB, 0 symbols
- `packages/agent-runtime/src/__tests__/run-programmatic-step.test.ts` — 64.3 KB, 0 symbols
- `packages/agent-runtime/src/process-str-replace.ts` — 58.4 KB, 28 symbols
- `packages/agent-runtime/src/run-agent-step.ts` — 50.3 KB, 4 symbols

### `sdk`
- `sdk/src/__tests__/model-provider.test.ts` — 69.2 KB, 3 symbols
- `sdk/src/provider-config.ts` — 68.5 KB, 30 symbols
- `sdk/src/tools/browser-logs.ts` — 61.7 KB, 30 symbols
- `sdk/src/impl/llm.ts` — 47.9 KB, 21 symbols
- `sdk/src/__tests__/run-cancellation.test.ts` — 41.6 KB, 1 symbols

### `common`
- `common/src/templates/initial-agents-dir/types/tools.ts` — 43.2 KB, 30 symbols
- `common/src/__tests__/agent-validation.test.ts` — 28.8 KB, 0 symbols
- `common/src/util/__tests__/messages.test.ts` — 27.4 KB, 0 symbols
- `common/src/util/__tests__/saxy.test.ts` — 26.1 KB, 0 symbols
- `common/src/browser-actions.ts` — 25.4 KB, 30 symbols

### `agents`
- `agents/base2/base2.ts` — 138.1 KB, 30 symbols
- `agents/__tests__/base2.test.ts` — 100.4 KB, 4 symbols
- `agents/__tests__/context-pruner.test.ts` — 97.2 KB, 1 symbols
- `agents/types/tools.ts` — 43.2 KB, 30 symbols
- `agents/context-pruner.ts` — 40.1 KB, 12 symbols

### `evals`
- `evals/buffbench/restrict-tool-types-base2-lite-error-ftj2.json` — 418.9 KB, 0 symbols
- `evals/buffbench/__tests__/plan-sharding-signals.test.ts` — 31.3 KB, 5 symbols
- `evals/buffbench/plan-sharding-signals.ts` — 27.5 KB, 22 symbols
- `evals/buffbench/run-buffbench.ts` — 18.8 KB, 5 symbols
- `evals/buffbench/pick-commits.ts` — 18.6 KB, 12 symbols

### `scripts`
- `scripts/test-fireworks-cache-intervals.ts` — 34.3 KB, 10 symbols
- `scripts/benchmark-providers.ts` — 32.6 KB, 16 symbols
- `scripts/test-fireworks-long.ts` — 30.2 KB, 6 symbols
- `scripts/test-canopywave-long.ts` — 28.5 KB, 5 symbols
- `scripts/test-siliconflow.ts` — 26.7 KB, 5 symbols

### `.omx`
- `.omx/state/todos-session.json` — 339.9 KB, 0 symbols
- `.omx/logs/turns-2026-06-12.jsonl` — 7.6 KB, 0 symbols
- `.omx/state/native-stop-state.json` — 3.6 KB, 0 symbols
- `.omx/logs/turns-2026-06-11.jsonl` — 2.7 KB, 0 symbols
- `.omx/state/sessions/019ebbe7-8308-7293-9d45-7be5eaaf0f6c/notify-hook-state.json` — 1.7 KB, 0 symbols

### `agents-graveyard`
- `agents-graveyard/base/base-prompts.ts` — 25.3 KB, 3 symbols
- `agents-graveyard/editor/best-of-n/editor-best-of-n.ts` — 18.5 KB, 4 symbols
- `agents-graveyard/base/ask.ts` — 12.2 KB, 0 symbols
- `agents-graveyard/registry/transform-agent.ts` — 12.0 KB, 0 symbols
- `agents-graveyard/base2/task-researcher/base2-with-task-researcher-planner-pro.ts` — 11.4 KB, 1 symbols

### `bun.lock`
- `bun.lock` — 269.8 KB, 0 symbols

### `󰎞_001.webp`
- `󰎞_001.webp` — 251.8 KB, 0 symbols

### `.agents`
- `.agents/types/tools.ts` — 43.2 KB, 30 symbols
- `.agents/sessions/harness-audit-2026-06-30/findings/S9-cli-streaming.md` — 34.3 KB, 0 symbols
- `.agents/types/agent-definition.ts` — 13.7 KB, 3 symbols
- `.agents/sessions/harness-audit-2026-06-30/PLAN.md` — 13.7 KB, 0 symbols
- `.agents/lib/cli-agent-prompts.ts` — 13.7 KB, 5 symbols

### `docs`
- `docs/codebuff-to-openbuff-migration.md` — 22.6 KB, 0 symbols
- `docs/openbuff-provider-model-setup-ux.md` — 17.4 KB, 0 symbols
- `docs/configuration.md` — 16.4 KB, 0 symbols
- `docs/architecture.md` — 11.8 KB, 0 symbols
- `docs/request-flow.md` — 11.1 KB, 0 symbols

### `.github`
- `.github/workflows/cli-release-build.yml` — 11.7 KB, 0 symbols
- `.github/workflows/cli-release-staging.yml` — 8.8 KB, 0 symbols
- `.github/workflows/ci.yml` — 7.6 KB, 0 symbols
- `.github/knowledge.md` — 5.4 KB, 0 symbols
- `.github/workflows/cli-release-prod.yml` — 4.9 KB, 0 symbols

### `openbuff.d`
- `openbuff.d/providers.json` — 16.9 KB, 0 symbols
- `openbuff.d/routes.json` — 2.1 KB, 0 symbols
- `openbuff.d/hooks.json` — 1.2 KB, 0 symbols
- `openbuff.d/indexing.json` — 146 B, 0 symbols

### `openbuff.d.bak`
- `openbuff.d.bak/providers.json` — 9.2 KB, 0 symbols
- `openbuff.d.bak/routes.json` — 4.3 KB, 0 symbols
- `openbuff.d.bak/indexing.json` — 146 B, 0 symbols

### `openbuff-2.d.bak`
- `openbuff-2.d.bak/providers.json` — 9.2 KB, 0 symbols
- `openbuff-2.d.bak/routes.json` — 4.0 KB, 0 symbols
- `openbuff-2.d.bak/indexing.json` — 146 B, 0 symbols

### `LICENSE`
- `LICENSE` — 11.1 KB, 0 symbols

### `.bin`
- `.bin/bun` — 8.5 KB, 0 symbols

### `README.zh-CN.md`
- `README.zh-CN.md` — 8.1 KB, 0 symbols

### `README.md`
- `README.md` — 8.0 KB, 0 symbols

### `WINDOWS.md`
- `WINDOWS.md` — 7.3 KB, 0 symbols

### `CONTRIBUTING.md`
- `CONTRIBUTING.md` — 5.6 KB, 0 symbols

### `CODE_OF_CONDUCT.md`
- `CODE_OF_CONDUCT.md` — 4.5 KB, 0 symbols

### `eslint.config.js`
- `eslint.config.js` — 4.0 KB, 0 symbols

### `package.json`
- `package.json` — 2.5 KB, 0 symbols

### `INFISICAL_SETUP_GUIDE.md`
- `INFISICAL_SETUP_GUIDE.md` — 2.4 KB, 0 symbols

### `AGENTS.md`
- `AGENTS.md` — 2.3 KB, 0 symbols

### `ROUTER.md`
- `ROUTER.md` — 1.9 KB, 0 symbols

### `.env.example`
- `.env.example` — 1.7 KB, 0 symbols

### `tsconfig.json`
- `tsconfig.json` — 839 B, 0 symbols

### `SECURITY.md`
- `SECURITY.md` — 519 B, 0 symbols

### `.gitignore`
- `.gitignore` — 484 B, 0 symbols

### `.vscode`
- `.vscode/settings.json` — 438 B, 0 symbols

### `bunfig.toml`
- `bunfig.toml` — 432 B, 0 symbols

### `.prettierrc`
- `.prettierrc` — 389 B, 0 symbols

### `tsconfig.base.json`
- `tsconfig.base.json` — 386 B, 0 symbols

### `test`
- `test/setup-scm-loader.ts` — 332 B, 1 symbols

### `knowledge.md`
- `knowledge.md` — 284 B, 0 symbols

### `.e2e-scratch`
- `.e2e-scratch/widget.ts` — 275 B, 3 symbols
- `.e2e-scratch/browser-agent-note.txt` — 4 B, 0 symbols

### `NOTICE`
- `NOTICE` — 156 B, 0 symbols

### `openbuff.json`
- `openbuff.json` — 118 B, 0 symbols

### `.commandcode`
- `.commandcode/taste/taste.md` — 86 B, 0 symbols

### `.envrc`
- `.envrc` — 30 B, 0 symbols

### `.bun-version`
- `.bun-version` — 7 B, 0 symbols

## Most-imported files (likely key modules)

| in-degree | file |
| --- | --- |
| 76 | `common/src/util/messages.ts` |
| 75 | `common/src/types/bun-test.d.ts` |
| 69 | `cli/src/utils/arrays.ts` |
| 66 | `cli/src/__tests__/release/proxy-http-get.test.ts` |
| 59 | `common/src/tools/params/utils.ts` |
| 58 | `common/src/util/error.ts` |
| 54 | `sdk/e2e/utils/event-collector.ts` |
| 51 | `packages/agent-runtime/src/__tests__/rewrite-symbol.test.ts` |
| 49 | `cli/src/utils/message-block-helpers.ts` |
| 42 | `packages/agent-runtime/src/__tests__/main-prompt.test.ts` |
| 40 | `common/src/util/plan-artifacts.ts` |
| 38 | `sdk/src/provider-config.ts` |
| 37 | `cli/src/hooks/use-theme.tsx` |
| 36 | `cli/src/project-files.ts` |
| 34 | `common/src/testing/mocks/timers.ts` |
| 31 | `.e2e-scratch/widget.ts` |
| 30 | `common/src/types/session-state.ts` |
| 29 | `sdk/e2e/utils/get-api-key.ts` |
| 29 | `agents/base2/base2.ts` |
| 28 | `common/src/util/string.ts` |
| 28 | `cli/scripts/build-binary.ts` |
| 27 | `cli/scripts/release.ts` |
| 27 | `cli/src/utils/env.ts` |
| 27 | `scripts/status-services.ts` |
| 27 | `sdk/src/run.ts` |

## Cross-directory dependencies (architectural layering)

| count | from → to |
| --- | --- |
| 225 | `packages` → `common` |
| 162 | `cli` → `common` |
| 115 | `sdk` → `common` |
| 73 | `cli` → `packages` |
| 64 | `cli` → `sdk` |
| 38 | `sdk` → `packages` |
| 33 | `cli` → `scripts` |
| 25 | `cli` → `.e2e-scratch` |
| 22 | `agents` → `sdk` |
| 20 | `packages` → `cli` |
| 19 | `sdk` → `cli` |
| 19 | `agents-graveyard` → `common` |
| 18 | `agents` → `agents-graveyard` |
| 15 | `packages` → `sdk` |
| 13 | `sdk` → `evals` |
| 11 | `agents` → `common` |
| 10 | `scripts` → `packages` |
| 9 | `evals` → `common` |
| 8 | `evals` → `cli` |
| 8 | `agents` → `cli` |
| 8 | `sdk` → `scripts` |
| 7 | `common` → `cli` |
| 7 | `cli` → `evals` |
| 6 | `packages` → `.e2e-scratch` |
| 6 | `evals` → `sdk` |
| 5 | `common` → `packages` |
| 5 | `common` → `sdk` |
| 5 | `scripts` → `cli` |
| 4 | `agents` → `packages` |
| 4 | `agents` → `evals` |

## Shard sizing hint

Total indexed source: **10.7 MB** across **45** top-level directories.

When sharding for an audit, aim for ~5–15 files per shard. Use the table above to group small dirs together and split huge dirs (e.g. split `src/` by subdirectory).
