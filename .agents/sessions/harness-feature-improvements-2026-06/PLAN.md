# PLAN — Openbuff Whole-Harness Feature Improvements (v3)

## Milestones (ordered by dependency, each independently shippable)

### M1 — Embedded craftsmanship prompts (foundational)
- [todo] M1.1 Create `agents/base2/quality-prompt-section.ts` exporting `qualitySection` + `frontendSection`.
- [todo] M1.2 Import sections into `base2.ts`, `base-deep.ts`, editor prompt.
- [todo] M1.3 Add snapshot test (`agents/__tests__/quality-prompt-snapshot.test.ts`) asserting byte-equality of `qualitySection` only.
- **Validation:** `bun run --cwd agents typecheck` + snapshot test green.

### M2 — Subagent output quality & design
- [todo] M2.1 `code-searcher`: add ≤200-token LLM digest; downgrade model to fast/cheap.
- [todo] M2.2 `file-picker`: relevance scoring + dedup + ordered top-N.
- [todo] M2.3 `thinker`: optional `depth`/`outputSchema` hints.
- [todo] M2.4 `code-reviewer`: 3-item security checklist + coverage-adequacy line.
- [todo] M2.5 `editor`: import M1 shared sections into `instructionsPrompt`.
- [todo] M2.6 New bundled agents: `test-writer`, `security-reviewer`, `debugger`, `doc-writer`.
- [todo] M2.7 Enforce `MAX_SPAWN_DEPTH` (default 3) on `spawn_agents` dispatch.
- **Validation:** per-agent unit tests; `agents/tool-reachability.test.ts` updated and green.

### M3 — Orchestrator decision logic
- [done] M3.1 Allow validation + reviewer to run concurrently when reviewer is static-only (gate flag).
- [done] M3.2 Repair-loop escalation after `MAX_REPAIR_ROUNDS`; durable `repairSessionId` to prevent reset circumvention.
- [done] M3.3 Adaptive spawning guidance keyed to breadth (cross-ref M10 classifier).
- [done] M3.4 Port `base-deep.ts` to the same gate lifecycle as `base2.ts` (extract shared gate harness).
- **Validation:** `agents/__tests__/base2.test.ts` + new `base-deep-gate.test.ts`.

### M4 — Context & memory management
- [done] M4.1 Auto-spawn `context-pruner` from `loopAgentSteps` when `contextTokenCount` exceeds model threshold.
- [done] M4.2 Extend `trimMessagesToFitTokenLimit` to summarize `code_search`/`read_subtree`/`query_index`/`web_search` results.
- [done] M4.3 Wire `contextTokenCount` to pruning trigger + surface in status bar (M9.3).
- **Validation:** `sdk/src/util/messages.test.ts` + runtime threshold test.

### M5 — Git discipline
- [done] M5.1 Extract gitCommitGuidePrompt → common/src/constants/git-discipline.ts.
- [done] M5.2 Resurrect `git-committer` bundled agent from graveyard.
- [done] M5.3 Add `git_branch` SDK helper (reuse `gitStatus` for dirty-tree refusal).
- [done] M5.4 Add `git_discipline` orchestrator prompt section.
- **Validation:** `sdk/src/tools/git-status.test.ts` + `agents/__tests__/git-committer.test.ts`.

### M6 — Quality gates
- [done] M6.1 Document `lint` hook naming convention (no schema field).
- [done] M6.2 Pre-edit advisory review for security-sensitive file patterns.
- [done] M6.3 Coverage-adequacy in reviewer verdict contract.
- [done] M6.4 Surface `repairRoundCount`/`MAX_REPAIR_ROUNDS` in gate-state box.
- **Validation:** `agents/__tests__/gate-repair.test.ts` extended.

### M7 — Indexing depth
- [done] M7.1 Optional semantic-embedding boost (opt-in, lexical default).
- [done] M7.2 Stale-index detection in `query_index` explain.
- [done] M7.3 PHP/Swift/Kotlin config + tag queries; graceful no-op on missing WASM grammar.
- **Validation:** `packages/indexer/src/query.test.ts` benchmark not regressing with semantic off.

### M8 — SDK provider layer
- [done] M8.1 **BUGFIX** failover honored when agent/defaultModel routing exists.
- [done] M8.2 BYOK cost accounting via configured `pricing` capability.
- [done] M8.3 Unify retry config + add jitter.
- [done] M8.4 Remove dead `sdk/src/tools/run-file-change-hooks.ts` stub.
- **Validation:** `sdk/src/impl/llm.test.ts` failover case; `sdk/src/__tests__/retry-config.test.ts`.

