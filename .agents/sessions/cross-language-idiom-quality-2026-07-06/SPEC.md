# SPEC: Cross-language idiom quality — kill React-bias and make the agent write idiomatic code in every supported language

## Goal

Make the agent write idiomatic code in whatever language it's editing, not just TypeScript/React. The harness is currently React-biased at three compounding layers (prompt, examples, feedback loop) and the user has been working through this for multiple turns — a one-week plan (R1–R6) and a one-year roadmap (Q1–Q3) are already on the table. This packet captures both as a single resumable, durable workstream so they stop being re-derived each turn.

## Goals

- G1. Stop polluting the system prompt with frontend/React guidance when the project is not TypeScript/React.
- G2. Give the agent per-language idiom grounding at prompt-assembly time (glob-detected, token-budgeted, opt-out friendly).
- G3. Auto-wire language-specific linters (ruff / clippy / go vet / rubocop / swift-format / dotnet format) as file-change hooks so non-idiomatic code fails the validation gate instead of passing silently.
- G4. Bring tree-sitter symbol-extraction query coverage up to TS-level richness for every supported language (currently only `tree-sitter-typescript-tags.scm` ships; non-TS recall is poor, compounding the idiom problem via `query_index`).
- G5. Generalize the TS-specific examples in the Code Editing Mandates (`package.json` as the manifest example, `rewrite_symbol`/`insert_import`/`remove_import` as universal) to language-neutral phrasing.
- G6. Build an idiom-compliance benchmark in buffbench (the field has none — MultiPL-E / HumanEval-X measure functional correctness, not idiom compliance) and connect it to the existing self-improving loop (`lessonsextractor` → `proposals.append_system_prompt_guidance`).
- G7. Over Q2–Q3, extend `rewrite_symbol` to non-TS languages (the AST foundation in `packages/code-map` already parses 13 languages; only the rewrite path bails today) and close the self-improving loop on idiom data.

## Non-goals

- Per-language LoRA adapters or fine-tuning (BYOK / multi-provider / local-first — out of scope by design).
- LSP integration in v1 (brittle across heterogeneous user machines; tree-sitter covers ~80% at 5% of the cost).
- Making the language-conditional prompt section user-configurable in v1 (configuration surface + test burden; ship one good default).
- A giant "all-languages" prompt appendix (token dilution, 13× maintenance; glob/extension-scoped injection is strictly better).
- Project source edits in this plan mode session. Execution happens in a separate follow-up plan.

## Scope (discovered substrate, verified this turn)

**The three failure modes (user's diagnosis, prior turns):**
1. **Prompt pollution** — `frontendSection` (`agents/base2/quality-prompt-section.ts:79`) is injected unconditionally into the system prompt at `agents/base2/base2.ts:314`, `agents/base2/base-deep.ts:130`, AND `agents/editor/editor.ts:194`. Confirmed via code-searcher this turn. Editing a `.py` file → React guidance still in context.
2. **Example/idiom deficit** — `qualitySection` (byte-frozen snapshot test at `agents/__tests__/quality-prompt-snapshot.test.ts:22`) hardcodes `package.json` / `Cargo.toml` / `requirements.txt` / `build.gradle` as the manifest examples. The Code Editing Mandates at `agents/base2/base2.ts:144–168` double down: line 147 hardcodes the same list, line 159 says "editing the package.json file with a guess at the version number," line 167 lists `insert_import/remove_import` (TS-only structured ops) as universal.
3. **No corrective feedback loop** — only `tsc`/`eslint` are wired today; `clippy`/`ruff`/`golangci-lint`/`rubocop`/`swift-format`/`dotnet format` are not auto-wired. Non-idiomatic code passes silently.

**Existing substrate (verified this turn — we are not starting from zero):**
- `common/src/util/patterns.ts:125` exports `formatPatternsIndexPrompt({ index })` — empty index → empty string. This is the canonical pattern for a new `projectLanguageProfilePrompt()` to mirror.
- `packages/agent-runtime/src/system-prompt/prompts.ts:14` exports `knowledgeFilesPrompt` — the natural slot a language-profile section lands next to.
- `packages/agent-runtime/src/templates/strings.ts:189` wires `PLACEHOLDER.PATTERNS_INDEX` → `formatPatternsIndexPrompt` output. A `PLACEHOLDER.LANGUAGE_PROFILE` would mirror this.
- `sdk/src/provider-config.ts:792` has `mergeFileChangeHooks(base, override)` (concat-with-dedup, override wins, tested at `sdk/src/__tests__/file-change-hooks.test.ts:197`). Auto-wired linter defaults will compose with user overrides — no clobbering.
- `evals/buffbench/proposals.ts:38` defines the `append_system_prompt_guidance` proposal kind; `evals/buffbench/lessons-extractor.ts:61–86` emits them; `evals/buffbench/plan-sharding-signals.ts:535` has `evaluateMinimumShardRule` — the template for a future "did you read the per-language idioms file before editing?" traceability gate.
- `evals/buffbench/deterministic-signals.ts` has lint/compile/test score caps (`clampScoresByDeterministicSignals`) — the scoring backbone an idiom-rubric judge result would plug into.
- `packages/code-map` parses 13 languages via tree-sitter. **BUT** the file picker this turn reports only `packages/code-map/src/tree-sitter-queries/tree-sitter-typescript-tags.scm` on disk — non-TS symbol extraction may be inferred differently or much weaker than this turn's summary assumed. **This is an open question O1**, not a confirmed fact; must verify before Q2 R4 sizing.

## Acceptance criteria (this spec is "done" when)

- AC1. A one-week plan (R1–R6) and a one-year roadmap (Q1–Q3) exist in PLAN.md, each item carrying rationale, effort (S/M/L/XL), risk (S/M/H), and concrete verified file/symbol touch-points.
- AC2. Every recommendation is tied to one of the three confirmed failure modes, not novelty-for-novelty.
- AC3. The cross-thread connection (shared root cause with "audits take the easy way out"; same externalized-completeness-bar structural fix) is captured — this packet is the third sibling to the audit + read/edit-tool improvement packets.
- AC4. STATUS.md / LESSONS.md are seeded so the user (or a future session) can resume without re-deriving the diagnosis.
- AC5. Open questions (tree-sitter query file inventory, hash-vs-elision, opt-in-vs-default for auto-wired linters, idiom-rubric judge design) are explicitly enumerated.

## Relevant systems / files

See PLAN.md §"Relevant files."

## Constraints

- C1. Plan mode: no project source edits in this session.
- C2. Don't break the byte-frozen `qualitySection` snapshot test — `qualitySection` changes need a snapshot test update and a `base2.ts`/`base-deep.ts`/`editor.ts` impact check; `frontendSection` is intentionally NOT frozen and can be refactored with lower friction.
- C3. Auto-wired linter hooks must compose with user `openbuff.d/hooks.json` overrides via the existing `mergeFileChangeHooks` (don't bypass it).
- C4. Per-Language idioms files must be glob-detected + opt-out — not unconditional appendices.

## Risks to the spec itself

- S1. The tree-sitter query-file inventory (only TS `.scm` found this turn) is inconsistent with the prior "13 languages" claim — must resolve O1 before sizing Q2 R4 and the `rewrite_symbol` extension. Risk: over- or under-sizing Q2.
- S2. Auto-wired linters can loop indefinitely on persistent errors; needs a max-retry cap per file per turn (same constraint as the read/edit-tool packet's R1).
- S3. Idiom-rubric judge agreement is unmeasured; Q3 promotion gates depend on a judge that doesn't exist yet and is hard to calibrate.