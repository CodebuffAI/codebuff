# PLAN: Cross-language idiom quality — one-week + one-year workstream

## Overview

The agent is React-biased at three compounding layers (prompt, examples, feedback loop). The user's diagnosis (prior turns) is correct and the fix is architectural, not "add more languages to the prompt." This packet captures both the one-week R1–R6 plan and the four-quarter Q1–Q3 roadmap as a single resumable workstream. This is a **plan packet, not an implementation** — execution happens in one or more separate follow-up sessions.

## The three failure modes (all three confirmed via code-searcher this turn)

1. **Prompt pollution** — `frontendSection` (`agents/base2/quality-prompt-section.ts:79`) is injected unconditionally into the system prompt of `base2.ts:314` AND `base-deep.ts:130` AND `editor/editor.ts:194`. Editing a `.py` → React guidance still in context.
2. **Example/idiom deficit** — `qualitySection` (byte-frozen at `agents/__tests__/quality-prompt-snapshot.test.ts:22`) hardcodes `package.json`/`Cargo.toml`/`requirements.txt`/`build.gradle` as the manifest examples. The Code Editing Mandates at `base2.ts:144–168` double down: line 147 same list, line 159 "editing the package.json", line 167 lists TS-only `insert_import`/`remove_import` as universal.
3. **No corrective feedback loop** — only `tsc`/`eslint` are wired; `clippy`/`ruff`/`golangci-lint`/`rubocop`/`swift-format`/`dotnet format` are not auto-wired. Non-idiomatic code passes silently.

The one structural keystone: **the file extension of the edit target is the one deterministic event where the agent knows the language.** Everything upstream (system prompt) is too coarse; everything downstream (post-edit linters) is too late for the first edit.

## Part A — One-week plan (R1–R6)

### R1. Language-profile injection at prompt assembly
Ship `agents/idioms/{typescript,python,rust,go,java,kotlin,ruby,swift,cpp,csharp,elixir,scala,sql,terraform,bash}.md` (~150-token essence + "3 idioms beginners from other languages get wrong" each). Add `projectLanguageProfilePrompt()` in `common/src/util/` mirroring `formatPatternsIndexPrompt` (`common/src/util/patterns.ts:125`); detect languages via glob at prompt assembly; wire a new `PLACEHOLDER.LANGUAGE_PROFILE` in `packages/agent-runtime/src/templates/strings.ts:189`. **Effort: M. Risk: L. Defeats: failure 1 + 2.**

### R2. Auto-wire language-specific linters as file-change hooks
Manifest→hook registry: `Cargo.toml`→`cargo clippy`; `pyproject.toml`/`requirements.txt`→`ruff check --fix`; `go.mod`→`go vet && gofmt -l`; `package.json`→`eslint`/`tsc`; `Gemfile`→`rubocop`; `Package.swift`→`swift-format lint`; `*.csproj`→`dotnet format --verify-no-changes`. Detect via glob on first assembly; register into the existing `runFileChangeHooks` flow using `mergeFileChangeHooks` (`sdk/src/provider-config.ts:792`, concat-with-dedup, override wins, tested). User overrides via `openbuff.d/hooks.json`. Linter output feeds buffbench `deterministic-signals.ts` lint category (score cap 7). **Effort: M. Risk: M (test-runner + per-language setup; retry cap needed — see O2). Defeats: failure 3.**

### R3. Restructure the system prompt: frozen cross-language core + conditional language-specific extensions
Keep `qualitySection` (DRY/SOLID/universal craftsmanship) frozen and unconditional. Yank `frontendSection` from unconditional injection at `base2.ts:314`, `base-deep.ts:130`, AND `editor/editor.ts:194` — gate it on `.tsx`/`.jsx` presence. Add `backendSection` / `systemsSection` / `mobileSection` injected only when their languages are detected. Craftsmanship is universal; platform rules are conditional. Note: `frontendSection` is intentionally NOT byte-frozen (`agents/__tests__/quality-prompt-snapshot.test.ts:18` comment), so refactoring it is lower-friction than touching `qualitySection`. **Effort: S. Risk: L. Defeats: failure 1.**