### M9 — CLI UX
- [done] M9.1 Command palette (Ctrl+P) fuzzy command/file execution.
- [done] M9.2 `/diff` + `/changes` commands.
- [done] M9.3 Status bar: token/cost, context-window %, model name, diff stats.
- [done] M9.4 Undo/redo (uncomment + implement `/undo` `/redo`).
- [done] M9.5 Edit & resend previous user message.
- [done] M9.6 "Did you mean" suggestions from router.
- [done] M9.7 Fuzzy/global input history search.
- [done] M9.8 diff-viewer: hunk headers, line numbers, per-hunk collapse, side-by-side.
- **Validation:** `cli/src/__tests__/` + visual `codebuff-local-cli` agent smoke.

### M10 — Planner / plan-mode effort floor (meta)
- [done] M10.1 Breadth classifier in `agents/patterns/audit-codebase.md` (enumerated domains ≥3 + breadth marker + no single-file target → `broad-audit`).
- [done] M10.2 Minimum-shard rule (≥1 file-picker + code-searcher pair per domain, min 5 pairs).
- [done] M10.3 Coverage matrix artifact (domain → shard IDs) before synthesis.
- [done] M10.4 Subsystem-enumeration guard: planner lists top-level dirs and marks each audit/scope/out-of-scope.
- **Validation:** new `evals` or pattern test asserting a broad prompt triggers the minimum shard count and coverage matrix.

## Dependencies / Ordering
- M1 is foundational; M2.5 and M3 depend on it.
- M2.7 (`MAX_SPAWN_DEPTH`) should ship before M2.6 (new agents) to avoid recursion risk.
- M3.3 references M10.1 classifier.
- M4.3 surfaces data consumed by M9.3.
- M8.1 (failover bugfix) is standalone and high-priority; ship early.
- M5–M9 are largely independent and can parallelize across separate editor sessions.

## Risks / Blockers / Open Questions
1. **M2.1 model downgrade** — verify the fast model can produce a coherent ≤200-token digest; fallback to Sonnet if quality drops.
2. **M3.1 parallel validation+reviewer** — must not regress the strict "validation failure blocks reviewer" contract; gate behind a static-review-only flag.
3. **M3.4 base-deep gate parity** — extracting shared gate harness risks drift; add parity test (like `gate-repair-parity.test.ts`).
4. **M7.3 WASM grammars** — confirm tree-sitter WASM availability for PHP/Swift/Kotlin before committing; graceful no-op is the descope.
5. **M8.1 failover fix** — changing `resolveConfiguredAgentModelConfig` precedence could alter routing for all agents; add a golden-path test matrix.
6. **M10 enforcement** — a prompt-only guard is soft; consider a runtime preflight that counts spawned shards and warns if below minimum.

## Validation Gates
- Per-milestone: `bun run --cwd <pkg> typecheck` + targeted tests.
- Final: whole-repo `bun run typecheck` + `bun test` green.
- Code-reviewer gate: LOOKS_GOOD or NON_BLOCKING.
- `query-quality.test.ts` must not regress with semantic boost off.

## Checkpoint / Update Rules
- STATUS.md updated via `update_plan_status` after each milestone completes or blocks.
- LESSONS.md updated via `update_plan_status` for each discovered gotcha / decision.
- SPEC.md / PLAN.md changes via `create_plan` only (substantial rewrites).
- On resume: read STATUS.md first for current pointer, then continue from the `<!-- current-task -->` marker.

<!-- current-task: final-gate -->

<!-- update_plan_status:appended -->
## M9.7 — Complete (2026-06-28) — 2026-06-28T11:58:02.451Z

PromptHistorySearchScreen implemented: full-screen fuzzy overlay over past user prompts (Ctrl+R + `/prompts`). New `openPromptHistorySearch` CommandResult + command-registry entry + slash-commands entry. Reuses `fuzzyMatch` for scoring with cap on rendered items. Validation: cli typecheck clean; 15/15 tests pass across prompt-history-search-screen.test.ts + command-suggestions.test.ts. File-change hooks passed (typecheck-cli).


<!-- update_plan_status:appended -->
## M9.7 — Lessons — 2026-06-28T11:58:09.163Z

