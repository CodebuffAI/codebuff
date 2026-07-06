# Plan: Read/Edit tool improvements — adopting proven techniques from Aider and adjacent coding agents

## Overview / Goals

Investigate which read/edit techniques from Aider and adjacent coding agents (Cursor, Cline, Continue, Copilot Workspace, Claude Code, Codex CLI, Sourcegraph Cody) would meaningfully improve our existing read/edit tool surface — and produce a prioritized, resumable recommendation set. This is a **research-and-recommendation** plan, not an implementation plan: the deliverable is a reviewed set of adoption candidates with rationale, risk, and effort, suitable for execution in a separate subsequent plan.

## Context discovered (grounds the recommendations)

Our read/edit surface already inverts most of Aider's design:
- `read_files` — full + range + symbol-slice (via `structural-read.ts:extractSlices`), token-budgeted
- `read_outline` — tree-sitter outline + regex fallback for markdown
- `read_subtree` / `query_index` — code-map retrieval, parallel to Aider's repo-map
- `str_replace` — with `tryNearMatchAutoCorrect`, `findClosestMatches` (Levenshtein), `getOccurrenceLineRanges`, `mintAnchorForRange` (a near-Aider 5-step cascade)
- `replace_range` — **hash-guarded** (`getRangeContentHash`), drift-proof
- `rewrite_symbol` — **name-anchored AST** edit (tree-sitter), no peer in surveyed agents
- `edit_transaction` — **atomic multi-file** preflight+apply, no peer in surveyed agents
- `apply_patch` — unified diff with `findContextCore` + `tryApplyPatchWithFallbacks` (multiple fallback strategies)
- `apply_smart_patch` — `findBestHunkLineIndex` + `findBestMatchInRange` + `isAcceptableMatch` + `autoHealSyntax` + `threeWayMerge` (Aider `udiff`-style fuzzy apply + three-way fusion)

Aider ground-truth (verbatim source, prior research turn):
- `editblock_coder.replace_most_similar_chunk` cascade: perfect → whitespace-flex → skip-blank → `try_dotdotdots` → Levenshtein
- `udiff_coder.apply_partial_hunk` progressively drops context lines (`for drop in range(use_all+1)`)
- `directly_apply_hunk` ambiguity guard: `if len(before_lines) < 10 and content.count(before) > 1: return` (refuse)
- `model-settings.yml` routes edit format per-model (no per-language logic)
- Repo map is tree-sitter-based and **used only for prompt context, never for edit application**
- `--auto-lint` runs linters post-edit and feeds failures back to the model for re-edit
- No AST-aware edit application in any surveyed system; tree-sitter everywhere is retrieval-only

Cross-system findings (docs researcher, 15-finding matrix):
- Cursor: learned edit-application model (separate ML, trained on diff triples) + `@symbol` partial context
- Cline/Roo: borrowed Aider's SEARCH/REPLACE verbatim, plus `start_line`/`end_line` partial reads
- Continue: tree-sitter for outline only; edits are text-based diff
- Sourcegraph Cody: SCIP/LSIF for retrieval/navigation, not edit anchoring
- Claude Code & Codex CLI: `str_replace` + `apply_patch`, no AST, no learned apply
- Copilot Workspace / Sweep: SEARCH/REPLACE blocks, no AST, no lint loop in core

## Requirements (recommendation quality)

R1. Every recommendation must be tied to a concrete gap or improvement vs. our current surface (not novelty-for-novelty).
R2. Each recommendation must have: rationale, evidence (system that does it + how), effort estimate (S/M/L), risk, and a concrete file/symbol touch-point in our codebase when applicable.
R3. Recommendations must be prioritized into Ship-now / Evaluate / Defer tiers with explicit reasoning.
R4. Plan must be resumable across days (status, lessons, checkpoints).

## Non-goals

- Implementing any of the recommended techniques (a follow-up execution plan will handle that).
- Modifying any project source file. Plan mode = no edits.
- Re-evaluating `rewrite_symbol` cross-language extension (already covered in prior turn; this plan layers on top).
- Porting Aider's model-routing YAML (we route via tool schemas, not model-emit format — non-issue).

## Recommendations (the deliverable)

### TIER 1 — Ship-now (high value, modest effort, fills a real gap)

