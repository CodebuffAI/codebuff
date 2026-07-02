# Harness Audit — PLAN

<!-- current-task: M2 spawn shard pairs -->

This plan executes the audit-codebase map-reduce pattern against the entire harness. Each milestone has a validation gate; do not advance until the gate passes.

## Milestones

### M1 — Build/verify structural map
- [x] Run `bun run scripts/build-structural-map.ts --out .agents/sessions/harness-audit-2026-06-30/MAP.md --check-stale` first. Exit 0 = reuse. Exit 1 = rebuild without `--check-stale`. Exit 2 = corrupted, force rebuild. (rebuilt fresh MAP.md at 2026-07-01T04:03:51.215Z)
- [x] `read_files` the resulting `MAP.md` and confirm it covers all listed harness subsystems in SPEC.md. (validated in-scope subsystem coverage)
- **Validation gate:** MAP.md `Built at:` timestamp is within session, and the table-of-contents lists `agents/`, `packages/agent-runtime/`, `sdk/`, `cli/`, `common/`, `packages/indexer/`, `packages/code-map/`, `evals/buffbench/`, `scripts/`, `openbuff.d/`, `docs/`.

### M2 — Spawn shard pairs (parallel)
Spawn ALL of the following in a single `spawn_agents` call so they run concurrently. Each shard pair = one `file-picker` (discovers/confirms files in the shard) + one `code-searcher` (runs ripgrep across the shard for the 8 domains' canonical patterns). The shard prompt instructs both subagents to coordinate via the durable findings file; the file-picker enumerates the file list and the code-searcher seeds patterns; the shard's primary auditor (a `general-agent` per shard) then `read_files` the shortlist and writes `findings/<shard>.md`.

Shard inventory (≥ 9 pairs — exceeds the min-5 floor for a broad-audit):

- [ ] **S1 — agent-runtime: loop & streaming.** `packages/agent-runtime/src/run-agent-step.ts`, `main-prompt.ts`, `run-programmatic-step.ts`, `prompt-agent-stream.ts`, `tools/stream-parser.ts`, `tools/tool-executor.ts`, `tool-stream-parser.ts`. Domains: all 8. Hotspots: stream backpressure, abort propagation, tool-call dispatch race vs end_turn, programmatic step generator leaks.
- [ ] **S2 — agent-runtime: deterministic edits & reads.** `process-str-replace.ts`, `process-file-block.ts`, `process-structured-edit.ts`, `process-edit-transaction.ts`, `structural-read.ts`, `get-file-reading-updates.ts`, `tools/handlers/tool/read-files.ts`, `tools/handlers/tool/read-outline.ts`, `util/render-read-files-result.ts`, `util/preflight-syntax-validation.ts`. Hotspots: `basedOnRead` capability lifecycle, hash-marker format drift, edit-transaction preflight atomicity, stale-anchor recovery, symbol-slice readCapability re-use.
- [ ] **S3 — agent-runtime: context, tokens, pruning.** `util/context-pruning.ts`, `util/token-counter.ts`, `util/budget-enforcement.ts`, `util/simplify-tool-results.ts`, `util/messages.ts`, `util/agent-output.ts`, `util/format-validation-issues.ts`, `util/format-value.ts`, `util/cache-debug.ts`, `util/parse-tool-calls-from-text.ts`, `util/stream-xml-parser.ts`. Hotspots: pruner trigger threshold accuracy, tool-result summarizer dropping next-step-critical info, token undercounting on multimodal content.
- [ ] **S4 — agent-runtime: tools/handlers (file/edit/search).** `tools/handlers/list.ts`, `tools/handlers/tool/*` (read_files, read_outline, str_replace, write_file, edit_transaction, apply_patch, code_search, glob, list_directory, query_index, run_terminal_command, check_job, kill_job, read_logs, git_status). Hotspots: param-schema vs handler signature drift, path traversal in path-accepting tools, missing AbortSignal propagation in long-running handlers, background-job offset drift.
- [ ] **S5 — agents: base2 family + gate lifecycle.** `agents/base2/*` (base2, base2-plan, base2-execute-plan, base2-fast, base2-fast-no-validation, base-deep, base2-evals, base-deep-evals, gate-reviewer, gate-state, gate-files, gate-paths, gate-repair, quality-prompt-section). Hotspots: gate-state marker format drift, repair-loop escalation correctness, stepPrompt vs instructionsPrompt alignment, MAX_REPAIR_ROUNDS surfacing, durable repairSessionId, lifecycle parity between base2 / base-deep.
- [ ] **S6 — agents: support agents.** `agents/file-explorer/**`, `agents/editor/**`, `agents/reviewer/**`, `agents/thinker/**`, `agents/researcher/**`, `agents/synthesizer/**`, `agents/debugger/**`, `agents/security-reviewer/**`, `agents/doc-writer/**`, `agents/test-writer/**`, `agents/git-committer/**`, `agents/general-agent/**`, `agents/librarian/**`, `agents/browser-use/**`, `agents/debug/**`, `agents/e2e/**`, `agents/basher.ts`, `agents/tmux-cli.ts`, `agents/context-pruner.ts`, `agents/constants.ts`. Hotspots: hardcoded model IDs vs `openbuff.d/routes.json`, instructionsPrompt drift from shared sections, stepPrompt drift in base2-composing agents, MAX_SPAWN_DEPTH enforcement, tool-list freshness.
- [ ] **S7 — SDK: client, run, providers, failover.** `sdk/src/client.ts`, `run.ts`, `run-state.ts`, `provider-config.ts`, `model-discovery.ts`, `credentials.ts`, `retry-config.ts`, `custom-tool.ts`, `validate-agents.ts`, `impl/llm.ts`, `impl/failover.ts`, `impl/model-provider.ts`, `impl/agent-runtime.ts`, `impl/chatgpt-backend-fetch.ts`, `error-utils.ts`. Hotspots: failover list dedup, retry+jitter, BYOK cost accounting via configured pricing, OPENBUFF_API_KEY fallback handling, abort propagation across provider boundaries, AgentOutputSchema validation.
- [ ] **S8 — SDK: tools surface + tests.** `sdk/src/tools/**`, `sdk/src/__tests__/**`, `sdk/src/agents/**`, `sdk/src/skills/**`, `sdk/src/native/**`, `sdk/src/testing/**`, `sdk/src/types/**`, `sdk/src/index.ts`. Hotspots: public tool API drift vs runtime handlers, exported type changes that would break downstream SDK consumers, test mocks that no longer exercise the real path.
- [ ] **S9 — CLI: streaming, hooks, send-message.** `cli/src/chat.tsx`, `app.tsx`, `index.tsx`, `project-files.ts`, `cli/src/hooks/**` (focus: `use-chat-streaming`, `use-send-message`, `use-chat-keyboard`, `use-suggestion-engine`, `use-message-queue`, `use-input-history`, `use-ask-user-bridge`, `use-clipboard`, `use-exit-handler`, `use-publish-mutation`, `use-fingerprint`, `use-connection-status`). Hotspots: AbortController leaks, stale-closure session reads, render storms from batched updaters, escape-key cancel correctness.
- [ ] **S10 — CLI: components & screens.** `cli/src/components/**` (focus: `status-bar`, `command-palette-screen`, `review-screen`, `plan-session-picker-screen`, `model-route-picker`, `provider-picker-screen`, `chat-input-bar`, `message-block`, `message-with-agents`, `chat-history-screen`, `prompt-history-search-screen`, `agent-checklist`, `validation-error-popover`, `error-boundary`, `bottom-banner`, `top-banner`). Hotspots: a11y (focus order, ARIA), responsive layout, color-only signal, render performance, leaks from timers/intervals.
- [ ] **S11 — Common, schemas, types.** `common/src/types/**`, `common/src/schemas/**`, `common/src/tools/**`, `common/src/constants/**`, `common/src/util/**`, `common/src/api-keys/**`, `common/src/mcp/**`, `common/src/templates/**`, `common/src/env-schema.ts`, `analytics*.ts`. Hotspots: Zod schemas vs handler signatures, ErrorOr pattern misuse, env-schema drift vs documented env vars.
- [ ] **S12 — Indexer + code-map.** `packages/indexer/**`, `packages/code-map/**`. Hotspots: index staleness, invalidation on file mutation, `mode: 'commands'` freshness, tree-sitter parse errors swallowed, language detection edge cases.
- [ ] **S13 — Evals harness.** `evals/buffbench/agent-runner.ts`, `judge.ts`, `eval-task-generator.ts`, `lessons-extractor.ts`, `plan-sharding-signals.ts`, `deterministic-signals.ts`, `analyze-task-scores.ts`, `setup-test-repo.ts`, `format-output.ts`, `main*.ts`. Hotspots: signal extractor drift vs current planner output, judge prompt parity with prod, task-runner abort handling, eval log filtering false positives.
- [ ] **S14 — Scripts / guards / config surface.** `scripts/build-structural-map.ts`, `memory-drift-guard.ts`, `byok-wording-guard.ts`, `generate-tool-definitions.ts`, `check-tool-registration.ts`, `sync-agent-config.ts`, `openbuff-smoke.ts`, `start-services.ts`, `dev.ts`, plus `openbuff.d/routes.json`, `providers.json`, `indexing.json`, `hooks.json`, top-level `openbuff.json`. Hotspots: routes.json vs registered agents, provider entries vs `sdk/src/provider-config.ts`, hook patterns vs `cli/src/hooks/use-chat-streaming` runner, guard false-negatives.
- [ ] **S15 — Docs drift.** `docs/architecture.md`, `request-flow.md`, `deterministic-edit-system.md`, `agents-and-tools.md`, `local-mode.md`, `configuration.md`, `environment-variables.md`, `authentication.md`, `testing.md`, `openbuff-provider-model-setup-ux.md`. Audit ONLY for drift against the code (claimed env vars vs `env-schema.ts`, claimed tool names vs `tools/handlers/list.ts`, claimed package names vs published `package.json`).

Each shard prompt MUST:
- Pass the shard's file list (paths) verbatim.
- Copy the 8 domains verbatim from `agents/patterns/audit-codebase.md`.
- Copy the per-finding format verbatim:
  ```
  ## [SEVERITY] domain — file:line — short title
  - **Risk:** one-sentence concrete description.
  - **Fix:** one-sentence suggested fix.
  - **Evidence:** exact code snippet or symbol.
  ```
- Instruct: "`read_files` the shard's files (use `read_outline` + `symbols` selectors for files > ~600 LOC). Analyze against all 8 domains. `write_file` `findings/<shard>.md`. Do NOT return findings in `set_output` — they will be lost to the pruner. An empty findings file with just the header + 'No issues found across all 8 domains.' is a valid result."

**Validation gate:** every shard returns a non-empty `set_output.message` that names its findings file path. `findings/*.md` exists for all 15 shards.

### M3 — Coverage matrix + subsystem-enumeration guard
- [ ] Write `.agents/sessions/harness-audit-2026-06-30/COVERAGE-MATRIX.md` (via `write_file` from a general-agent — this is a session artifact, not project source). Format per the audit pattern: domain × shard table, plus a `## Subsystem enumeration` section listing every top-level dir of the project with disposition (audited / out-of-scope with reason).
- [ ] Mark every top-level dir from `list_directory` of project root. Out-of-scope dirs and why:
  - `.agents-graveyard/` — graveyard, intentionally dead.
  - `.bin/`, `.bun-version`, `.envrc`, `.env.example`, `.gitignore`, `.prettierrc` — not code.
  - `agents-graveyard/`, `openbuff.d.bak/`, `openbuff-2.d.bak/`, `.e2e-scratch/` — backups / scratch.
  - `.omx/`, `.vscode/` — local-tooling state.
  - `.github/` — CI metadata (in scope only for hooks/release wrappers — covered by S14).
- **Validation gate:** matrix lists ALL 15 shards, ALL 8 domains, and EVERY top-level dir (or marks it out-of-scope with a reason).

### M4 — Synthesize cross-cutting report
- [ ] Spawn `synthesizer` agent with a prompt pointing at `findings/` and `COVERAGE-MATRIX.md`. Synthesizer reads ONLY those files (never raw source). It produces `AUDIT-REPORT.md` with:
  1. **Top 10** highest-leverage fixes (file:line, domain, one-line rationale).
  2. **Cross-cutting findings** — issues that span ≥ 2 shards. These are the highest-leverage category for a harness audit because they indicate a systemic pattern.
  3. **Per-domain sections** sorted by severity within each domain.
  4. **Coverage** section referencing `COVERAGE-MATRIX.md`.
- **Validation gate:** `AUDIT-REPORT.md` contains all four required sections; Top 10 has 10 entries with file:line; Cross-cutting section is non-empty (if it's empty, double-check — for a harness audit of this size that almost always indicates incomplete synthesis).

### M5 — Present results to user
- [ ] `read_files` `AUDIT-REPORT.md`.
- [ ] Summarize Top 10 inline to the user with a pointer to the full report.
- [ ] Offer to scope follow-up tasks from specific findings (e.g. "fix the Top 3 cross-cutting findings as a follow-up commit").
- **Validation gate:** user response (clarification, fix-scope selection, or sign-off).

## Dependencies / ordering
- M1 → M2 (shards need the pinned map).
- M2 → M3 (matrix needs the shard findings).
- M3 → M4 (synthesizer reads the matrix).
- M4 → M5.
- Within M2, ALL 15 shards run in parallel in a single `spawn_agents` call.

## Risks / mitigations
- **Shard too large.** S5 (base2 family + gates) and S9 (CLI hooks) are the densest. If a shard's combined LOC > ~3k, split it before spawning. The map's per-file LOC counts make this measurable.
- **Findings returned in messages instead of files.** Mitigated by the shard prompt's explicit `write_file` requirement and the "lost to pruner" warning.
- **Synthesizer re-reads source.** Mitigated by the synthesizer prompt restricting it to `findings/*.md` + `COVERAGE-MATRIX.md`.
- **Out-of-scope dirs change.** If `list_directory` of project root surfaces a dir not enumerated in M3 above, mark it explicitly before synthesis.
- **Performance findings without benchmarks.** This audit reports static-analysis perf findings only; the report should label them as such so the user isn't misled about empirical impact.
- **Test-coverage findings without running tests.** Same caveat — the audit reports gaps from static inspection, not from a coverage run.

## Validation gates summary
- M1: `MAP.md` fresh + lists all 11 in-scope subsystems.
- M2: 15 `findings/*.md` files exist; each shard returned its file path.
- M3: `COVERAGE-MATRIX.md` covers all 15 shards × 8 domains and every top-level dir.
- M4: `AUDIT-REPORT.md` has Top 10 + Cross-cutting + Per-domain + Coverage sections.
- M5: report summarized to user; follow-up scope confirmed.

## Resume rules
- If the session is interrupted between M1 and M2, re-run M1's `--check-stale` pre-flight to decide whether to rebuild the map.
- If the session is interrupted between M2 and M3, list `findings/` and re-spawn only the missing shards.
- If the session is interrupted between M3 and M4, verify `COVERAGE-MATRIX.md` then proceed to M4.
- Always update `STATUS.md` after each milestone via `update_plan_status`.
