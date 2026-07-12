# Structural Map — cli

- **Project root:** `/home/ben/Code/CLI/openbuff/cli`
- **Built at:** 2026-07-10T09:15:50.758Z
- **Total files indexed:** 421
- **Graph:** 5521 nodes, 22480 edges

> Pin this file in context. Every audit shard navigates from here instead of doing fuzzy round-trip discovery.

## Entry points

- `src/app.tsx`
- `src/index.tsx`

## Directories (by size, biggest first)

| dir                 | files | total size | top symbols                                                                                                |
| ------------------- | ----- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `src`               | 398   | 2.6 MB     | render, TestItem, tmux, createErrorMessage, updateBlocksRecursively, parseHistoryItem                      |
| `release`           | 5     | 30.4 KB    | resetTerminal, createConfig, getPostHogConfig, trackUpdateFailed, getLatestVersion, getLocalPackageVersion |
| `scripts`           | 6     | 30.2 KB    | main, log, AgentDefinition, getAllTsFiles, loadAgentDefinition, generateBundledAgentsFile                  |
| `knowledge.md`      | 1     | 29.6 KB    | —                                                                                                          |
| `release-staging`   | 5     | 29.4 KB    | resetTerminal, createConfig, getPostHogConfig, trackUpdateFailed, getLatestVersion, getLocalPackageVersion |
| `tmux.knowledge.md` | 1     | 9.6 KB     | —                                                                                                          |
| `CHANGELOG.md`      | 1     | 5.0 KB     | —                                                                                                          |
| `package.json`      | 1     | 2.3 KB     | —                                                                                                          |
| `README.md`         | 1     | 1.4 KB     | —                                                                                                          |
| `tsconfig.json`     | 1     | 535 B      | —                                                                                                          |
| `.gitignore`        | 1     | 103 B      | —                                                                                                          |

## Largest files per directory

### `src`

- `src/hooks/helpers/__tests__/send-message.test.ts` — 55.5 KB, 0 symbols
- `src/utils/__tests__/message-block-helpers.test.ts` — 55.1 KB, 0 symbols
- `src/chat.tsx` — 53.8 KB, 1 symbols
- `src/utils/__tests__/send-message-helpers.test.ts` — 48.1 KB, 0 symbols
- `src/utils/__tests__/collapse-helpers.test.ts` — 43.1 KB, 0 symbols

### `release`

- `release/index.js` — 18.6 KB, 19 symbols
- `release/README.md` — 4.9 KB, 0 symbols
- `release/http.js` — 4.5 KB, 8 symbols
- `release/package.json` — 1.4 KB, 0 symbols
- `release/postinstall.js` — 929 B, 0 symbols

### `scripts`

- `scripts/build-binary.ts` — 11.9 KB, 8 symbols
- `scripts/smoke-binary.ts` — 6.8 KB, 2 symbols
- `scripts/prebuild-agents.ts` — 5.5 KB, 5 symbols
- `scripts/release.ts` — 3.0 KB, 6 symbols
- `scripts/test-sdk-file-hooks.sh` — 1.9 KB, 0 symbols

### `knowledge.md`

- `knowledge.md` — 29.6 KB, 0 symbols

### `release-staging`

- `release-staging/index.js` — 17.3 KB, 19 symbols
- `release-staging/README.md` — 5.3 KB, 0 symbols
- `release-staging/http.js` — 4.5 KB, 8 symbols
- `release-staging/package.json` — 1.4 KB, 0 symbols
- `release-staging/postinstall.js` — 901 B, 0 symbols

### `tmux.knowledge.md`

- `tmux.knowledge.md` — 9.6 KB, 0 symbols

### `CHANGELOG.md`

- `CHANGELOG.md` — 5.0 KB, 0 symbols

### `package.json`

- `package.json` — 2.3 KB, 0 symbols

### `README.md`

- `README.md` — 1.4 KB, 0 symbols

### `tsconfig.json`

- `tsconfig.json` — 535 B, 0 symbols

### `.gitignore`

- `.gitignore` — 103 B, 0 symbols

## Most-imported files (likely key modules)

| in-degree | file                                           |
| --------- | ---------------------------------------------- |
| 86        | `src/__tests__/release/proxy-http-get.test.ts` |
| 50        | `src/utils/message-block-helpers.ts`           |
| 42        | `src/hooks/use-theme.tsx`                      |
| 40        | `src/utils/arrays.ts`                          |
| 36        | `src/project-files.ts`                         |
| 28        | `scripts/release.ts`                           |
| 24        | `src/utils/implementor-helpers.ts`             |
| 23        | `src/utils/env.ts`                             |
| 22        | `src/state/chat-store.ts`                      |
| 22        | `src/utils/openbuff-provider.ts`               |
| 19        | `src/utils/terminal-enter-detection.ts`        |
| 19        | `src/components/tools/types.ts`                |
| 18        | `src/utils/theme-system.ts`                    |
| 18        | `src/__tests__/test-utils.ts`                  |
| 18        | `release/index.js`                             |
| 17        | `src/utils/text-layout.ts`                     |
| 16        | `src/utils/strings.ts`                         |
| 16        | `src/hooks/use-terminal-layout.ts`             |
| 15        | `src/utils/block-operations.ts`                |
| 15        | `src/utils/pending-attachments.ts`             |
| 15        | `src/utils/analytics.ts`                       |
| 15        | `src/utils/local-agent-registry.ts`            |
| 15        | `release-staging/http.js`                      |
| 14        | `scripts/build-binary.ts`                      |
| 14        | `src/hooks/helpers/send-message.ts`            |

## Cross-directory dependencies (architectural layering)

| count | from → to                     |
| ----- | ----------------------------- |
| 31    | `src` → `scripts`             |
| 18    | `release-staging` → `release` |
| 9     | `release-staging` → `src`     |
| 9     | `release` → `src`             |
| 9     | `release` → `release-staging` |
| 5     | `scripts` → `src`             |
| 3     | `release-staging` → `scripts` |
| 3     | `src` → `release-staging`     |
| 2     | `release` → `scripts`         |

## Shard sizing hint

Total indexed source: **2.7 MB** across **11** top-level directories.

When sharding for an audit, aim for ~5–15 files per shard. Use the table above to group small dirs together and split huge dirs (e.g. split `src/` by subdirectory).