**R1. Lint-feedback → re-edit loop (Aider `--auto-lint` analog).** *Gap.* The single most impactful missing technique. After any edit, run the project's configured linter for the touched file; if errors, feed the lint output back to the model as a follow-up tool result and re-issue an edit at the same spot. We already have `run_file_change_hooks` plumbing (`common/src/tools/params/tool/run-file-change-hooks.ts`) that fires configured hooks on changed files; the gap is the *re-edit retry* on lint failure, which today's hook flow does not do automatically. Effort: M. Risk: L (already gated by user-configured lint scripts). Touch-point: extend the post-edit hook result consumer in the agent runtime to surface lint failures as an automatic retry prompt rather than a passive log. Evidence: Aider `--auto-lint` defaults true; no other surveyed agent has this loop in-core.

**R2. `...`-elision support in `str_replace` / `replace_range` SEARCH anchors (Aider `try_dotdotdots`).** *Gap.* Today the agent must paste the entire block it's editing. Aider lets the model emit `...` to skip unchanged middle lines, reducing paste-drift failures on multi-hundred-line regions. Effort: S–M. Risk: M (must be unambiguous; needs tests). Touch-point: `packages/agent-runtime/src/process-str-replace.ts` (add an elision-expander step in the matching cascade before `tryNearMatchAutoCorrect`); `sdk/src/tools/replace-range.ts` (skip `...` lines in hash verification). Evidence: Aider `try_dotdotdots` ships this; nobody else does.

**R3. Tiny-anchor multi-match refusal guard (Aider `directly_apply_hunk`).** *Improvement.* `udiff_coder` refuses to apply if `len(before_lines) < 10 and content.count(before) > 1`. Our `str_replace` has `getOccurrenceLineRanges` but the `<10 chars + multiple matches` rejection is advisory prose, not enforced. Promote it to a deterministic guard so ultra-broad anchors (lone brace, lone `return`) can't silently overwrite multiple sites. Effort: S. Risk: S. Touch-point: `process-str-replace.ts:tryMatchOldStr`. Evidence: Aider ships this exact guard; we currently prose-warn only.

### TIER 2 — Evaluate (real value, needs design validation)

**R4. Separate "editor model" for edit application (Aider `editor-diff`).** *Novel architecture.* Decouple the edit-application step from the reasoning model — use a cheaper/faster or stronger model specifically to translate the agent's intent into a clean SEARCH/REPLACE block. This is orthogonal to a *learned* apply model (Cursor) and cheaper to ship. Effort: M–L. Risk: M (model routing complexity; latency). Evidence: Aider `editor_edit_format: editor-diff` in `model-settings.yml`; Cursor has a learned variant. Recommend: spike first, measure edit success rate vs. baseline.

**R5. Auto-test retry loop (Aider `--auto-test` analog).** *Gap, but heavier.* Same pattern as R1 but for tests: after edits to a file with a known test command, run the test; on failure, feed output back and re-edit. Higher latency and cost than lint, so gate on a per-project opt-in. Effort: M. Risk: M (test flakiness, long runs). Touch-point: extend the hook result consumer from R1 with a test-runner hook type. Evidence: Aider `--auto-test`.

**R6. SCIP/LSIF-backed name-anchored edits as a `rewrite_symbol` fallback for unsupported tree-sitter languages.** *Improvement.* For the 11 tree-sitter languages where `rewrite_symbol` today returns "guidance to use str_replace," a SCIP index (if present) could resolve symbol→range and let `rewrite_symbol` apply the replacement by name anchor without tree-sitter symbol-resolution support in our code-map. Effort: L. Risk: M (SCIP index availability varies by project). Evidence: Sourcegraph Cody uses SCIP for retrieval only; no surveyed system uses it for *edit anchoring* — this would be a genuine innovation. Recommend: evaluate after the `rewrite_symbol` cross-language extension plan completes.

### TIER 3 — Defer / monitor

**R7. Learned edit-application model (Cursor Composer pattern).** *Different paradigm.* Train or fine-tune a small model on (original, diff, merged) triples to "heal" diffs no fuzzy matcher can fix. High effort, ML-infra-heavy, decoupled from our text/AST stack. Defer unless fuzzy + AST + lint-loop still leaves significant edit-failure rate. Effort: XL. Risk: H. Evidence: Cursor ships this; nobody else does.

**R8. Borrowing Cline's `start_line`/`end_line` partial read.** *Already covered.* We have `read_files` range support; no action.

**R9. Borrowing Aider's `model-settings.yml` format-routing.** *Non-issue.* We route edit primitives via tool schemas, not model-emit format. No action.

## Prioritization rationale