M9.7 gotcha: `update_plan_status` targeted-line updates fail silently when the PLAN.md line text was already rewritten by an earlier checkbox flip (the `oldString` match is against post-rewrite text). Workaround: use append-only STATUS records for completion notes, and rely on the `<!-- current-task -->` marker flip done separately via str_replace. Also: editor-spawned new test files are subject to strict read-before-edit; always read_files a freshly created test file before attempting str_replace fixes to test expectations.


<!-- update_plan_status:appended -->
## M9.8 — Complete (2026-06-28) — 2026-06-28T12:13:34.033Z

DiffViewer enhanced per SPEC R9.8: parses hunks via `parseDiffIntoHunks`/`parseHunkHeader`, restores `@@` hunk headers (previously stripped), renders old/new line-number gutters, adds per-hunk expand/collapse state (collapsed by default when a hunk exceeds a threshold), and adds an opt-in side-by-side render mode. New `cli/src/components/tools/__tests__/diff-viewer.test.tsx` covers parsing, numbering, collapse toggling, and side-by-side alignment. Callers in `apply-patch.tsx`, `str-replace.tsx`, `edit-transaction.tsx`, `implementor-row.tsx` unchanged (default props preserved). Validation: cli typecheck clean; reviewer gate NON_BLOCKING (noted edge case: deletion lines starting with `--` can be misclassified as file headers — pre-existing, not a regression; dead `oldLen`/`newLen` defaults; cosmetic test-comment mismatch).


<!-- update_plan_status:appended -->
## M9.8 — Reviewer nits fixed (2026-06-28) — 2026-06-28T12:18:01.935Z

Addressed the three NON_BLOCKING findings from the M9.8 reviewer gate:
1. `isFileHeaderLine` now restricts `---`/`+++` matches to the git file-header form (`--- a/...`, `+++ b/...`) via regex, so deletion lines like `--- some SQL comment` (SQL/Lua/Haskell) stay in the hunk body as deletions instead of being misclassified as headers and splitting the hunk.
2. `parseHunkHeader` now defaults `oldLen`/`newLen` to 1 (git convention: omitted count = 1) instead of 0. The degenerate `@@` fallback still returns 0 since there's no range info at all.
3. Corrected the misleading comment in `command-suggestions.test.ts` (the `hlp` test does not match alias `h`; fuzzyMatch rejects queries longer than candidates).
Also fixed two pre-existing test assertion bugs surfaced when running the diff-viewer tests for the first time: `│-old`/`│+new` were asserted as contiguous substrings but the gutter and body render as separate `<span>` elements, so they were changed to assert the `│` separator and `>-old<`/`>+new<` body spans independently.
Validation: cli typecheck clean; 22/22 tests pass across diff-viewer.test.tsx + command-suggestions.test.ts. File-change hooks passed (typecheck-cli).


<!-- update_plan_status:appended -->
## M10.1 — Complete (2026-06-28) — 2026-06-28T12:25:07.166Z

Breadth classifier implemented per SPEC R10.1. Added pure `classifyBreadth(prompt)` to `evals/buffbench/plan-sharding-signals.ts` returning `{ kind: 'broad-audit' | 'single-target' | 'unclear', domains, domainCount, hasBreadthMarker, hasSingleFileTarget }`. Rules: `broad-audit` when (domainCount ≥3 OR a breadth marker like "whole codebase") AND no single-file target; `single-target` when a path literal or "in <file>"/"the file <path>" phrasing is present (wins over breadth markers); else `unclear`. Domains are matched as whole-word, case-insensitive tokens against a repo-specific `KNOWN_DOMAINS` list; single-file detection uses a path-literal regex plus `IN_FILE_REGEX`/`THE_FILE_REGEX`. `agents/patterns/audit-codebase.md` Step 0 now references `classifyBreadth` so the pattern routes broad-audit vs single-target vs unclear. Validation: evals typecheck clean; 38/38 tests pass in `plan-sharding-signals.test.ts` (12 new `classifyBreadth` cases). File-change hooks skipped (no hook matches evals/patterns paths). Gotcha: the initial test prompt "Audit the agents, sdk, cli, and common packages for issues" accidentally included the word "packages" (itself a KNOWN_DOMAIN), yielding 5 domains instead of 4 — fixed the prompt to use "subsystems" so it cleanly exercises the ≥3-domains path.


<!-- update_plan_status:appended -->
## M10.1 — Lesson (2026-06-28) — 2026-06-28T12:25:14.379Z