### R4. Tree-sitter query parity for non-TS languages
**O1 must be resolved first:** the file picker this turn found only `packages/code-map/src/tree-sitter-queries/tree-sitter-typescript-tags.scm` on disk — inconsistent with the prior "13 languages" summary. Verify how non-TS symbol extraction happens today (different `.scm` path? code-map fallback? inferred from package grammar?) before sizing this. Target: bring every supported language's symbol-extraction query up to TS-level richness (functions, methods, classes, types, imports, exports). Source from nvim-treesitter + Helix query collections; trim for symbol extraction only. **Effort: L (pending O1). Risk: M. Defeats: failure 2 amplifier.**

### R5. Demote TS-specific examples in Code Editing Mandates
`base2.ts:144–168` hardcodes `package.json` as the manifest example and `rewrite_symbol`/`insert_import`/`remove_import` (TS-only structured ops) as universal. Generalize the manifest note to "the project's package manager manifest (npm `package.json`, Cargo `Cargo.toml`, pip `pyproject.toml`/`requirements.txt`, Gradle `build.gradle`, Go `go.mod`, Ruby `Gemfile`, Swift `Package.swift`, .NET `*.csproj`)" and move TS-specific edit ops to a sub-bullet. `qualitySection`'s list needs a snapshot-test update (byte-frozen — see C2). **Effort: S. Risk: L. Defeats: implicit "this is a TS project" assumption.**

### R6. Per-language idiom-compliance evals in buffbench (this queue, starts long-term)
Idiom-specific refactors ("use `?` + `Vec::with_capacity`", "convert loop to dict comprehension", "wrap Go error with `fmt.Errorf('X: %w', err)`", "use trait + impls instead of switch-on-type") with a rubric that explicitly penalizes non-idiomatic equivalents. Judge produces `idiomScore` + `nonIdiomaticPatternsDetected[]`. **Effort: L. Risk: M (judge calibration — see S3, O4). Defeats: long-term drift.**

### One-week sequencing
- **Day 1:** R3 (gate `frontendSection`) + R5 (demote TS examples). Both prompt-assembly-only, near-zero cost.
- **Days 2–4:** R1 MVP — author 4 idioms files (typescript, python, rust, go), fold into `projectLanguageProfilePrompt()` next to `knowledgeFilesPrompt`. Detect via existing glob infra.
- **Day 5:** Smoke-test on a representative Python repo + Rust repo. Tighten.
- **Days 6–7:** Snapshot test in `main-prompt.test.ts`; `CONTRIBUTING.md` note on authoring a new language's idioms file.

### Anti-recommendations (don't do)
1. Don't ship a giant "all-languages" prompt appendix — token dilution, 13× maintenance. Glob/extension-scoped injection is strictly better (R1 follows this).
2. Don't pursue per-language LoRA / fine-tuning — BYOK, multi-provider, local-first; out of scope.
3. Don't make user-authored per-project idiom files the only mechanism — friction defeats adoption. Ship canned idioms; let `knowledge.md` add specifics.
4. Don't build LSP integration in v1 — brittle across heterogeneous user machines; tree-sitter covers ~80% at 5% of the cost.
5. Don't pursue AST-based edit primitives as a *first-order* fix — fixes fragile string-replacement but won't idiomize code; the problem is prompt + feedback-loop, not edit reliability. (But see Q2 — `rewrite_symbol` cross-language extension is *complementary*, not first-order.)
6. Don't make the language-conditional prompt section user-configurable in v1 — configuration surface + test burden. Ship one good default.

## Part B — One-year roadmap (Q1–Q3)

The year-long lever the week cannot unlock: **the self-improving loop turns idiom improvements into a data-driven engineering problem instead of guess-and-ship.** buffbench already has the machinery (`proposals.ts` `append_system_prompt_guidance`, `lessons-extractor.ts`, `deterministic-signals.ts` score caps, `plan-sharding-signals.ts` `evaluateMinimumShardRule`). The year's work is to connect cross-language idiom signals into that loop.

### Q1 — "Detect the language, fix the prompt, instrument the loop"
- R3 + R5: ship on day 1.
- R1 expanded: 15 idioms files, not 4. The 15-language breadth matters — without coverage the loop won't see where the agent struggles.
- **Build the field's missing benchmark:** author `evals/buffbench/idiom-rubric.ts` — 200–400 refactor tasks per language with the R6 rubric. Judge emits `idiomScore` + `nonIdiomaticPatternsDetected[]`.
- **Read-file-traceability rule (audit analog):** a pure-function gate in the shape of `evaluateMinimumShardRule` (`evals/buffbench/plan-sharding-signals.ts:535`) — "for a non-TS edit, did the trace include a `read_files` on `agents/idioms/<lang>.md` before the first edit?" This is the *direct translation* of the audit coverage matrix to the idiom domain: make "consulting the idiom contract" verifiable, not assumed.
- R2 start: auto-wire manifest→linter hooks via `mergeFileChangeHooks`; user override via `openbuff.d/hooks.json`. Linter output feeds `deterministic-signals.ts` lint category.
- **Quarter gate:** buffbench nightly runs surface a per-language `idiomScore` dashboard. The loop is now generating labeled failure data — even before any model has changed.