- Tier 1 items each close a concrete failure mode (silent multi-match corruption, paste-drift on large blocks, post-edit syntax errors) and have low-to-modest effort with minimal architectural change.
- tier 2 items are architecturally additive (new model role, new hook type, new index dependency) and warrant a design spike before commitment.
- tier 3 items are ML-infra-heavy (R7) or already satisfied (R8/R9).

## Relevant files / systems (for the eventual execution plan)

- `packages/agent-runtime/src/process-str-replace.ts` — R2, R3 touch-point
- `sdk/src/tools/replace-range.ts` — R2 touch-point
- `common/src/tools/params/tool/run-file-change-hooks.ts` + its runtime consumer — R1, R5 touch-point
- `packages/agent-runtime/src/tools/handlers/tool/apply-smart-patch.ts` — reference for how we already do fuzzy hunk apply; informs R2 elision design
- `packages/agent-runtime/src/structural-read.ts` — informs R6 (symbol resolution)
- `packages/agent-runtime/src/tools/handlers/tool/rewrite-symbol.ts` — R6 potential consumer
- `sdk/src/tools/apply-patch.ts` — `findContextCore` + `tryApplyPatchWithFallbacks` reference for R2/R3 fuzzy-match patterns
- `evals/buffbench/` — validation harness for measuring edit success rate before/after each tier 1 item

## Validation gates (how each recommendation would be verified when executed)

- R1: buffbench edit-success rate on a sample of edits with known lint failures; expect ≥10% reduction in edits that leave syntax errors.
- R2: synthetic test with `...`-elided search blocks against multi-hundred-line regions; expect zero paste-drift failures on cases that today require full-block paste.
- R3: regression test of multi-match refusal; expect silent corruption rate → 0.
- R4: A/B measurement of edit apply success rate with vs. without editor model.
- R5: measured test-pass-rate uplift on a repo with configured test runner.
- R6: coverage measurement of `rewrite_symbol` success rate across the 13 tree-sitter languages with vs. without SCIP fallback.

## risks / blockers / open questions

- O1: Does `run_file_change_hooks` expose enough structured output (lint exit code + stderr) to drive an automatic re-edit, or does it need a shape upgrade? Must read the hook-result schema before R1 design.
- O2: Is `...`-elision ambiguous in our `replace_range` hash-verified mode (where the hash covers the full range)? likely needs elision handling *before* hash compare. open design question for R2.
- O3: SCIP index availability across our target projects is unknown; R6 may be repo-by-repo opt-in.
- O4: An auto-lint re-edit loop can loop indefinitely on a persistent lint error; needs a max-retry cap per file per turn.
- O5: Whether to gate tier 1 behind per-project config (opt-in) or ship by default with a disable flag — open product question.

## Assumptions

- A1: Our existing `apply_smart_patch` fuzzy hunk match is sufficient for udiff cases; we do not need to port Aider's `udiff_coder` cascade wholesale.
- A2: Tree-sitter remains our primary AST primitive for the 13 supported languages; SCIP is a fallback only when tree-sitter symbol resolution is incomplete.
- A3: The agent's tool schema (not model-emit format) is the edit-format contract — Aider's model-specific format routing is moot.

## Checkpoint / update rules

- STATUS.md: update via `update_plan_status` when research reaches a milestone (tier 1 adoption decisions confirmed, tier 2 spike results, tier 3 deferred-with-rationale).
- LESSONS.md: append via `update_plan_status` whenever a cross-system technique is found to be already-shipped-here or out-of-scope, to avoid re-investigating.
- PLAN.md / SPEC.md: rewrite via `create_plan` only if the tier structure or scope changes materially (e.g., promoting R6 to a real execution plan with its own session slug).

## Resume guidance

Resume by reading SPEC.md + STATUS.md + LESSONS.md. If resuming from "ready to execute tier 1," spawn a separate execution plan session (e.g., `.agents/sessions/edit-tool-tier1-2026-07-*`) rather than expanding this research plan; this packet stays the recommendation-of-record.

## Artifacts

- Session: `.agents/sessions/read-edit-tool-improvements-from-aider-2026-07-06`
- SPEC.md: `.agents/sessions/read-edit-tool-improvements-from-aider-2026-07-06/SPEC.md`
- PLAN.md: `.agents/sessions/read-edit-tool-improvements-from-aider-2026-07-06/PLAN.md`
- STATUS.md: `.agents/sessions/read-edit-tool-improvements-from-aider-2026-07-06/STATUS.md`
- LESSONS.md: `.agents/sessions/read-edit-tool-improvements-from-aider-2026-07-06/LESSONS.md`