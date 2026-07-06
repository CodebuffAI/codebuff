# LESSONS: Read/Edit tool improvements from Aider and adjacent coding agents

## Lessons discovered during this research

### L1. We already ship most of Aider's fuzzy-match cascade.
**Context:** Investigating whether to port Aider's `replace_most_similar_chunk` 5-step cascade (perfect → whitespace-flex → skip-blank → `try_dotdotdots` → Levenshtein).
**Finding:** `packages/agent-runtime/src/process-str-replace.ts` already has `tryNearMatchAutoCorrect`, `findClosestMatches` (Levenshtein), `getOccurrenceLineRanges`, and `mintAnchorForRange`. `apply-smart-patch.ts` ships `findBestHunkLineIndex` + `findBestMatchInRange` + `isAcceptableMatch` + `autoHealSyntax` + `threeWayMerge`.
**Implication:** Don't port Aider's cascade wholesale. The real gaps are elision support (R2) and the tiny-anchor multi-match refusal guard (R3), not the cascade itself.

### L2. Aider's tree-sitter usage is retrieval-only — we are already ahead on AST-anchored edits.
**Context:** Verifying whether Aider uses tree-sitter for edit application.
**Finding:** Aider's repo map (tree-sitter-based) feeds only prompt-context selection. Edit application is 100% line/text-based across all four formats (`whole`, `diff`, `udiff`, `diff-fenced`). No surveyed agent (Cursor, Cline, Continue, Cody, Claude Code, Codex CLI, Copilot Workspace, Sweep) uses AST anchoring for edit application.
**Implication:** `rewrite_symbol` (name-anchored AST edit) is genuinely novel in the surveyed landscape. Extending it cross-language is a differentiation opportunity, not a "catch-up" task.

### L3. Hash-guarded `replace_range` and atomic `edit_transaction` have no peer in the surveyed systems.
**Context:** Comparing integrity/atomicity primitives.
**Finding:** No surveyed system ships a content-hash-verified range replace or a multi-file atomic edit transaction.
**Implication:** These are strengths to preserve. New techniques (R2 elision) must interoperate with the hash guard (see open question O2) — don't break the integrity guarantee to add convenience.

### L4. The single biggest edit-success gap is the lint/test feedback loop.
**Context:** Searching for techniques that improve edit *reliability*, not just edit *application*.
**Finding:** Aider's `--auto-lint` (default true) feeds lint output back to the model and re-edits. No other surveyed agent has this loop in-core. We have `run_file_change_hooks` plumbing but no automatic re-edit on lint failure.
**Implication:** R1 (lint-feedback → re-edit) is the highest-impact adoption candidate, and it's a *workflow* change, not a *tool-primitive* change — much cheaper than porting a new edit format.

### L5. Aider's `<10-char/multi-match` refusal guard is a clean, language-agnostic safety boundary.
**Context:** Looking for deterministic guards against silent multi-site corruption.
**Finding:** `udiff_coder.directly_apply_hunk` refuses if `len(before_lines) < 10 and content.count(before) > 1`. We currently enforce multi-match uniqueness only via prose guidance.
**Implication:** Cheap to ship (R3), eliminates a known footgun, and is language-agnostic. Promote the prose rule to a code guard.

### L6. "Parity with Aider" is the wrong frame.
**Context:** Synthesizing the recommendation tiers.
**Finding:** Across the 15-finding matrix, areas where Aider leads us are narrow (lint loop, elision, tiny-anchor refusal). Areas where we lead Aider are broad (name-anchored AST edits, hash-guarded ranges, atomic multi-file transactions, tree-sitter symbol slicing).
**Implication:** Frame future work as "selective adoption of complementary techniques," not "catching up to Aider." The adoption candidates narrow to three Ship-now items, two Evaluate items, and one Defer item.

## Gotchas

- G1. The librarian agent returned `null` on three consecutive Aider clone attempts in this session. Transient infra issue — the prior-turn verbatim source quotes stand and the docs researcher corroborates them. Don't re-investigate Aider source from scratch; the ground truth is sufficient.
- G2. Don't conflate `apply_smart_patch`'s existing fuzzy hunk match with R2 (elision). They are different: `apply_smart_patch` relaxes *context*; R2 relaxes the *search anchor* via `...` elision. Both can coexist.
- G3. Open question O2 (elision vs hash guard) is a design blocker for R2 — `replace_range`'s hash covers the whole range, so elided SEARCH lines must be expanded *before* the hash compare or the hash will never match. Resolve before execution.

## Decisions made during planning

- D1. Frame this as a research-and-recommendation plan, not an implementation plan. Implementation requires its own execution session.
- D2. Defer R7 (learned apply model) despite being Cursor's flagship — the ML-infra cost is disproportionate to the marginal edit-success uplift vs. the cheaper lint-loop + elision + refusal-guard combination.
- D3. Defer R6 (SCIP-backed `rewrite_symbol` fallback) until the cross-language `rewrite_symbol` extension (prior turn) completes; R6 is a fallback layer, not a primary path.

## Follow-up notes (for the execution session that picks this up)

- F1. Before R1 execution, read `common/src/tools/params/tool/run-file-change-hooks.ts` and find the runtime consumer of its result; confirm whether exit code + stderr are surfaced to the agent loop (open question O1).
- F2. Before R2 execution, resolve open question O2 by sketching the elision-handling step relative to the hash compare in `sdk/src/tools/replace-range.ts:getRangeContentHash`.
- F3. For R4 (editor model) evaluation, use `evals/buffbench/` as the A/B harness; don't run a one-off judgment call.
- F4. The execution session should be a *separate* slug, not an expansion of this one — this packet stays the recommendation-of-record.

<!-- update_plan_status:appended -->
## R3 implementation notes — 2026-07-06T13:18:00.550Z

R3 implementation gotcha: adding a deterministic tiny-anchor multi-match guard changes existing `allowMultiple` behavior for short anchors like `foo`, `baz`, `const x`, and `dup line`. Tests that are meant to exercise generic `allowMultiple` or standard multi-match ambiguity should use non-tiny anchors (>=10 trimmed characters), while R3-specific regression tests should use deliberately tiny anchors to assert the refusal path.

Decision: keep the guard before the ordinary `allowMultiple` and multi-match branches so `allowMultiple=true` cannot override the safety boundary. `occurrenceIndex` remains the explicit escape hatch for targeted single-site edits.

Validation note: after updating tests, `cd packages/agent-runtime && bun test src/__tests__/process-str-replace.test.ts` and `cd packages/agent-runtime && bun run typecheck` both pass.

<!-- update_plan_status:appended -->
## Reviewer blocker lesson — escape hatch coverage — 2026-07-06T13:21:42.643Z

Reviewer-gate lesson: when a new safety guard recommends `occurrenceIndex` as an escape hatch, regression tests must cover both sides of the contract: the guard refuses ambiguous tiny anchors without `occurrenceIndex`, and `occurrenceIndex` still targets exactly one tiny repeated anchor. This prevents safety wording from documenting behavior that tests do not prove.

