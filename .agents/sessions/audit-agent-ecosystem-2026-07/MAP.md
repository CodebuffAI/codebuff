# Structural Map — openbuff

- **Project root:** `/home/ben/Code/CLI/openbuff`
- **Built at:** 2026-07-11T07:21:35.959Z
- **Total files indexed:** 2138
- **Graph:** 15036 nodes, 72053 edges

> Pin this file in context. Every audit shard navigates from here instead of doing fuzzy round-trip discovery.

## Entry points

- `cli/src/index.tsx`
- `packages/code-map/src/index.ts`
- `packages/indexer/src/index.ts`
- `packages/internal/src/index.ts`

## Directories (by size, biggest first)

| dir                        | files | total size | top symbols                                                                                                                                                |
| -------------------------- | ----- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evals`                    | 597   | 12.4 MB    | main, run, makeEvalRun, makeAgentResults, toolCall, log                                                                                                    |
| `cli`                      | 426   | 3.0 MB     | render, main, TestItem, tmux, createErrorMessage, formatTimestamp                                                                                          |
| `packages`                 | 312   | 2.3 MB     | Greeting, start, greet, Greeter, flush, doGenerate                                                                                                         |
| `sdk`                      | 161   | 1.4 MB     | main, run, evaluate, createMockFs, log, resolveMcpEnv                                                                                                      |
| `common`                   | 245   | 1.1 MB     | createMockLogger, getStringProperty, getFileExtension, process, sleep, size                                                                                |
| `agents`                   | 93    | 1.1 MB     | extractInlineFunctionSource, parseGateStateBlock, feedJson, collectToolInputFiles, isFileChangingTool, hasEditArtifact                                     |
| `scripts`                  | 67    | 515.7 KB   | main, parseArgs, computeCost, ConversationMessage, TurnResult, makeConversationStreamRequest                                                               |
| `.omx`                     | 30    | 502.5 KB   | —                                                                                                                                                          |
| `agents-graveyard`         | 121   | 350.6 KB   | createBase2WithTaskResearcher, getLatestEditToolResults, extractSpawnResults, getSpawnResults, createResearchImplementOrchestrator, createBase2Implementor |
| `bun.lock`                 | 1     | 270.1 KB   | —                                                                                                                                                          |
| `docs`                     | 13    | 203.1 KB   | —                                                                                                                                                          |
| `.agents`                  | 26    | 178.4 KB   | publisher, getSpawnerPrompt, getSystemPrompt, getInstructionsPrompt, getDefaultReviewModeInstructions, getWorkModeInstructions                             |
| `.github`                  | 14    | 51.8 KB    | —                                                                                                                                                          |
| `openbuff.d.example`       | 4     | 22.5 KB    | —                                                                                                                                                          |
| `LICENSE`                  | 1     | 11.1 KB    | —                                                                                                                                                          |
| `.bin`                     | 1     | 8.5 KB     | —                                                                                                                                                          |
| `README.zh-CN.md`          | 1     | 8.1 KB     | —                                                                                                                                                          |
| `README.md`                | 1     | 8.0 KB     | —                                                                                                                                                          |
| `WINDOWS.md`               | 1     | 7.3 KB     | —                                                                                                                                                          |
| `CONTRIBUTING.md`          | 1     | 5.6 KB     | —                                                                                                                                                          |
| `CODE_OF_CONDUCT.md`       | 1     | 4.5 KB     | —                                                                                                                                                          |
| `eslint.config.js`         | 1     | 4.0 KB     | —                                                                                                                                                          |
| `AGENTS.md`                | 1     | 3.6 KB     | —                                                                                                                                                          |
| `package.json`             | 1     | 2.5 KB     | —                                                                                                                                                          |
| `INFISICAL_SETUP_GUIDE.md` | 1     | 2.5 KB     | —                                                                                                                                                          |
| `ROUTER.md`                | 1     | 2.5 KB     | —                                                                                                                                                          |
| `.env.example`             | 1     | 1.7 KB     | —                                                                                                                                                          |
| `tsconfig.json`            | 1     | 839 B      | —                                                                                                                                                          |
| `SECURITY.md`              | 1     | 520 B      | —                                                                                                                                                          |
| `.gitignore`               | 1     | 487 B      | —                                                                                                                                                          |
| `.vscode`                  | 1     | 438 B      | —                                                                                                                                                          |
| `bunfig.toml`              | 1     | 432 B      | —                                                                                                                                                          |
| `.prettierrc`              | 1     | 389 B      | —                                                                                                                                                          |
| `tsconfig.base.json`       | 1     | 386 B      | —                                                                                                                                                          |
| `test`                     | 1     | 332 B      | setup                                                                                                                                                      |
| `knowledge.md`             | 1     | 287 B      | —                                                                                                                                                          |
| `.e2e-scratch`             | 2     | 279 B      | add, greet, multiply                                                                                                                                       |
| `NOTICE`                   | 1     | 156 B      | —                                                                                                                                                          |
| `openbuff.json.example`    | 1     | 118 B      | —                                                                                                                                                          |
| `.envrc`                   | 1     | 30 B       | —                                                                                                                                                          |
| `.bun-version`             | 1     | 7 B        | —                                                                                                                                                          |

## Largest files per directory

### `evals`

- `evals/buffbench/logs/2026-07-04T17-30_base2/45-fork-read-files-base2-349a140.json` — 472.2 KB, 0 symbols
- `evals/buffbench/logs/2026-07-04T13-41_base2/2-add-deep-thinkers-base2-6c362c3.json` — 469.4 KB, 0 symbols
- `evals/buffbench/restrict-tool-types-base2-lite-error-ftj2.json` — 418.5 KB, 0 symbols
- `evals/buffbench/validate-custom-tools-base2-error-c6yk.json` — 418.3 KB, 0 symbols
- `evals/buffbench/logs/2026-07-04T17-30_base2/38-unify-agent-builder-base2-4852954.json` — 411.4 KB, 0 symbols

### `cli`

- `cli/bin/tree-sitter.wasm` — 200.7 KB, 0 symbols
- `cli/src/hooks/helpers/__tests__/send-message.test.ts` — 55.5 KB, 0 symbols
- `cli/src/utils/__tests__/message-block-helpers.test.ts` — 55.1 KB, 0 symbols
- `cli/src/chat.tsx` — 53.8 KB, 1 symbols
- `cli/src/utils/__tests__/send-message-helpers.test.ts` — 48.1 KB, 0 symbols

### `packages`

- `packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts` — 126.5 KB, 2 symbols
- `packages/agent-runtime/src/__tests__/process-str-replace.test.ts` — 76.8 KB, 0 symbols
- `packages/agent-runtime/src/process-str-replace.ts` — 66.5 KB, 30 symbols
- `packages/agent-runtime/src/__tests__/run-programmatic-step.test.ts` — 65.2 KB, 0 symbols
- `packages/agent-runtime/src/run-agent-step.ts` — 53.3 KB, 4 symbols

### `sdk`

- `sdk/src/__tests__/model-provider.test.ts` — 80.0 KB, 3 symbols
- `sdk/src/provider-config.ts` — 72.5 KB, 30 symbols
- `sdk/src/tools/browser-logs.ts` — 62.8 KB, 30 symbols
- `sdk/src/impl/llm.ts` — 52.9 KB, 20 symbols
- `sdk/src/__tests__/run-cancellation.test.ts` — 44.5 KB, 1 symbols

### `common`

- `common/src/templates/initial-agents-dir/types/tools.ts` — 44.6 KB, 30 symbols
- `common/src/util/__tests__/messages.test.ts` — 41.4 KB, 0 symbols
- `common/src/tools/results/filesystem.ts` — 33.8 KB, 30 symbols
- `common/src/__tests__/agent-validation.test.ts` — 28.9 KB, 0 symbols
- `common/src/util/__tests__/saxy.test.ts` — 26.1 KB, 0 symbols

### `agents`

- `agents/base2/base2.ts` — 169.4 KB, 30 symbols
- `agents/__tests__/context-pruner.test.ts` — 120.8 KB, 2 symbols
- `agents/__tests__/base2.test.ts` — 111.3 KB, 4 symbols
- `agents/context-pruner.ts` — 74.0 KB, 30 symbols
- `agents/types/tools.ts` — 44.6 KB, 30 symbols

### `scripts`

- `scripts/test-fireworks-cache-intervals.ts` — 34.3 KB, 10 symbols
- `scripts/benchmark-providers.ts` — 33.1 KB, 16 symbols
- `scripts/test-fireworks-long.ts` — 30.7 KB, 6 symbols
- `scripts/test-canopywave-long.ts` — 29.0 KB, 5 symbols
- `scripts/test-siliconflow.ts` — 27.3 KB, 5 symbols

### `.omx`

- `.omx/ultragoal/worktree-baseline.json` — 247.5 KB, 0 symbols
- `.omx/ultragoal/brief.md` — 36.3 KB, 0 symbols
- `.omx/plans/prd-read-write-audit-remediation.md` — 36.3 KB, 0 symbols
- `.omx/state/todos-session.json` — 33.9 KB, 0 symbols
- `.omx/plans/traceability-read-write-audit-remediation.md` — 27.8 KB, 0 symbols

### `agents-graveyard`

- `agents-graveyard/base/base-prompts.ts` — 25.3 KB, 3 symbols
- `agents-graveyard/editor/best-of-n/editor-best-of-n.ts` — 18.5 KB, 4 symbols
- `agents-graveyard/base/ask.ts` — 12.2 KB, 0 symbols
- `agents-graveyard/registry/transform-agent.ts` — 12.0 KB, 0 symbols
- `agents-graveyard/base2/task-researcher/base2-with-task-researcher-planner-pro.ts` — 11.4 KB, 1 symbols

### `bun.lock`

- `bun.lock` — 270.1 KB, 0 symbols

### `docs`

- `docs/agents-and-tools.md` — 74.8 KB, 0 symbols
- `docs/codebuff-to-openbuff-migration.md` — 30.7 KB, 0 symbols
- `docs/configuration.md` — 20.6 KB, 0 symbols
- `docs/openbuff-provider-model-setup-ux.md` — 20.4 KB, 0 symbols
- `docs/architecture.md` — 12.3 KB, 0 symbols

### `.agents`

- `.agents/types/tools.ts` — 44.0 KB, 30 symbols
- `.agents/sessions/read-write-tooling-2026-07-10/findings/structured-results-plan.md` — 35.6 KB, 0 symbols
- `.agents/types/agent-definition.ts` — 13.7 KB, 3 symbols
- `.agents/lib/cli-agent-prompts.ts` — 13.7 KB, 5 symbols
- `.agents/sessions/read-write-tooling-2026-07-10/MAP.md` — 11.0 KB, 0 symbols

### `.github`

- `.github/workflows/cli-release-build.yml` — 11.7 KB, 0 symbols
- `.github/workflows/cli-release-staging.yml` — 8.8 KB, 0 symbols
- `.github/workflows/ci.yml` — 7.4 KB, 0 symbols
- `.github/knowledge.md` — 5.4 KB, 0 symbols
- `.github/workflows/cli-release-prod.yml` — 4.9 KB, 0 symbols

### `openbuff.d.example`

- `openbuff.d.example/providers.json` — 19.0 KB, 0 symbols
- `openbuff.d.example/routes.json` — 2.1 KB, 0 symbols
- `openbuff.d.example/hooks.json` — 1.2 KB, 0 symbols
- `openbuff.d.example/indexing.json` — 146 B, 0 symbols

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

### `AGENTS.md`

- `AGENTS.md` — 3.6 KB, 0 symbols

### `package.json`

- `package.json` — 2.5 KB, 0 symbols

### `INFISICAL_SETUP_GUIDE.md`

- `INFISICAL_SETUP_GUIDE.md` — 2.5 KB, 0 symbols

### `ROUTER.md`

- `ROUTER.md` — 2.5 KB, 0 symbols

### `.env.example`

- `.env.example` — 1.7 KB, 0 symbols

### `tsconfig.json`

- `tsconfig.json` — 839 B, 0 symbols

### `SECURITY.md`

- `SECURITY.md` — 520 B, 0 symbols

### `.gitignore`

- `.gitignore` — 487 B, 0 symbols

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

- `knowledge.md` — 287 B, 0 symbols

### `.e2e-scratch`

- `.e2e-scratch/widget.ts` — 275 B, 3 symbols
- `.e2e-scratch/browser-agent-note.txt` — 4 B, 0 symbols

### `NOTICE`

- `NOTICE` — 156 B, 0 symbols

### `openbuff.json.example`

- `openbuff.json.example` — 118 B, 0 symbols

### `.envrc`

- `.envrc` — 30 B, 0 symbols

### `.bun-version`

- `.bun-version` — 7 B, 0 symbols

## Most-imported files (likely key modules)

| in-degree | file                                                           |
| --------- | -------------------------------------------------------------- |
| 101       | `packages/agent-runtime/src/__tests__/rewrite-symbol.test.ts`  |
| 82        | `common/src/util/messages.ts`                                  |
| 75        | `cli/src/utils/arrays.ts`                                      |
| 75        | `common/src/types/bun-test.d.ts`                               |
| 66        | `cli/src/__tests__/release/proxy-http-get.test.ts`             |
| 62        | `common/src/util/error.ts`                                     |
| 59        | `common/src/tools/params/utils.ts`                             |
| 54        | `sdk/e2e/utils/event-collector.ts`                             |
| 49        | `cli/src/utils/message-block-helpers.ts`                       |
| 44        | `cli/src/hooks/use-theme.tsx`                                  |
| 43        | `packages/agent-runtime/src/__tests__/main-prompt.test.ts`     |
| 40        | `sdk/src/provider-config.ts`                                   |
| 40        | `common/src/util/plan-artifacts.ts`                            |
| 39        | `sdk/src/tools/filesystem-authority.ts`                        |
| 38        | `packages/agent-runtime/src/tools/handlers/tool/write-file.ts` |
| 36        | `cli/src/project-files.ts`                                     |
| 34        | `common/src/testing/mocks/timers.ts`                           |
| 33        | `agents/base2/base2.ts`                                        |
| 32        | `scripts/test-canopywave-long.ts`                              |
| 31        | `.e2e-scratch/widget.ts`                                       |
| 31        | `common/src/util/content-hash.ts`                              |
| 30        | `common/src/types/session-state.ts`                            |
| 29        | `sdk/e2e/utils/get-api-key.ts`                                 |
| 28        | `common/src/util/string.ts`                                    |
| 28        | `sdk/src/run.ts`                                               |

## Cross-directory dependencies (architectural layering)

| count | from → to                     |
| ----- | ----------------------------- |
| 251   | `packages` → `common`         |
| 168   | `cli` → `common`              |
| 132   | `sdk` → `common`              |
| 125   | `cli` → `packages`            |
| 62    | `cli` → `sdk`                 |
| 51    | `sdk` → `packages`            |
| 25    | `cli` → `.e2e-scratch`        |
| 23    | `cli` → `scripts`             |
| 22    | `packages` → `cli`            |
| 22    | `agents` → `sdk`              |
| 21    | `sdk` → `cli`                 |
| 19    | `agents` → `agents-graveyard` |
| 19    | `agents-graveyard` → `common` |
| 18    | `packages` → `sdk`            |
| 16    | `sdk` → `scripts`             |
| 13    | `evals` → `common`            |
| 12    | `scripts` → `packages`        |
| 11    | `agents` → `common`           |
| 9     | `evals` → `cli`               |
| 8     | `common` → `packages`         |
| 8     | `agents` → `cli`              |
| 7     | `common` → `cli`              |
| 7     | `evals` → `sdk`               |
| 6     | `cli` → `agents`              |
| 6     | `packages` → `agents`         |
| 6     | `packages` → `.e2e-scratch`   |
| 5     | `agents` → `packages`         |
| 5     | `scripts` → `cli`             |
| 5     | `evals` → `packages`          |
| 5     | `common` → `sdk`              |

## Shard sizing hint

Total indexed source: **23.4 MB** across **41** top-level directories.

When sharding for an audit, aim for ~5–15 files per shard. Use the table above to group small dirs together and split huge dirs (e.g. split `src/` by subdirectory).
