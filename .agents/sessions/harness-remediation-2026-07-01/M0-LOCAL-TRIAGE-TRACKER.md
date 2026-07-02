# M0 Local-CLI Remediation Tracker

Session: `.agents/sessions/harness-remediation-2026-07-01/`
Source audit: `.agents/sessions/harness-audit-2026-06-30/AUDIT-REPORT.md`
Created: 2026-07-01

## Product-model premise

Openbuff is a local-first CLI/SDK with BYOK provider calls made directly from the user's machine. There is no hosted Openbuff backend, web app, billing system, account/session auth surface, CORS/cookie boundary, API gateway, or tenant/account model in remediation scope.

Therefore, original audit labels such as `Security`, `API/ABI`, or `auth` are not accepted at face value. Every finding is reclassified by local impact:

- **KH-LS** — keep / high priority / local safety: local filesystem, project-boundary, process, destructive-edit, runaway-work risk.
- **KH-CS** — keep / high priority / correctness-state: stale edit authorization, stale gate/reviewer/index/cache state, async state mutation after abort.
- **KN-CRP** — keep / normal priority / contract-reliability-performance: tool/schema/config drift, diagnostics, parser errors, performance, test gaps.
- **D-OLI** — downgrade / optional local integration: BYOK provider, remote MCP, custom endpoint, local secret-hygiene issue that must preserve user-configured workflows.
- **X-OOS** — discard or defer / out of hosted-model scope: hosted web/backend/billing/auth/CORS/cookie/account/tenant assumptions or guard proposals that would break intended local workflows.

## Re-ranked Top 10 under local CLI risk

| Local rank | Original Top 10 | Finding | Local classification | Decision | Owner milestone | Initial status | Validation target | Rationale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | #1 | `sdk/src/run.ts` — `run_terminal_command.cwd` can escape project root | KH-LS | keep / rewrite as local cwd containment | M1 | unverified against current dirty tree | SDK targeted tests + root typecheck | Local shell cwd escape can affect files/processes outside the intended workspace. This is real local safety, not hosted security. |
| 2 | #2 | `packages/agent-runtime/.../write-file.ts` — truthy `basedOnRead` bypasses freshness gates | KH-CS | keep | M1 | may overlap dirty tree changes in deterministic edit files | agent-runtime edit-state tests | Stale/invalid edit authorization can cause destructive local edits. |
| 3 | read-files state finding from audit state section | `read-files.ts` failed reads can clear stale-edit guards/grant sticky authorization | KH-CS | keep | M1 | likely overlaps current dirty tree (`read-files.ts`, edit-state tests) | agent-runtime edit-state tests + SDK read-files tests | Same root cause as #2 and should be handled together before broader work. |
| 4 | #9 | `packages/indexer/src/index-manager.ts` — `markStale()` does not force next query refresh | KH-CS | keep | M3 | unverified | indexer targeted tests | Stale local index after edits misleads retrieval and planning. |
| 5 | #6 | `cli/src/hooks/helpers/send-message.ts` — abort releases locks while old stream can mutate run state | KH-CS | keep | M2 | unverified | CLI hook/component tests; tmux only if UI changes | Local CLI state race can corrupt runs after abort. |
| 6 | #7 | `evals/buffbench/agent-runner.ts` — eval timeout does not abort underlying agents/processes | KH-LS | keep | M2 | unverified | evals targeted tests | Local runaway eval work can mutate repos/logs after timeout. |
| 7 | #8 | `agents/base2/base2.ts` — stale `<gate-state>` can skip validation/review | KH-CS | keep / rewrite as stale local gate-state correctness | M3 | likely overlaps current dirty tree (`agents/base2/*`, tests) | agents gate lifecycle tests | Relevant as stale local validation state, not hosted trust/security. |
| 8 | #10 | `common/src/tools/list.ts` — SDK advertises tools SDK cannot execute | KN-CRP | keep | M4 | unverified | registry consistency tests + package typechecks | Local tool contract drift causes runtime failures/confusing agents. |
| 9 | #3 | `run-programmatic-step.ts` — `new Function` for stringified `handleSteps` | KN-CRP | rewrite / verify trust source before hardening | M6 or M4 | unverified | runtime programmatic-step tests | Potential local template trust hardening, but do not break bundled/local agent templates without migration. |
| 10 | #5 | `common/src/mcp/client.ts` — MCP cache keys ignore headers | D-OLI | downgrade / keep as optional integration cache correctness | M5 | unverified | common MCP cache tests | Real for optional remote MCP correctness/secret hygiene, but not hosted HIGH security. |
| Deferred from Top 10 | #4 | `sdk/src/model-discovery.ts` — custom discovery endpoints can receive provider API keys cross-origin | D-OLI | drop blanket guard; rewrite as BYOK behavior/redaction/doc test | M5 | unverified | SDK model-discovery tests | Cross-origin custom endpoints are expected for local BYOK. Only implicit/ambiguous credential sending and logging need guardrails. |