### Q2 — "Make edits structurally correct across languages"
- R4 expanded: bring every supported language's `.scm` up to TS-level richness (pending O1 verification). Source from nvim-treesitter + Helix; trim for symbol extraction only. Prioritize by Q1 idiom-rubric where the agent actually struggles.
- **Extend `rewrite_symbol` to non-TS languages.** Tree-sitter AST is parsed for 13 languages in `packages/code-map` (verify O1); the rewrite path bails with guidance today. Ship name-anchored AST edits for Python, Rust, Go, Java, Kotlin, Ruby, Swift, C++ minimum. **Shared dependency with the `rewrite_symbol` cross-language extension plan (prior turn + the read/edit-tool improvements packet R6) — coordinate sessions.**
- **Aider-style repo map as auxiliary context** (port into `packages/indexer` or new `packages/repo-map`). Pattern: ctags OR tree-sitter → hierarchical compressed text → soft token budget with `--map-multiplier-no-files` 2× when no files targeted; per-model enable/disable via provider config. Language-agnostic context layer that compounds with idioms. Depends on `researcher-docs` Aider findings (prior turns). **Shared with the read/edit-tool-improvements packet.**
- Per-language structural-aware editor agent (optional, hedged): snapshot Q1 idiom-scores before committing.
- **Quarter gate:** buffbench idiom scores in Python/Rust/Go show 30–50% improvement vs. Q0 baseline. If not, diagnose retrieval (Q2 repo map) vs. idiom knowledge (Q1 prompts) before Q3.

