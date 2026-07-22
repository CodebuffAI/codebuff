# STATUS — Read/Edit Authorization Unification

## Current state
- **Phase:** Complete. M1-M5 are implemented and validated; no current task is active.
- **Confirmed design decision (user, 2026-07):** Unify whole-file and range read
  authorization so an edit applies regardless of which produced the authority,
  **as long as the supplied content matches current bytes** — BUT keep the
  observed-bytes safety floor: a partial/range read may authorize edits within
  what was observed and may not mint whole-file authority for content the model
  never saw. Interchangeability is about "content-correct edits apply"; it is
  NOT "a 3-line read authorizes rewriting the whole file."

## Scope (4 sub-goals from the user request)
1. **Unify authorization** — whole-file authorization and cap.v3 range
   capability become one interchangeable content-correctness check on the edit
   path, subject to the observed-bytes floor above.
2. **Mutation results show new file state** — `edit_transaction` / edit results
   echo the resulting file state (or a fresh whole-file editAnchor/content
   marker) so the model can see what it just wrote without a re-read.
3. **Fix the editor subagent** — the `status: blocked` / null-receipt pattern
   when its first transaction applied but a follow-up hit strict-read; make the
   editor return a coherent completed receipt reflecting applied changes.
4. **Remove legacy read/edit compatibility** — drop cap.v2/base64 legacy
   tokens, the legacy `{startLine,endLine,hash}` object form, and legacy
   path-keyed override normalization in favor of one uniform cap.v3 + structured
   implementation; update every dependent call site + test.

## Completed
- M1 authorization unification validated.
- M2 post-edit content and fresh capability results validated.
- M3 editor receipt reconciliation and authoritative `changedFiles` behavior validated.
- M4 cap.v3-only authorization, structured read results, and dead-tool removal validated.
- M5 documentation and full validation gates completed.

## Pending
- None.

## Blocked / needs user decision
- None currently; the one blocking design fork is resolved (observed-bytes floor kept).

## Next checkpoint
- None; the session is complete.

## Resume instructions
- None; there is no active current-task pointer. Preserve the observed-bytes floor and the completed cap.v3-only model in future work.

<!-- update_plan_status:appended -->
## M1.1 Finding — str_replace path already unifies (2026-07) — 2026-07-22T07:36:28.622Z

Ground truth after reading validateReadCapability + validateReadCapabilityAuthority in process-str-replace.ts: the str_replace authority path ALREADY treats whole-file and range capabilities uniformly. validateReadCapability re-hashes the current [startLine,endLine] slice and compares to the capability hash with NO whole-file-vs-range branch; validateReadCapabilityAuthority checks only cap.v3 scope. So M1.1's 'remove whole-file-vs-range authority branching in process-str-replace.ts' is a no-op there by design — there is no such branch to remove. The editor correctly landed a doc-comment-only change documenting the authenticity-vs-content-correctness split (typecheck green, exit 0). The remaining real M1.1 logic surface is narrower than the plan assumed: it lives only in the replace_range / process-edit-transaction.ts whole-file-sub-range path, and that path is the anti-footgun FLOOR the user chose to KEEP (option 2), so it must not be collapsed. Net: M1.1 in the str_replace path is satisfied-by-documentation; edit-transaction needs verification, not necessarily change.


<!-- update_plan_status:appended -->
## AC2 reconciliation validation — 2026-07-22T10:15:36.520Z

RF-1/5/6/10/14/15 verified in live source: reconcileFileMutationResultV1 preserves handler afterContent only when action identity and afterHash correlate with the matching receipt, and retains fresh capabilities only when their snapshot hash is a committed receipt afterHash. Common typecheck and 19 filesystem result tests passed, including `preserves hash-correlated handler content and fresh capabilities with a matching receipt`.


<!-- update_plan_status:appended -->
## M4.2 completion — dead-tool removal — 2026-07-22T14:31:56.376Z

M4.2 validated. `read_slices` and `apply_smart_patch` fully removed: common params/tool files deleted, handler files deleted, list/metadata/constants/input-aliases registrations removed, agents/types/tools.ts and template tools.ts updated, sdk/tool-execution-deadline.ts deadline map cleaned, tool-metadata test updated, structural-read test capability assertions updated to reflect scope-gated minting, docs/agents-and-tools.md sections removed, cli/codebuff-client.ts `filesystemResultFormat` removed. Full monorepo `bun run typecheck` clean; tool-metadata + structural-read + read-outline-slices + tool-reachability suites green (33/33). Next: M5.1 docs update.


<!-- update_plan_status:appended -->
## Session complete — 2026-07-22 — 2026-07-22T14:38:19.432Z

All milestones M1–M5 validated. M4.2 removed the quarantined dead tools (`read_slices`, `apply_smart_patch`) and their schemas/handlers/registrations/type surface, migrating every residual source, generated-type, test, and doc reference to the unified cap.v3 model. Final gates: full monorepo `bun run typecheck` clean; 231 agent-runtime + 57 SDK + 42 common read/edit/auth tests green; tool-metadata, tool-reachability, and structural-read suites green.