## Guard-breaking recommendations to drop or rewrite before implementation

| Original recommendation | Local decision | Replacement framing | Milestone |
| --- | --- | --- | --- |
| Blanket-block provider/model-discovery credentials to cross-origin endpoints | Drop as blanket guard | Preserve user-configured custom provider/model endpoints; document behavior; redact keys; add narrow safeguards only for implicit/ambiguous automatic discovery. | M5 |
| Add hosted auth/CORS/cookie/session/account/billing guards | Discard out of scope | Use local config validation, local secret redaction, and provider endpoint docs only. | M7 docs cleanup |
| Treat SDK/tool drift as public API security exposure | Rewrite | Local SDK/runtime/tool contract correctness. | M4 |
| Treat remote MCP Authorization cache as HIGH hosted security | Rewrite/downgrade | Optional local integration cache identity and secret-hygiene. | M5 |
| Enforce realpath containment everywhere | Rewrite cautiously | Enforce only where tool contract promises project-local paths; preserve explicit user-approved absolute/custom path workflows. | M1 |
| Remove/hard-block `new Function` immediately | Rewrite cautiously | Verify whether string handlers are local/bundled trusted templates; harden with compatibility path. | M6/M4 |

## Finding-family tracker

This table tracks every audit family from `AUDIT-REPORT.md`. Detailed per-file closure must be expanded as implementation reaches each milestone.

