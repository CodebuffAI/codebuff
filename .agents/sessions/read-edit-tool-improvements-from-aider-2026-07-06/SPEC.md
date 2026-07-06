# SPEC: Read/Edit tool improvements from Aider and adjacent coding agents

## Goal

Decide, with evidence, which proven read/edit techniques from Aider and adjacent coding agents (Cursor, Cline, Continue, Copilot Workspace, Claude Code, Codex CLI, Sourcegraph Cody) we should adopt to improve our existing read/edit tool surface — `read_files`, `read_outline`, `read_subtree`, `query_index`, `str_replace`, `replace_range`, `rewrite_symbol`, `edit_transaction`, `apply_patch`, `apply_smart_patch`.

This is a **research-and-recommendation** spec. The deliverable is a prioritized set of adoption candidates (Ship-now / Evaluate / Defer) with rationale, evidence, effort, risk, and touch-points — explicitly NOT an implementation. Execution happens in a separate follow-up plan.

## Goals (recommendation quality)

- G1. Every recommendation is tied to a concrete gap or improvement vs. our current surface — no novelty-for-novelty.
- G2. Each recommendation has: rationale, evidence (which system does it and how), effort estimate (S/M/L/XL), risk (S/M/H), and a concrete file/symbol touch-point in our codebase.
- G3. Recommendations are prioritized into tiers with explicit reasoning.
- G4. Output is resumable across days (STATUS, LESSONS, checkpoints).

## Non-goals

- Implementing any recommended technique (follow-up execution plan).
- Modifying any project source file (plan mode = no edits).
- Re-evaluating `rewrite_symbol` cross-language extension (covered in prior turn; this plan layers on top).
- Porting Aider's `model-settings.yml` per-model format routing (we route edit primitives via tool schemas; non-issue).

## Scope of investigation

**Internal surface (already shipped, must be understood before recommending):**
- `packages/agent-runtime/src/process-str-replace.ts` — `tryNearMatchAutoCorrect`, `findClosestMatches` (Levenshtein), `getOccurrenceLineRanges`, `mintAnchorForRange`
- `packages/agent-runtime/src/tools/handlers/tool/apply-smart-patch.ts` — `findBestHunkLineIndex`, `findBestMatchInRange`, `isAcceptableMatch`, `autoHealSyntax`, `threeWayMerge`
- `sdk/src/tools/apply-patch.ts` — `findContextCore`, `tryApplyPatchWithFallbacks`
- `sdk/src/tools/replace-range.ts` — `getRangeContentHash` (hash-guarded)
- `packages/agent-runtime/src/structural-read.ts` — `extractSlices`, `renderStructureOutline` (tree-sitter-based symbol slicing)
- `packages/agent-runtime/src/tools/handlers/tool/rewrite-symbol.ts` — name-anchored AST edit
- `common/src/tools/params/tool/run-file-change-hooks.ts` — post-edit hook plumbing
- `packages/agent-runtime/src/tools/handlers/tool/edit-transaction.ts` — atomic multi-file

**External surface (researched):**
- Aider SEARCH/REPLACE cascade (`replace_most_similar_chunk`, `try_dotdotdots`, `replace_closest_edit_distance`), udiff fuzzy apply (`apply_partial_hunk`), `<10-char/multi-match` refusal, `--auto-lint`, `--auto-test`, `editor-diff` two-model routing.
- Cursor learned edit-application model + `@symbol` partial context.
- Cline/Roo borrowed SEARCH/REPLACE + `start_line`/`end_line` partial reads.
- Continue tree-sitter outline (retrieval only).
- Sourcegraph Cody SCIP/LSIF (retrieval only).
- Claude Code / Codex CLI `str_replace` + `apply_patch` (no AST).
- Copilot Workspace / Sweep SEARCH/REPLACE (no AST, no lint loop).

## Acceptance criteria (this spec is "done" when)

- AC1. A prioritized recommendation list exists in PLAN.md with all G2 fields populated for each item.
- AC2. Each tier 1 recommendation has at least one named internal file/symbol touch-point.
- AC3. Open questions (hook schema, hash-vs-elision interaction, SCIP availability, retry cap, opt-in-vs-default) are explicitly enumerated in PLAN.md.
- AC4. Validation gates for each recommendation are defined (how we'd measure it worked).
- AC5. STATUS.md records the current research state and the next checkpoint.
- AC6. LESSONS.md records the "already-shipped-here" discoveries so we don't re-investigate.

## Relevant systems / files

See "Scope of investigation" above.

## Constraints

- C1. Plan mode: no project source edits.
- C2. Recommendations must not depend on rewriting our tool schema (the agent's tool-call contract is the edit format).
- C3. Tier 1 items must fit within the existing `run_file_change_hooks` or `process-str-replace` architecture without a new subsystem.

## Risks to the spec itself

- S1. Mis-identifying a gap as novel when we already ship it (mitigated: outlines of `apply-smart-patch.ts` and `process-str-replace.ts` already confirm several techniques are present).
- S2. Recommending a technique that conflicts with our hash-guarded `replace_range` (mitigated: O2 in PLAN.md calls out the elision-vs-hash design question).
- S3. Librarian clone failures prevented the third Aider source pass; some Aider-side claims rest on the docs researcher + prior-turn verbatim source. Confidence is still high because the docs researcher corroborated the prior-turn source quotes.