### Q3 — "Close the self-improving loop"
- **buffbench → lessons-extractor → proposals → agent definitions:** scheduled pipeline that, every N buffbench runs, runs the lessons extractor on failing idiom-rubric runs, proposes `append_system_prompt_guidance` patches targeted at the language-prompt section, applies them in a staging agent config, runs buffbench-idiom-rubric on staging, auto-promotes patches that improve ≥ N iters with no regressions in other languages. The `proposals.ts` machinery (`proposals.ts:38`, `lessons-extractor.ts:61–86`) exists — this is automation, not invention. **Treat agent definitions as a tested codebase, not a hand-edited config.**
- **Idiom-compliance judge mode:** train/prompt-engineer a judge that distinguishes "functionally correct but non-idiomatic" from "idiomatic" with `nonIdiomaticPatternsDetected[]`. Gate promotion on it. (Today's `evals/buffbench/judge.ts` measures functional correctness.)
- **Quarter gate:** auto-promotion of at least 3 idiom-guidance patches with no buffbench regression in any language.

### Q4+ — "Ecosystem" (sketched, defer)
- Per-project idiom overrides via `knowledge.md`.
- Idiom-plugin marketplace if adoption warrants.
- Idiom-aware `query_index` ranking — surface idiomatic examples higher in cross-language retrieval.
- Reconsider LSP if tree-sitter gaps prove blocking.

## Prioritization rationale

- R3 (gate `frontendSection`) is the cheapest edit in the list and removes the biggest pollution source. ship-first.
- R5 (generalize mandates) pairs with R3 for hygiene.
- R1 (positive grounding) is next — without a per-language contract the loop has nothing to gate against.
- R2 (linters) is the force-multiplier for failure-mode 3; second week.
- R6 (idiom-rubric) is the long-term drift cap; start in Q1 even if the full benchmark takes longer.
- Q2 `rewrite_symbol` extension + repo-map port coordinate with two other plan packets — sequence them together to avoid rework.

## Relevant files

### Prompt-assembly substrate (R1, R3, R5)
- `agents/base2/quality-prompt-section.ts:79` — `frontendSection` (NOT byte-frozen; refactoring-friendly)
- `agents/base2/quality-prompt-section.ts:22` — `qualitySection` (byte-frozen; C2)
- `agents/base2/base2.ts:314`, `agents/base2/base-deep.ts:130`, `agents/editor/editor.ts:194` — three unconditional `frontendSection` injection sites
- `agents/base2/base2.ts:144–168` — Code Editing Mandates (R5)
- `agents/__tests__/quality-prompt-snapshot.test.ts:18,22,38` — byte-frozen tests (C2)
- `common/src/util/patterns.ts:125` — `formatPatternsIndexPrompt` pattern to mirror for R1
- `packages/agent-runtime/src/system-prompt/prompts.ts:14` — `knowledgeFilesPrompt` (slot for R1)
- `packages/agent-runtime/src/templates/strings.ts:189` — `PLACEHOLDER.PATTERNS_INDEX` wiring (R1 adds `PLACEHOLDER.LANGUAGE_PROFILE`)
- `packages/agent-runtime/src/__tests__/main-prompt.test.ts` (referenced; verify exists)

### Linter-hook substrate (R2)
- `sdk/src/provider-config.ts:792` — `mergeFileChangeHooks` (concat-with-dedup, override wins)
- `sdk/src/__tests__/file-change-hooks.test.ts:197` — `mergeFileChangeHooks` tests
- `sdk/src/tools/file-change-hooks.ts` — `selectMatchingHooks`, `runFileChangeHooks`
- `common/src/tools/params/tool/run-file-change-hooks.ts` — `run_file_change_hooks` tool params
- `sdk/src/provider-config.ts` — `providerConfigFileSchema.fileChangeHooks`

### Tree-sitter substrate (R4, Q2 `rewrite_symbol` extension)
- `packages/code-map/src/tree-sitter-queries/tree-sitter-typescript-tags.scm` — only confirmed query file (O1)
- `packages/agent-runtime/src/structural-read.ts` — `extractSlices` (already multi-language via code-map)
- `packages/agent-runtime/src/tools/handlers/tool/rewrite-symbol.ts` — `handleRewriteSymbol` (Q2 extension point)

### buffbench loop substrate (R6, Q1 read-traceability, Q3 promotion)
- `evals/buffbench/proposals.ts:38,233,326` — `append_system_prompt_guidance` proposal kind
- `evals/buffbench/lessons-extractor.ts:61-86` — proposal extractor
- `evals/buffbench/plan-sharding-signals.ts:535` — `evaluateMinimumShardRule` (template for idiom-read-traceability gate)
- `evals/buffbench/deterministic-signals.ts` — `classifyCommand`, `clampScoresByDeterministicSignals` (lint/test/compile caps)
- `evals/buffbench/judge.ts` — current judge (functional correctness; R6 adds idiom axis)
- `evals/buffbench/__tests__/proposals.test.ts`, `evals/buffbench/__tests__/plan-sharding-signals.test.ts` — test patterns to follow

## Validation gates

- R3: snapshot tests still pass; `frontendSection` absent from system prompt in a Python-only repo; present in a `.tsx` repo.
- R5: snapshot test updated; manifest list contains all 8 manifest files; TS-specific ops moved to sub-bullet.
- R1: `projectLanguageProfilePrompt()` returns empty string when no known languages detected; returns ~150-token essence + pointer per detected language otherwise. Snapshot test in `main-prompt.test.ts`.
- R2: `mergeFileChangeHooks` test extended with a "auto-wired linter defaults compose with user overrides" case. Lint failures surface in `deterministic-signals` test.
- R6: `idiom-rubric.ts` test with seeded refactor tasks; judge agreement ≥70% on a sample.
- Q1 gate: per-language `idiomScore` dashboard renders from buffbench nightly.
- Q2 gate: 30–50% `idiomScore` improvement on Python/Rust/Go refactors vs. Q0 baseline.
- Q3 gate: ≥3 auto-promoted idiom-guidance patches with no buffbench regression in any language.

## Risks / blockers / open questions

- **O1. Tree-sitter query inventory.** The file picker this turn found only `tree-sitter-typescript-tags.scm` on disk, but `packages/code-map` is supposed to support 13 languages. Must verify how non-TS symbol extraction happens today before sizing R4 or Q2 `rewrite_symbol` extension. **Blocking for Q2.**
- **O2. Auto-wired linter retry cap.** Same constraint as the read/edit-tool packet R1 — an auto-lint re-edit loop needs a max-retry cap per file per turn. Coordinate the two packets' fixes.
- **O3. Opt-in vs. default.** Auto-wired linters: ship by default with a disable flag, or gate behind per-project opt-in? Open product question.
- **O4. Idiom-rubric judge calibration.** No published idiom-compliance benchmark exists; we are building the field's first. Judge agreement must be measured before Q3 auto-promotion can trust it.
- **O5. Snapshot test churn.** `qualitySection` is byte-frozen; R5 updates the manifest list, which forces a snapshot-test update. Plan the test update in the same execution unit as the prose change.
- **O6. Coordination with two sibling packets.** The `rewrite_symbol` cross-language extension appears in both this packet (Q2) and the prior `rewrite_symbol` extension discussion; the Aider-style repo map appears here (Q2) and in the read/edit-tool improvements packet R6. Decide whether to merge those workstreams into one execution session or sequence them with shared lessons.

## Assumptions

- A1. `frontendSection` will remain the only intentionally-not-byte-frozen quality-prompt section (its snapshot-test comment says so); R3 can refactor it freely.
- A2. `mergeFileChangeHooks`'s concat-with-dedup is robust enough for auto-wired linter defaults (test at `sdk/src/__tests__/file-change-hooks.test.ts:197` is the existing guarantee).
- A3. The buffbench `append_system_prompt_guidance` proposal pipeline applies to agent definitions cleanly — `proposals.ts:233,326` apply-paths are the seam.

## Checkpoint / update rules

- STATUS.md: update via `update_plan_status` when each R/Q item's status changes (todo → in progress → done / blocked).
- LESSONS.md: append via `update_plan_status` whenever O1–O6 are resolved, whenever a cross-system technique is found already-shipped-here (e.g., if R1's pattern turns out to already exist under a different name), or whenever a sibling packet coordination decision is made.
- PLAN.md / SPEC.md: rewrite via `create_plan` only if the tier structure or scope changes materially (e.g., promoting R6 to a real execution plan, or merging with the read/edit-tool packet).

## Resume guidance

1. Read SPEC.md + STATUS.md + LESSONS.md (in this session dir).
2. If resuming from "ready to execute": the cheapest first move is R3 (gate `frontendSection`) + R5 (generalize mandates) — both prompt-assembly-only. Spawn a separate execution session (e.g., `.agents/sessions/idiom-quality-tier1-<date>/`) carrying forward only the touch-points + validation gates; do NOT expand this research packet into execution.
3. Before Q2 execution, resolve O1 (tree-sitter query inventory) by reading `packages/code-map` directly.
4. Before R2 execution, coordinate O2 (retry cap) with the sibling `read-edit-tool-improvements-from-aider` packet R1 (same constraint).
5. Before Q3 execution, resolve O4 (judge calibration) — the auto-promotion gate cannot trust an unmeasured judge.

## Cross-thread connection (shared root cause with two sibling packets)

Both the audit-breadth failure ("audits take the easy way out") and the idiom-compliance failure share the root cause: **the agent has no internal penalty for "incompleteness," and "completeness" is judged externally.** The structural fix is the same shape — **externalize the completeness bar to a deterministic, machine-checked rule, not an assumption.**

- For audits: breadth across subsystems. fix = `evaluateMinimumShardRule` (`evals/buffbench/plan-sharding-signals.ts:535`) — already shipped.
- For idiom compliance: matching the per-language idiom contract. fix = the read-traceability rule in Q1 ("did you `read_files agents/idioms/<lang>.md` before the first edit?") — the *direct translation* of `evaluateMinimumShardRule` to the idiom domain, not yet shipped.

This packet is the third sibling to:
- `.agents/sessions/audit-codebase-*` (the audit-byok-beneficial-changes thread; uses `evaluateMinimumShardRule`).
- `.agents/sessions/read-edit-tool-improvements-from-aider-2026-07-06/` (overlaps at O2 retry cap and at Q2 repo map / `rewrite_symbol` extension — coordinate via O6).

## Artifacts

- Session: `.agents/sessions/cross-language-idiom-quality-2026-07-06`
- SPEC.md: `.agents/sessions/cross-language-idiom-quality-2026-07-06/SPEC.md`
- PLAN.md: `.agents/sessions/cross-language-idiom-quality-2026-07-06/PLAN.md`
- STATUS.md: `.agents/sessions/cross-language-idiom-quality-2026-07-06/STATUS.md`
- LESSONS.md: `.agents/sessions/cross-language-idiom-quality-2026-07-06/LESSONS.md`