| ID range | Audit section / family | Representative files | Original labels | Local classification | Decision | Owner milestone | Status | Tests / validation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-H01 | Terminal cwd escape | `sdk/src/run.ts` | Security HIGH | KH-LS | keep/rewrite local cwd containment | M1 | todo | SDK run/tool tests |
| SEC-H02 / COR-H01 / STATE-H01 | Stale/invalid edit authorization and failed-read authorization | `write-file.ts`, `str-replace.ts`, `read-files.ts`, `process-str-replace.ts` | Security/Correctness/State HIGH | KH-CS | keep | M1 | partially overlaps dirty tree; verify | `packages/agent-runtime` edit-state tests, `sdk` read-files tests |
| SEC-H03 | Stringified programmatic handlers | `run-programmatic-step.ts` | Security HIGH | KN-CRP | rewrite, verify template trust first | M6/M4 | todo | programmatic-step tests |
| SEC-H04 | Model discovery credential handling | `sdk/src/model-discovery.ts` | Security HIGH | D-OLI | downgrade; no blanket cross-origin block | M5 | todo | model-discovery tests, docs |
| SEC-H05 / STATE-M04 | MCP client cache identity | `common/src/mcp/client.ts` | Security/State/API HIGH | D-OLI | downgrade; fix cache correctness/secret redaction | M5 | todo | MCP cache tests |
| SEC-H06 / COR-H02 | Gate state and reviewer freshness | `agents/base2/base2.ts`, gate files/tests | Security/Correctness HIGH | KH-CS | keep as stale local validation state | M3 | partially overlaps dirty tree; verify | agents gate lifecycle/reviewer tests |
| SEC-M01 | Code search cwd symlink escape | `sdk/src/tools/code-search.ts` | Security MEDIUM | KH-LS | keep if contract promises project containment | M1 | todo | SDK code-search symlink integration test |
| SEC-M02 | read_outline path normalization | `read-outline.ts` | Security MEDIUM | KH-LS | keep if project-local contract | M1 | partially overlaps dirty tree; verify | runtime read-outline tests |
| SEC-M03 | Gate path normalizer absolute paths | `agents/base2/gate-paths.ts` | Security MEDIUM | KH-LS/KH-CS | keep if gate paths must be project-local | M1/M3 | todo | gate path tests |
| SEC-M04 | Cache-debug prompt persistence | `cache-debug.ts` | Security MEDIUM | D-OLI/KN-CRP | keep/downgrade as local secret/prompt hygiene | M5/M7 | todo | redaction/docs tests if feasible |
| SEC-M05 | CDN parser WASM self-healing | `packages/code-map/src/init-node.ts` | Security MEDIUM | KN-CRP | keep as dependency hygiene/local executable fetch risk | M6 | todo | code-map init tests/docs |
| SEC-M06 | Eval logs leaking token metadata | `evals/buffbench/setup-test-repo.ts` | Security MEDIUM | KN-CRP/D-OLI | keep as log redaction hygiene | M6/M7 | todo | eval setup tests |
| SEC-L01 | Prettier shell interpolation | `scripts/generate-tool-definitions.ts` | Security LOW | KN-CRP | keep low, opportunistic | M9 | todo | scripts tests/guard |
| SEC-L02 | Raw stack/path leakage | `run-agent-step.ts` | Security LOW | KN-CRP | keep low as UX/error hygiene | M6/M9 | todo | error formatting tests |
| COR-H03 / STATE-H03 | Index freshness | `packages/indexer/src/index-manager.ts`, `query.ts` | Correctness/State HIGH | KH-CS | keep | M3 | todo | indexer freshness tests |
| COR-H04-H06 / TEST-H01-H02 / ABI-H03 | Plan-sharding eval correctness | `evals/buffbench/plan-sharding-signals.ts`, `run-plan-sharding-eval.ts` | Correctness/Test/API HIGH | KN-CRP | keep | M8 | todo | buffbench plan-sharding tests |
| COR-M01 | `hasNoValidation` semantics | `agents/base2/base2.ts` | Correctness/API MEDIUM | KN-CRP | keep | M4 | todo | agents gate tests/docs |
| COR-M02 | Static review join accepted verdicts | `agents/base2/base2.ts` | Correctness/Error MEDIUM | KH-CS/KN-CRP | keep | M3 | partially overlaps dirty tree; verify | reviewer-spawn tests |
| COR-M03-M07 | CLI queue/history/suggestion/input races | `cli/src/hooks/**` | Correctness MEDIUM | KH-CS/KN-CRP | keep scoped | M2/M6 | todo | CLI tests; tmux if UI behavior changes |
| COR-M08-M11 | Runtime message/tool stream/trimming robustness | `packages/agent-runtime/src/util/messages.ts`, `tool-executor.ts`, `stream-parser.ts`, `run-agent-step.ts` | Correctness MEDIUM | KN-CRP | keep | M6 | todo | runtime tests |
| COR-M12 | BYOK cost accounting namespace | `sdk/src/impl/llm.ts` | Correctness MEDIUM | KN-CRP | keep | M4/M5 | todo | SDK tests |
| COR-M13 / STATE-M07 | Background job offsets | `sdk/src/tools/background-jobs.ts` | Correctness MEDIUM | KH-CS | keep | M3 | todo | background job tests |
| COR-M14 / STATE-M05 | Provider config cache invalidation | `sdk/src/provider-config.ts` | Correctness MEDIUM | KH-CS | keep | M3 | todo | provider config tests |
| COR-M15-M16 | Evals summaries and judge parity | `evals/buffbench/**` | Correctness MEDIUM | KN-CRP | keep | M8 | todo | buffbench tests |
| COR-M17-M19 | Metadata hashing and language table drift | `packages/indexer/**`, `packages/code-map/**` | Correctness MEDIUM | KN-CRP/KH-CS | keep | M3/M6 | todo | indexer/code-map tests |
| COR-M20 | `occurrenceIndex` freshness anchors | `process-str-replace.ts` | Correctness MEDIUM | KH-CS | keep | M1 | partially overlaps dirty tree; verify | deterministic edit tests |
| COR-M21 | Tool registration guard substring match | `scripts/check-tool-registration.ts` | Correctness MEDIUM | KN-CRP | keep | M4/M9 | todo | scripts guard tests |
| COR-L01-L07 | Low CLI/runtime/glob edge cases | `sdk/src/tools/glob.ts`, runtime utils, CLI hooks/components | Correctness LOW | KN-CRP | defer/sweep | M9 | todo | targeted tests if touched |
| STATE-H02 / STATE-H04 / ERR-M02 | Cancellation propagation | `cli`, `sdk`, `agent-runtime`, `evals` | State/Error HIGH/MEDIUM | KH-LS/KH-CS | keep | M2 | todo | abort/provider/eval tests |
| STATE-M01-M03 | Runtime stream/message state mutation | runtime parser/messages | State MEDIUM | KN-CRP/KH-CS | keep | M6 | todo | runtime stream tests |
| STATE-L01-L04 | Low generator/test/global state issues | runtime, agents, code-map, cli project files | State LOW | KN-CRP | defer/sweep | M9 | todo | targeted tests if touched |
| ERR-H01 | Tree-sitter failures swallowed | `metadata-indexer.ts`, `parse.ts` | Error HIGH | KN-CRP | keep | M6 | todo | parser diagnostic tests |
| ERR-H02 | Eval final check no timeout | `evals/buffbench/agent-runner.ts` | Error HIGH | KH-LS | keep | M2/M6 | todo | eval timeout tests |
| ERR-M01 | Malformed tool input parse debug-only | `tool-stream-parser.ts` | Error MEDIUM | KN-CRP | keep | M6 | todo | parser validation tests |
| ERR-M03 | `check_job.kill_on_timeout` dropped | `check-job.ts`, SDK params | Error MEDIUM | KH-LS/KN-CRP | keep | M2 | todo | check_job tests |
| ERR-M04 | Model discovery no timeout/cancel | `sdk/src/model-discovery.ts` | Error/Perf MEDIUM | D-OLI/KN-CRP | keep without breaking custom endpoints | M5/M6 | todo | model discovery timeout tests |
| ERR-M05-M08 | Reviewer waits/eval summaries/initCommand aliases | agents/evals/types | Error MEDIUM | KN-CRP | keep | M4/M6/M8 | todo | targeted tests |
| ERR-L01-L03 | Error formatter/cleanup/timer/clipboard lows | runtime/cli | Error LOW | KN-CRP | defer/sweep | M9 | todo | targeted tests if touched |
| PERF-H01 | Eval timeout leaves work running | `agent-runner.ts` | Performance HIGH | KH-LS | keep | M2 | todo | eval timeout tests |
| PERF-M01 | Unbounded streamed XML buffers | runtime XML parser | Performance MEDIUM | KH-LS/KN-CRP | keep | M6 | todo | bounded buffer tests |
| PERF-M02 | Model discovery can hang | `model-discovery.ts` | Performance MEDIUM | D-OLI/KN-CRP | keep | M5/M6 | todo | timeout tests |
| PERF-M03-M07 | CLI render churn/timer/copy recomputation | `cli/src/**` | Performance MEDIUM | KN-CRP | keep scoped | M6/M9 | todo | CLI tests/profiling if touched |
| PERF-L01-L03 | MCP clone, index rescore, sync history reads | runtime/indexer/cli | Performance LOW | KN-CRP | defer/sweep | M9 | todo | targeted perf tests if touched |
| DEP-M01 | Hardcoded support-agent model IDs | `openbuff.d/routes.json`, support agents | Dependency MEDIUM | KN-CRP | keep | M4 | current dirty tree may overlap | config sync guard |
| DEP-M02 | CDN parser WASM | code-map init | Dependency MEDIUM | KN-CRP | keep | M6 | todo | code-map tests |
| DEP-M03 | Evals import agents-graveyard | eval task generator | Dependency MEDIUM | KN-CRP | keep | M8/M9 | todo | eval tests |
| DEP-M04 / DEP-L02 | Base2 escalation helper/state constants | agents/base2 | Dependency LOW/MEDIUM | KN-CRP | defer/sweep unless adjacent | M9 | todo | agents tests |
| DEP-L01 | Full lodash import | runtime messages | Dependency LOW | KN-CRP | defer/sweep | M9 | todo | runtime tests if touched |
| DEP-L03 | Basher set_output declaration exception | agents/basher.ts | Dependency LOW/API LOW | KN-CRP | keep/doc or fix | M4/M9 | todo | tool reachability tests |
| TEST-M01-M08 | Medium test coverage gaps | agents/sdk/indexer/evals/common/runtime/scripts | Test MEDIUM | KN-CRP | keep as milestone test requirements | M1-M9 | todo | targeted per area |
| TEST-L01-L03 | Low test coverage gaps | runtime/scripts | Test LOW | KN-CRP | defer/sweep | M9 | todo | targeted tests if touched |
| ABI-H01-H02 | SDK advertises unsupported local tools | `common/src/tools/list.ts`, `sdk/src/run.ts` | API/ABI HIGH | KN-CRP | keep as local contract correctness | M4 | todo | registry consistency tests |
| ABI-M01-M13 | Medium public/local contract drift | agents/sdk/docs/env/indexer/evals | API/ABI MEDIUM | KN-CRP | keep/rewrite local contracts | M4/M8 | todo | registry/docs tests |
| ABI-L01-L05 | Low output/schema/API docs drift | runtime/code-map/common/agents | API/ABI LOW | KN-CRP | defer/sweep | M9 | todo | targeted tests/docs |