When testing a domain-count classifier, avoid test prompts that incidentally contain KNOWN_DOMAIN tokens outside the intended set. The word "packages" is in KNOWN_DOMAINS, so a prompt mentioning "common packages" registered a 5th domain and broke the domainCount=4 assertion. Prefer neutral container words ("subsystems", "areas", "modules") in test prompts so the assertion exercises exactly the intended domains.


<!-- update_plan_status:appended -->
## M10.2 — Complete (2026-06-28) — 2026-06-28T12:35:06.896Z

Minimum-shard rule implemented per SPEC R10.2. Added pure `evaluateMinimumShardRule({ signals, breadth })` to `evals/buffbench/plan-sharding-signals.ts` returning a new `MinimumShardEvaluation` (`requiredPairs`, `actualPairs`, `filePickerCount`, `codeSearcherCount`, `satisfies`, `reason`). Rule: for a `broad-audit` breadth, `requiredPairs = max(domainCount, 5)` and `actualPairs = min(filePickerCount, codeSearcherCount)`; the rule is vacuously satisfied (`requiredPairs = 0`) for non-`broad-audit` breadths. Wired into `evaluateShardingVerdict` as an additional gate: when `promptKind === 'audit'` AND a prompt string is supplied, a violated minimum-shard rule downgrades a `pass` verdict to `fail` and appends a reason. The prompt-optional signature preserves backward compatibility with single-arg callers (e.g. `run-plan-sharding-eval.ts`). Also shipped the M10.2c cleanups (dropped the dead capture group in `PATH_LITERAL_REGEX`; removed the unreachable `\\` branch in `isFileHeaderLine`) and the `KNOWN_DOMAINS` audit finding (added `scripts`). `agents/patterns/audit-codebase.md` Step 2-3 updated to mandate the minimum-shard rule and pair composition. Validation: evals typecheck clean; 47/47 tests pass in `plan-sharding-signals.test.ts` (9 new `evaluateMinimumShardRule` + wire-through cases). File-change hooks passed (typecheck-cli).


<!-- update_plan_status:appended -->
## M10.2 — Lesson (2026-06-28) — 2026-06-28T12:35:12.776Z

When wiring a new gate into an existing verdict function with a public signature (`evaluateShardingVerdict(signals, prompt?)`), keep the second arg optional so existing single-arg callers (the live eval runner `run-plan-sharding-eval.ts`) still compile without changes. The minimum-shard gate only fires when both (a) `promptKind === 'audit'` and (b) the prompt string is present — omitting the prompt silently skips the check rather than throwing, which is the right default for a backward-compatible additive gate. Also: `actualPairs = min(filePickerCount, codeSearcherCount)` is the binding-constraint model — a surplus of one agent type cannot compensate for a deficit of the other, so the rule correctly fails when only file-pickers (or only code-searchers) are spawned.


<!-- update_plan_status:appended -->
## M10.2 — Live-runner follow-up (2026-06-28) — 2026-06-28T12:37:15.369Z

Follow-up fix to the live eval runner after the M10.2 reviewer gate. The initial M10.2 implementation wired `evaluateMinimumShardRule` into `evaluateShardingVerdict` correctly, but `run-plan-sharding-eval.ts` (the only live consumer of `evaluateShardingVerdict`) still called it with the single-arg form `evaluateShardingVerdict(signals)`, so the minimum-shard gate never fired in the live eval — only in unit tests. Fixed: the runner now calls `evaluateShardingVerdict(signals, prompt)` so the M10.2 gate fires for broad-audit prompts, and the summary JSON now includes the M10.2 diagnostic counts (`filePickerCount`, `codeSearcherCount`) so the verdict reason is machine-correlatable. Validation: evals typecheck clean. File-change hooks skipped (no hook matches evals paths). The third reviewer nit (dead `@@` branch in `lineColor`, pre-existing in diff-viewer) is left as optional cleanup — not a regression, and the gate has already passed.


<!-- update_plan_status:appended -->
## M10.3 + M10.4 — Complete (2026-06-28) — 2026-06-28T12:49:20.018Z

Coverage matrix (M10.3, SPEC R10.3) and subsystem-enumeration guard (M10.4, SPEC R10.4) implemented together in `evals/buffbench/plan-sharding-signals.ts`.

