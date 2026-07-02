# Coverage matrix

Audit session: `.agents/sessions/harness-audit-2026-06-30/`
Structural map: `.agents/sessions/harness-audit-2026-06-30/MAP.md` (Built at: 2026-07-01T04:03:51.215Z)
Findings directory: `.agents/sessions/harness-audit-2026-06-30/findings/`

## Audit-domain coverage

Every shard was instructed to evaluate all eight audit domains from `agents/patterns/audit-codebase.md`. The finding files are the durable evidence that each shard completed.

| Audit domain | Shard IDs | Covered |
| --- | --- | --- |
| Security | S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14, S15 | yes |
| Correctness | S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14, S15 | yes |
| State mutation | S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14, S15 | yes |
| Error handling | S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14, S15 | yes |
| Performance | S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14, S15 | yes |
| Dependency hygiene | S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14, S15 | yes |
| Test coverage gaps | S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14, S15 | yes |
| API/ABI contract breaks | S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14, S15 | yes |

## Shard coverage

| Shard | Subsystem / scope | Findings file | Covered |
| --- | --- | --- | --- |
| S1 | agent-runtime: loop & streaming | `findings/S1-runtime-loop.md` | yes |
| S2 | agent-runtime: deterministic edits & reads | `findings/S2-runtime-edits.md` | yes |
| S3 | agent-runtime: context, tokens, pruning | `findings/S3-runtime-context.md` | yes |
| S4 | agent-runtime: tools/handlers (file/edit/search) | `findings/S4-runtime-tools.md` | yes |
| S5 | agents: base2 family + gate lifecycle | `findings/S5-agents-base2-gates.md` | yes |
| S6 | agents: support agents | `findings/S6-agents-support.md` | yes |
| S7 | SDK: client, run, providers, failover | `findings/S7-sdk-providers.md` | yes |
| S8 | SDK: tools surface + tests | `findings/S8-sdk-tools.md` | yes |
| S9 | CLI: streaming, hooks, send-message | `findings/S9-cli-streaming.md` | yes |
| S10 | CLI: components & screens | `findings/S10-cli-components.md` | yes |
| S11 | common: schemas, types, utilities | `findings/S11-common-schemas.md` | yes |
| S12 | packages/indexer + packages/code-map | `findings/S12-indexer-code-map.md` | yes |
| S13 | evals/buffbench harness | `findings/S13-evals-harness.md` | yes |
| S14 | scripts, guards, openbuff.d config surface | `findings/S14-scripts-config.md` | yes |
| S15 | docs drift against implementation | `findings/S15-docs-drift.md` | yes |

## Subsystem enumeration

Source: `.agents/sessions/harness-audit-2026-06-30/MAP.md` directory table. Every top-level entry is marked audited or out-of-scope.

| Top-level entry | Disposition | Shards / reason |
| --- | --- | --- |
| `cli/` | audited | S9, S10 |
| `packages/` | audited | S1, S2, S3, S4, S12 |
| `sdk/` | audited | S7, S8 |
| `common/` | audited | S11 |
| `agents/` | audited | S5, S6 |
| `evals/` | audited | S13 |
| `scripts/` | audited | S14 |
| `docs/` | audited | S15 (drift-only) |
| `openbuff.d/` | audited | S14 |
| `openbuff.json` | audited | S14 |
| `package.json` | audited | S14/S15 as package-script/config contract surface |
| `bun.lock` | out-of-scope | lockfile; no dependency upgrade or vulnerability scan in this static audit |
| `.omx/` | out-of-scope | local tool state, not harness source |
| `agents-graveyard/` | out-of-scope | graveyard/dead code intentionally excluded |
| `.agents/` | out-of-scope | session/local agent artifacts; only `.agents/sessions/harness-audit-2026-06-30/` artifacts are produced/read for audit orchestration |
| `.github/` | out-of-scope | CI metadata; hook/release wrapper config concerns are represented in S14 where relevant |
| `openbuff.d.bak/` | out-of-scope | backup config snapshot |
| `openbuff-2.d.bak/` | out-of-scope | backup config snapshot |
| `.bin/` | out-of-scope | local binary wrapper/tooling |
| `README.zh-CN.md` | out-of-scope | general README; docs audit scope was `docs/` drift only |
| `README.md` | out-of-scope | general README; docs audit scope was `docs/` drift only |
| `WINDOWS.md` | out-of-scope | platform notes outside harness flow audit |
| `CONTRIBUTING.md` | out-of-scope | contributor process docs outside harness flow audit |
| `CODE_OF_CONDUCT.md` | out-of-scope | community policy, not harness source |
| `eslint.config.js` | out-of-scope | lint config; not a harness runtime/config surface for this audit |
| `INFISICAL_SETUP_GUIDE.md` | out-of-scope | secret-management guide outside harness flow audit |
| `AGENTS.md` | out-of-scope | contributor/agent guidance outside drift-only docs scope |
| `ROUTER.md` | out-of-scope | routing prose outside selected docs drift files |
| `.env.example` | out-of-scope | example env file; env contract audited via S11/S15 against schema/docs |
| `tsconfig.json` | out-of-scope | compiler config, not harness runtime behavior in this static audit |
| `SECURITY.md` | out-of-scope | policy doc, not harness implementation |
| `.gitignore` | out-of-scope | repository hygiene config |
| `.vscode/` | out-of-scope | editor-local tooling state |
| `bunfig.toml` | out-of-scope | package-manager config outside harness runtime audit |
| `.prettierrc` | out-of-scope | formatting config |
| `tsconfig.base.json` | out-of-scope | shared compiler config, not harness runtime behavior in this static audit |
| `test/` | out-of-scope | SCM loader setup only; targeted tests were considered inside subsystem shards |
| `knowledge.md` | out-of-scope | agent memory stub, not harness implementation |
| `.e2e-scratch/` | out-of-scope | scratch files |
| `NOTICE` | out-of-scope | legal notice |
| `.commandcode` | out-of-scope | local command metadata |
| `.envrc` | out-of-scope | shell environment helper |
| `.bun-version` | out-of-scope | package-manager version pin |
| `󰎞_001.webp` | out-of-scope | image asset/untracked local file, not harness source |

## Validation gate

- All 15 shard finding files exist.
- All 8 audit domains are covered by all 15 shards.
- Every top-level entry listed in MAP.md is marked audited or out-of-scope with a reason.