## Dirty-tree overlap notes from current `git_status`

Current dirty tree includes modified files that likely overlap M1/M3/M4 remediation:

- `packages/agent-runtime/src/tools/handlers/tool/read-files.ts`
- `packages/agent-runtime/src/tools/handlers/tool/read-outline.ts`
- `packages/agent-runtime/src/process-str-replace.ts`
- `packages/agent-runtime/src/structural-read.ts`
- `packages/agent-runtime/src/util/render-read-files-result.ts`
- `packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts`
- `sdk/src/tools/read-files.ts`
- `sdk/src/__tests__/read-files.test.ts`
- `agents/base2/base2.ts`
- `agents/base2/gate-reviewer.ts`
- `agents/__tests__/gate-reviewer.test.ts`
- `common/src/util/content-hash.ts`
- `openbuff.d/{indexing.json,providers.json,routes.json}`
- `scripts/memory-drift-guard.ts`

Before editing any of these, re-read the exact current ranges and determine whether the dirty change already fixes the relevant finding. Do not overwrite or revert this work unless explicitly directed.

## Validation commands recorded for milestones

Use repo-native commands. Per `docs/testing.md`, avoid `bun --cwd <pkg> run <script>` for package scripts; prefer `cd <pkg> && bun run <script>` or workspace filters.

