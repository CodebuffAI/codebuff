# LESSONS: Cross-language idiom quality — one-week + one-year workstream

## Lessons discovered during this research turn

### L1. `frontendSection` is injected unconditionally at THREE sites, not one.
**Context:** Diagnosing React-bias in the system prompt.
**Finding:** Code-searcher this turn returned all three injection sites: `agents/base2/base2.ts:314`, `agents/base2/base-deep.ts:130`, AND `agents/editor/editor.ts:194`. R3 must gate all three, not just `base2.ts`.
**Implication:** A single-site gate would leak the React guidance via `base-deep.ts` and `editor.ts`. The fix is a shared helper (`gateFrontendSection(projectTree)`) called from all three sites, not three inline gates.

### L2. `qualitySection` is byte-frozen; `frontendSection` is intentionally not.
**Context:** Friction of refactoring each quality-prompt section.
**Finding:** `agents/__tests__/quality-prompt-snapshot.test.ts:18` comment: "`frontendSection` is intentionally NOT byte-frozen — it is the one section allowed to evolve." `qualitySection` is byte-frozen via `toMatchSnapshot()` (line 22).
**Implication:** R5 (generalize the manifest list in `qualitySection`) forces a snapshot-test update — bundle the test update in the same execution unit as the prose change. R3 (refactor `frontendSection`) is lower-friction; refactor freely.

### L3. The glob-detected-injection pattern already ships (`formatPatternsIndexPrompt`).
**Context:** Designing `projectLanguageProfilePrompt()` for R1.
**Finding:** `common/src/util/patterns.ts:125` exports `formatPatternsIndexPrompt({ index })` — empty index → empty string. It's wired via `packages/agent-runtime/src/templates/strings.ts:189` → `PLACEHOLDER.PATTERNS_INDEX`. `knowledgeFilesPrompt` lives at `packages/agent-runtime/src/system-prompt/prompts.ts:14`.
**Implication:** R1 is *not* greenfield. Mirror the `formatPatternsIndexPrompt` shape verbatim — glob-detected language list → compact prompt section → `PLACEHOLDER.LANGUAGE_PROFILE` wire in `strings.ts`. Zero new abstractions.

### L4. The `mergeFileChangeHooks` concat-with-dedup already composes user overrides with auto-wired defaults.
**Context:** Designing R2 (auto-wire linters) without clobbering user `openbuff.d/hooks.json` overrides.
**Finding:** `sdk/src/provider-config.ts:792` `mergeFileChangeHooks(base, override)` merges hook arrays by identity key (`command + filePattern + name`), override wins on conflict, base ordering retained. Tested at `sdk/src/__tests__/file-change-hooks.test.ts:197`.
**Implication:** Auto-wired linter defaults can be injected as the `base` array; user overrides land in `override`; the merge is already tested. R2 doesn't need a new merge path — it just needs the glob-detection + manifest→hook registry feeding `base`.

### L5. The self-improving loop machinery already ships (`append_system_prompt_guidance`).
**Context:** Designing Q3 (auto-promotion of idiom-guidance patches).
**Finding:** `evals/buffbench/proposals.ts:38` defines the `append_system_prompt_guidance` proposal kind; `lessons-extractor.ts:61-86` extracts these proposals from lessons; `proposals.ts:233,326` are the apply-paths. `plan-sharding-signals.ts:535` ships `evaluateMinimumShardRule` — the pure-function gate shape the Q1 "idiom-read-traceability" rule should mirror.
**Implication:** Q1 + Q3 are automation work, not invention. The novel piece is R6 (the idiom-rubric judge), not the loop plumbing.

### L6. There is no published idiom-compliance benchmark for cross-language code LLMs.
**Context:** Designing R6 (idiom-compliance evals in buffbench).
**Finding:** researcher-docs (prior turns) confirmed MultiPL-E and HumanEval-X measure functional correctness, not idiom compliance. No published benchmark penalizes "functionally correct but non-idiomatic."
**Implication:** R6 is the field's first. Judge calibration (O4) is a genuine research risk, not a tooling risk — sequence Q3 auto-promotion behind a measured judge agreement threshold.

### L7. The tree-sitter query-file inventory is inconsistent with the "13 languages" claim.
**Context:** Sizing R4 (tree-sitter query parity) and Q2 (`rewrite_symbol` cross-language extension).
**Finding:** The file picker this turn found only `packages/code-map/src/tree-sitter-queries/tree-sitter-typescript-tags.scm` on disk. The prior summary claimed 13 language support.
**Implication:** O1 is a real blocking question, not a typo. Non-TS symbol extraction must happen via some other mechanism (different `.scm` path? grammar-inferred? code-map fallback?). Resolve by reading `packages/code-map` directly before sizing R4 or Q2 `rewrite_symbol`.

