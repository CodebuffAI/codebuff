# Coverage matrix

Audit focus: shipped orchestrators and subagents, their runtime/SDK contracts, CLI agent UX, local agent templates, and evaluation feedback.

| Domain                                                                            | Shard IDs                                | Covered |
| --------------------------------------------------------------------------------- | ---------------------------------------- | ------- |
| Orchestrator core, plan/execute modes, validation/reviewer gates                  | orchestrator-picker, orchestrator-search | yes     |
| Editor, basher, terminal/background execution                                     | execution-picker, execution-search       | yes     |
| File discovery, code search, web/docs research, browser, librarian                | discovery-picker, discovery-search       | yes     |
| Reviewer, security, debugger, test/doc writer, git committer                      | quality-picker, quality-search           | yes     |
| Agent runtime, SDK contracts, routing, permissions, cancellation, background work | runtime-picker, runtime-search           | yes     |
| CLI nested-agent UX, local-agent registry/templates, eval feedback                | cli-ux-picker, cli-ux-search             | yes     |

## Subsystem enumeration

| Top-level directory  | Disposition                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `.agents`            | audited — local CLI agents, shared agent factory/schema, permission defaults                    |
| `.bin`               | out-of-scope — runtime binary shim, not agent behavior                                          |
| `.codebuff-index`    | out-of-scope — generated index data; query/index contracts were audited in source               |
| `.codex`             | out-of-scope — external assistant configuration, not shipped Openbuff agents                    |
| `.e2e-scratch`       | out-of-scope — test scratch fixtures                                                            |
| `.git`               | out-of-scope — repository metadata                                                              |
| `.github`            | out-of-scope — CI/release automation, not agent runtime/UX                                      |
| `.omx`               | out-of-scope — external orchestration artifacts, not shipped Openbuff runtime                   |
| `.turbo`             | out-of-scope — build cache                                                                      |
| `.vscode`            | out-of-scope — editor settings                                                                  |
| `agents`             | audited — all active shipped agent families and agent tests/wiring                              |
| `agents-graveyard`   | out-of-scope — deprecated agents; referenced only to verify stale best-of-N coverage            |
| `assets`             | out-of-scope — static assets unrelated to agent behavior                                        |
| `cli`                | audited — agent selection, nested rendering, spawn reconciliation, statuses, plan/eval UX       |
| `common`             | audited — agent schemas, spawn/tool contracts, validation and permissions metadata              |
| `debug`              | out-of-scope — generated logs; logging call sites were audited in runtime source                |
| `docs`               | audited — agents/tools and request-flow behavioral contracts                                    |
| `e2e-traces`         | out-of-scope — generated trace artifacts                                                        |
| `evals`              | audited — agent runner and breadth/sharding feedback contracts                                  |
| `node_modules`       | out-of-scope — vendored dependencies; no dependency vulnerability scan requested                |
| `openbuff.d.example` | audited — example agent routing/configuration surface                                           |
| `packages`           | audited — agent-runtime, index/search and relevant tool handlers/contracts                      |
| `scripts`            | out-of-scope — maintenance/build scripts, except structural-map builder used for scoping        |
| `sdk`                | audited — local agent loading, tool execution, browser/terminal/background lifecycle            |
| `test`               | out-of-scope — global test bootstrap; relevant package/agent tests were audited                 |
| `web`                | out-of-scope — not part of the active local CLI agent surface described by current architecture |

## Coverage notes

- Six complete shard pairs were used: one file-picker-style inventory and one code-searcher-style verification per domain.
- Each pair evaluated security, correctness, state mutation, error handling, performance, dependency hygiene, test coverage, and API/ABI contracts, with additional focus on feature gaps and user experience.
- Findings are source-audit results. No live provider/browser destructive scenarios were executed.