### Root / broad

- Typecheck all workspaces: `bun run typecheck`
- Test selected workspaces: `bun run test`
- Format touched TS/TSX/JSON/MD: `bun run format` (broad; prefer targeted prettier if only a few files are touched)
- Smoke CLI: `OPENBUFF_LOCAL_MODE=true bun scripts/openbuff-smoke.ts`
- Generate tool definitions: `bun run generate-tool-definitions`

### CLI

- `cd cli && bun run typecheck`
- `cd cli && bun run test`
- Dev CLI: `bun run start-cli` from root or `cd cli && bun run dev`
- tmux UI verification when rendering changes: use `scripts/tmux/tmux-cli.sh` per `docs/testing.md`

### SDK

- `cd sdk && bun run typecheck`
- `cd sdk && bun run test`
- `cd sdk && bun run test:e2e`
- `cd sdk && bun run test:integration`
- `cd sdk && bun run verify:skip-build` or `cd sdk && bun run verify`
- `cd sdk && bun run smoke-test:dist` after build/package changes

### Common

- `cd common && bun run typecheck`
- `cd common && bun run test`

### Agents

- `cd agents && bun run typecheck`
- `cd agents && bun run test`
- `cd agents && bun run test:e2e`

### Local `.agents` package

- `cd .agents && bun run typecheck`
- `cd .agents && bun run test`

### Evals

- `cd evals && bun run typecheck`
- `cd evals && bun run test`
- Buffbench targeted tests as applicable: `cd evals && bun test buffbench/__tests__`

### Scripts / guards

- `cd scripts && bun run typecheck`
- `cd scripts && bun run test`
- `cd scripts && bun run guard:byok-wording`
- `cd scripts && bun run guard:memory-drift`
- `cd scripts && bun run guard:sync-agent-config`

## M0 completion checklist

- [x] Tracker artifact exists.
- [x] Top 10 re-ranked under local CLI risk.
- [x] Guard-breaking recommendations listed with replacement framing.
- [x] Dirty-tree overlap noted.
- [x] Validation commands recorded.
- [ ] STATUS.md updated with M0 outcome.
- [ ] LESSONS.md updated with M0 triage gotchas.