### L8. The cross-thread root cause is shared with the audit-breadth failure.
**Context:** Connecting the idiom packet to the sibling audit-codebase and read/edit-tool packets.
**Finding:** Both failures share the shape "the agent has no internal penalty for incompleteness, and completeness is judged externally." The audit fix is `evaluateMinimumShardRule` (already shipped); the idiom fix is the Q1 read-traceability rule ("did you `read_files agents/idioms/<lang>.md` before the first edit?") — the *direct translation* of the same shape to the idiom domain, not yet shipped.
**Implication:** When authoring the Q1 gate, copy the `evaluateMinimumShardRule` test shape verbatim from `evals/buffbench/__tests__/plan-sharding-signals.test.ts:548` — same skeleton, different signal. This is pattern reuse, not metaphor.

## Gotchas

- G1. **Don't conflate three sibling packets.** This packet (idiom quality), the `read-edit-tool-improvements-from-aider-*` packet, and the `rewrite_symbol` cross-language extension (discussed prior turns) touch overlapping touch-points (`rewrite_symbol` cross-language; Aider repo map; lint-loop retry cap). When executing, sequence O6 (coordination) up front to avoid divergence.
- G2. **Don't byte-freeze the new `projectLanguageProfilePrompt()`.** R1 must stay refactoring-friendly like `frontendSection`, not frozen like `qualitySection`, so the idioms files can evolve with the model ecosystem.
- G3. **Don't conflate `evaluateMinimumShardRule` (audit coverage) with the idiom read-traceability rule (Q1).** Same skeleton, different signal: audit counts `file-picker`/`code-searcher` shards per subsystem; idiom counts `read_files` of `agents/idioms/<lang>.md` per non-TS edit. Both are pure-function gates; both externalize a "did you actually do the work?" bar; the audit one already exists.
- G4. **R2 auto-wired linters need a retry cap (O2).** Without one, an auto-lint → re-edit → auto-lint loop can persist on a fixable-but-stubborn error. Coordinate this constraint with the sibling read/edit-tool packet R1, which has the same shape.

## Decisions made during planning

- D1. **Frame this packet as plan-only, not implementation.** Execution requires a separate session slug (e.g., `idiom-quality-tier1-<date>/`). This packet is the recommendation-of-record.
- D2. **Combine the one-week R1–R6 and the one-year Q1–Q3 into a single packet.** They share diagnosis, touch-points, and cross-thread connection; splitting would force re-derivation of substrate context in a later turn.
- D3. **Cheapest-first sequencing: R3 + R5 before R1.** R3 (gate `frontendSection`) + R5 (generalize mandates) are prompt-assembly-only; R1 (idioms files) is content authoring, slower. Sequence R3/R5 to remove the biggest pollution source while R1 authoring proceeds in parallel.
- D4. **Defer R7 (learned apply model) / LSP / LoRA / per-project-config to the Q4+ sketched tier.** They are out-of-scope for the year's work by the explicit anti-recommendations.
- D5. **Coordinate Q2 with the sibling `read-edit-tool-improvements-from-aider-*` packet via O6.** Both packets touch `rewrite_symbol` cross-language and Aider-style repo map. Don't execute them in separate sessions without shared lessons.

## Follow-up notes (for the execution session that picks this up)

- F1. Before R3 execution, re-read `agents/base2/base.ts:311-318`, `agents/base2/base-deep.ts:128-132`, `agents/editor/editor.ts:190-196` to confirm all three `frontendSection` injection sites are gated by the new helper (L1).
- F2. Before R5 execution, re-read `agents/__tests__/quality-prompt-snapshot.test.ts:22` and plan the snapshot-update in the same PR (L2 / O5).
- F3. Before R1 execution, copy `common/src/util/patterns.ts:125` `formatPatternsIndexPrompt` shape verbatim (L3); add `PLACEHOLDER.LANGUAGE_PROFILE` at `packages/agent-runtime/src/templates/strings.ts:189`.
- F4. Before R2 execution, add a "auto-wired linter defaults compose with user overrides" test case alongside `sdk/src/__tests__/file-change-hooks.test.ts:197` (L4); coordinate the retry cap with the sibling packet (O2 / G4).
- F5. Before Q1 read-traceability gate execution, model the gate on `evals/buffbench/plan-sharding-signals.ts:535` `evaluateMinimumShardRule` shape (L5 / L8 / G3); copy the test skeleton from `evals/buffbench/__tests__/plan-sharding-signals.test.ts:548`.
- F6. Before R6 / Q3 execution, measure idiom-rubric judge agreement on a seeded sample (L6 / O4). Do NOT enable auto-promotion before agreement is measured.
- F7. Before Q2 execution, resolve O1 (L7) by listing all `.scm` files in `packages/code-map` and any sibling grammar directories.

<!-- update_plan_status:appended -->
## Validation Lesson — Frontend Prompt Gating — 2026-07-06T14:30:04.189Z

Tier 1 R3/R5 validation used the narrow prompt-focused test set:
`bun test agents/__tests__/quality-prompt-snapshot.test.ts packages/agent-runtime/src/templates/__tests__/strings.test.ts`

Result: 28 pass / 0 fail / 2 snapshots.

Reusable note: for prompt-gating work that moves static prompt text behind a runtime placeholder, validate both layers together: (1) agent prompt wiring tests that assert consumers contain the placeholder but not the raw gated section, and (2) runtime formatter tests that assert the placeholder expands only for matching file trees.

