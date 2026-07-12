# Coverage matrix

| Functional domain | Discovery shard | Audit shard | Covered |
|---|---|---|---|
| Startup, onboarding, project selection, provider/model config, OAuth, local-agent validation | picker-onboarding-config | audit-onboarding-config | yes |
| Input, keyboard, commands, bash, history, suggestions, clipboard, attachments, images | picker-interaction-commands | audit-interaction-commands | yes |
| Send/stream lifecycle, queueing, cancellation, sessions, persistence, SDK/runtime contracts | picker-runtime-state | audit-runtime-state | yes |
| Layout, themes, accessibility, scrolling, nested agents/tools, rendering performance | picker-presentation-quality | audit-presentation-quality | yes |
| Packaging, release/update, platforms, CI, logging, analytics/privacy, diagnostics, docs | picker-distribution-quality | audit-distribution-quality | yes |
| Security | all five pairs | all five audit shards | yes |
| Correctness | all five pairs | all five audit shards | yes |
| State mutation | all five pairs | all five audit shards | yes |
| Error handling | all five pairs | all five audit shards | yes |
| Performance | all five pairs | all five audit shards | yes |
| Dependency hygiene | all five pairs | all five audit shards | yes |
| Test coverage gaps | all five pairs | all five audit shards | yes |
| API/ABI contract breaks | all five pairs | all five audit shards | yes |

## Subsystem enumeration

| Top-level subsystem | Disposition |
|---|---|
| `cli/` | audited across five functional shard pairs; generated bundles, `node_modules`, and compiled outputs excluded |
| `sdk/` | audited at CLI-facing provider, run/event, persistence, filesystem/tool, packaging, and OAuth boundaries; unrelated standalone SDK surface out-of-scope |
| `common/` | audited at CLI contracts, messages/events, project tree, config/env, analytics, agent validation, and tool-result boundaries; unrelated utilities out-of-scope |
| `packages/` | audited at `agent-runtime`, `indexer`, `code-map`, `internal`, and build integration paths used by the CLI; package-internal behavior unrelated to CLI out-of-scope |
| `agents/` | out-of-scope except documented CLI rendering/command contracts; prompt and agent-quality audit is a separate product surface |
| `evals/` | out-of-scope except breadth-classification machinery used to select this audit workflow |
| `scripts/` | audited only for CLI smoke, tmux, structural-map, and release/test helpers; unrelated provider benchmarks/services out-of-scope |
| `agents-graveyard/` | out-of-scope: inactive historical code |
| `docs/` | audited for architecture, request flow, local mode, configuration, testing, environment, provider setup, and agent/tool CLI contracts |
| `.agents/` | structural map and audit instructions read; existing findings/reports explicitly excluded to preserve independence |
| `.github/` | audited CLI CI, nightly E2E, release build, staging, production, and adjacent SDK release workflows |
| `openbuff.d.example/` | audited as executable provider/routes/hooks/indexing configuration examples |
| `.bin/` | out-of-scope: local tool shim |
| `.vscode/` | out-of-scope: editor-only settings |
| `.e2e-scratch/` | out-of-scope: transient test fixtures |
| `test/` | audited only where root test setup affects CLI tests |

## Root files and metadata

| Root artifact | Disposition |
|---|---|
| `package.json`, `bun.lock`, `.bun-version`, `bunfig.toml`, `tsconfig.json`, `tsconfig.base.json`, `eslint.config.js` | audited selectively for CLI dependency, runtime, workspace, build, and validation contracts |
| `README.md`, `README.zh-CN.md`, `WINDOWS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.env.example`, `openbuff.json.example` | audited where they make CLI install, platform, privacy, configuration, and operational claims |
| `AGENTS.md` | controlling audit instructions; not a product subsystem |
| `ROUTER.md`, `INFISICAL_SETUP_GUIDE.md`, `knowledge.md`, `.envrc`, `.gitignore`, `.prettierrc`, `CODE_OF_CONDUCT.md`, `LICENSE`, `NOTICE` | out-of-scope except incidental references; they do not materially implement the current CLI surface |

## Exclusions

- Existing audit reports and findings were not used as source evidence.
- No product code was edited by this audit.
- Live provider/model calls were not executed; runtime behavior was assessed from source, deterministic tests, and isolated local TUI captures.
- The worktree was actively changing during the audit. Time-sensitive validation is reported with its observed timestamp/state, and transient parse failures are separated from final-state findings.