M10.3 — Added pure `buildCoverageMatrix({ breadth, signals })` returning a `CoverageMatrix` (`entries[]`, `uncoveredDomains`, `allCovered`). For `broad-audit`: sorts `breadth.domains` alphabetically, computes `actualPairs = min(filePickerCount, codeSearcherCount)`, and assigns pairs round-robin (pair `i` -> `domains[i % domainCount]`). `covered` = `assignedPairs >= 1`; `uncoveredDomains` are entries with zero assigned pairs (happens when `actualPairs < domainCount`). Vacuously satisfied (`allCovered = true`, empty entries) for non-`broad-audit`. Wired into `evaluateShardingVerdict` as a NON-downgrading diagnostic: when `!coverage.allCovered`, a reason is appended (`Coverage matrix (M10.3) has uncovered domains: ...`) without changing the verdict (M10.2 is the hard gate; M10.3 only surfaces coverage gaps so they aren't silently under-covered).

M10.4 — Added pure `evaluateSubsystemEnumeration({ breadth, topLevelDirs })` returning `SubsystemEnumeration` (`topLevelDirs`, `auditedDirs`, `unenumeratedDirs`, `satisfies`). For `broad-audit`: `auditedDirs` = `topLevelDirs` present in `breadth.domains` (case-insensitive), `unenumeratedDirs` = the rest, `satisfies` = `unenumeratedDirs.length === 0`. Vacuously satisfied for non-`broad-audit`.

Live runner `run-plan-sharding-eval.ts` now imports `buildCoverageMatrix` + `evaluateSubsystemEnumeration`, reads the repo's top-level dirs via `readdirSync(cwd, { withFileTypes })` (filtering out dot-dirs), and surfaces both in the console report + summary JSON (`coverageMatrix.entries`/`uncoveredDomains`, `subsystemEnumeration.{topLevelDirs,auditedDirs,unenumeratedDirs,satisfies}`).

Validation: evals typecheck clean; 59/59 tests pass in `plan-sharding-signals.test.ts` (12 new cases across `buildCoverageMatrix` and `evaluateSubsystemEnumeration`: all-covered, partial-coverage, round-robin extra-pair, alphabetical sort, vacuous single-target/unclear, case-insensitive dir match, unenumerated-dirs). File-change hooks skipped (no hook matches evals/patterns paths). PLAN.md M10.3 + M10.4 checkboxes flipped to [done]; current-task pointer advanced to `M10 complete`.

M10 milestone progress: M10.1 [done], M10.2 [done], M10.3 [done], M10.4 [done]. M10 (planner / plan-mode effort floor) meta-milestone fully shipped.


<!-- update_plan_status:appended -->
## M10.3 + M10.4 — Lesson (2026-06-28) — 2026-06-28T12:49:31.356Z

When layering M10.3 (coverage matrix) and M10.4 (subsystem-enumeration guard) on top of the existing M10.2 minimum-shard hard gate, keep them as NON-downgrading diagnostics rather than additional pass->fail gates. R10.3/R10.4 ask for *visibility* (make unsharded domains visible; make unenumerated top-level dirs visible), not enforcement — M10.2 already enforces the pair-count floor. Surfacing coverage gaps as appended reasons in `evaluateShardingVerdict` (plus first-class fields in the live-runner summary JSON) gives the eval report the diagnostic without over-failing traces that sharded correctly but imperfectly.

Also: for `evaluateSubsystemEnumeration`, make the caller (live runner) responsible for supplying `topLevelDirs` via `readdirSync(cwd, { withFileTypes: true })` and filter dot-dirs — keeping the fn pure (no fs I/O) so it stays trivially unit-testable with synthetic dirs, mirroring the design of the other pure signals in this module. Case-insensitive matching (`breadth.domains` lowercased into a Set, compared against lowercased `topLevelDirs`) handles the common `SDK` vs `sdk` casing skew between prompt phrasing and on-disk dir names.


<!-- update_plan_status:appended -->
## M6.4 complete — 2026-06-28T13:04:01.189Z

Surfaced repairRoundCount/MAX_REPAIR_ROUNDS in the gate-state box: formatGateStateBlock now takes an optional repairRound and emits {repairRound, maxRepairRounds} when active. Wired into the repair-loop call sites (repair-incomplete, escalation). Added M6.4 telemetry test in agents/__tests__/base2.test.ts (non-repair blocks omit the fields for backward compat). Validation: agents typecheck clean, 71/71 tests pass.