<!-- update_plan_status:appended -->
## Validation Gotcha — Browser-use Smoke Script in Agents Test Suite — 2026-07-06T14:41:35.418Z

The broad `cd agents && bun run typecheck && bun test` command currently includes `agents/browser-use/browser-use.test.ts`, which behaves like a standalone executable smoke script rather than a normal unit test. Under package-wide `bun test`, it reaches its `import.meta.main` path and fails when `loadLocalAgents({ agentsPath: path.join(process.cwd(), 'agents') })` resolves to `agents/agents` after `cd agents`.

Reusable note: when validating prompt-section work, the reliable narrow suite is `bun test agents/__tests__/quality-prompt-snapshot.test.ts packages/agent-runtime/src/templates/__tests__/strings.test.ts` from the repo root. If the full agents package suite must become green, handle `browser-use/browser-use.test.ts` separately by either excluding executable smoke scripts from the default `test` script or making the script resolve its agents path correctly when run from the `agents` package cwd.


<!-- update_plan_status:appended -->
## R1 Language Profile Lessons — 2026-07-06T15:15:24.969Z

R1 implementation followed the low-token pattern from `formatPatternsIndexPrompt`: inject only a compact detected-language section and require agents to `read_files` the specific `agents/idioms/<lang>.md` before non-trivial edits. This avoids the original prompt-pollution failure while still making the idiom contract explicit.

Validation gotcha: the targeted `bun test ...` path also picked up mirrored tests under `evals/test-repos/openbuff-HEAD/...` in this repo. They passed, but future narrow validation summaries should call out when Bun discovers duplicated test paths so it is not mistaken for an intentional broader suite.

R1 scope intentionally remains MVP: TypeScript/JavaScript, Python, Rust, and Go only. PLAN.md still records the broader 15-language target for Q1; do not treat the remaining idiom files as accidentally omitted from this execution slice.


<!-- update_plan_status:appended -->
## R2 linter-hook gotchas — 2026-07-06T17:11:31.711Z

R2 defaults should be lint/format oriented, not broad test runners: use manifest-derived commands like `cargo clippy`, `ruff check --fix`, `go vet`/`gofmt`, `rubocop`, `swift-format lint`, and `dotnet format --verify-no-changes` so file-change hooks stay focused and predictable.

`autoFileChangeHooks` needs tri-state merge semantics: `undefined` inherits, `false` opts out, and `true` re-enables after a base config disables it. Preserve the field in setup/config merge paths too, or explicit user intent can be dropped.

Focused hook-registry tests can avoid real toolchain dependencies by creating temporary manifest files and asserting inferred hook objects directly; only `runFileChangeHooks` tests should use the fake runner.


<!-- update_plan_status:appended -->
## O1 resolution lesson — 2026-07-06T18:41:02.258Z

O1 is resolved: direct inspection shows `packages/code-map/src/tree-sitter-queries/` has 13 bundled tags queries and `packages/code-map/src/languages.ts` registers all 13 language configs. The stale concern came from incomplete discovery, not missing query files.

Reusable takeaway:
- For R4/Q2, do not start by adding query files. Start with a parity audit: compare tags-query token coverage, AST structural extraction coverage, runtime grammar availability, and tests per language.
- PHP/Swift/Kotlin are config/query-registered but may lack available WASM grammars in `@vscode/tree-sitter-wasm`; current tests intentionally accept graceful no-op for those languages.
- Structural extraction is AST-walk based (`structure.ts`), not tags-query based, so improving tags queries alone will not improve `read_outline`, symbol slices, or `rewrite_symbol` unless `DEFINITION_NODE_KINDS` / name extraction / grammar availability also support the language.


<!-- update_plan_status:appended -->
## R2 + R4/R6 lessons — 2026-07-06T23:35:45.652Z

R4/R6 LESSONS:
- The R2 auto-wired linters and R6 `classifyCommand` must stay alphabetically co-maintained: every manifest-inferred hook command in `sdk/src/tools/file-change-hooks.ts:inferFileChangeHooks` should appear in `evals/buffbench/deterministic-signals.ts:classifyCommand` so its exit code lands in the lint cap (cap 7), not the generic cap (6) or no cap. Today's set: `cargo clippy`, `cargo fmt --check`, `ruff check --fix`, `go vet`, `gofmt`, `rubocop`, `swift-format lint`, `dotnet format --verify-no-changes`.
- Prefer plain tool invocations (`rubocop`, not `bundle exec rubocop`) for inferred defaults so the hook does not assume a Bundler-managed Ruby project.
- `autoFileChangeHooks` needs tri-state merge semantics (undefined inherits / false opts out / true re-enables) in both provider-config merge paths (`mergeProviderConfig` and the setup merge near `writeProviderConfigFile`). Dropping the field in either path silently loses user intent.
- Focused hook-registry tests can avoid real toolchains by creating temporary manifest files and asserting inferred hook objects directly; only `runFileChangeHooks` tests need the fake runner.
- R4 tree-sitter query inventory is NOT blocked by missing `.scm` files: 13 language-tag queries already live at `packages/code-map/src/tree-sitter-queries/*-tags.scm`. R4 sizing should focus on per-query richness parity, not file presence.

