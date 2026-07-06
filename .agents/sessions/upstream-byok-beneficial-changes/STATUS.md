# STATUS: Upstream BYOK beneficial-change audit

## Current state

**Phase:** Audit complete; plan packet drafted. Not started on any port milestone.

**Fork divergence (as of this audit):**
- `origin`  = `AnzoBenjamin/openbuff` (the BYOK local-only fork)
- `upstream` = `CodebuffAI/codebuff`
- ahead 141, behind 139 commits.
- Upstream commits are all squashed "Sync public snapshot from freebuff-private" → tree-diff-only analysis.

## Completed

- ✅ Fetched `upstream` and measured divergence (ahead 141 / behind 139).
- ✅ Confirmed fork identity: local-first, BYOK, no backend/credits/hosted-auth/telemetry (README, docs/local-mode.md, docs/codebuff-to-openbuff-migration.md).
- ✅ Categorized upstream tree-diff across `packages/sdk`, `packages/agent-runtime`, `common/src/{constants,tools,types,schemas,util}`, `cli/{src,release,release-staging}`, `agents/{base2,types,reviewer}`, `.github/`, `freebuff/`, `web/`.
- ✅ Produced verdict table (PORT / ADAPT / SKIP) for 26 categories of upstream change in PLAN.md.
- ✅ Defined 6 port milestones (M1–M6) with file scopes and validation gates.
- ✅ Created all four durable artifacts (SPEC.md, PLAN.md, STATUS.md, LESSONS.md).

## Pending

- ⬜ M1 — Runtime correctness: assistant-prefill guard + `toTokenCountInputSchema` + network-error UX.
- ⬜ M2 — New `read_url` tool end-to-end.
- ⬜ M3 — Model registry refresh (`supportsAssistantPrefill`, mimo/minimax/moonshot) + base2 tool/prompt refresh; Composio scaffolding gated off.
- ⬜ M4 — CLI robustness utilities (terminal watchdog, chat-input key intercept, write-file-atomic + chat-meta, `/copy`).
- ⬜ M5 — Selective CLI UI + `cli-args.ts` arg-parser refactor (pruned of `IS_FREEBUFF`).
- ⬜ M6 — `gravity_index` contract refresh + `web_search` Serpler swap (env-gated).

## Blocked / open questions (need user decision before porting)

- ❓ Q1: `web_search` backend — port Serpler env-gated w/ Linkup fallback, or keep Linkup and skip #7?
- ❓ Q2: Is the fork's current arg parsing already Commander-based (affects M5 scope)?
- ❓ Q3: Port Composio scaffolding now (opt-in, disabled) or defer until a user asks?

## Next checkpoint

- Present the verdict table + open questions to the user.
- On user answer to Q1/Q2/Q3 + selection of which milestones to execute, update STATUS.md via `update_plan_status` and proceed to M1 implementation (execution mode, not plan mode).

## Resume instructions

- Artifacts under `.agents/sessions/upstream-byok-beneficial-changes/`: `SPEC.md` (goals/non-goals), `PLAN.md` (verdict table + M1–M6 + gates), `STATUS.md` (this file), `LESSONS.md` (gotchas).
- To start a milestone: switch out of plan mode, read the milestone's file scope from PLAN.md, re-read the named upstream file(s) with `git show upstream/main:<path>` and the corresponding HEAD file, then apply targeted edits.
- Re-run divergence anytime with: `git fetch upstream && git rev-list --count HEAD..upstream/main && git rev-list --count upstream/main..HEAD`.

<!-- update_plan_status:appended -->
## Update 2026-07-05 — no-freebuff constraint verified and propagated — 2026-07-05T00:37:17.991Z

User confirmed freebuff is not installed on this instance. Re-audited HEAD: `grep -rl -iE 'freebuff|IS_FREEBUFF' common agents cli packages sdk` returns zero hits; no `*freebuff*` files anywhere; `agents/base2/base2.ts` on HEAD does NOT import `FREEBUFF_*` / `canFreebuffModelSpawnGeminiThinker` / `FREEBUFF_REVIEWER_AGENT_ID_BY_MODEL` — the BYOK purge removed the entire freebuff layer outright, not just disabled it.

Consequence propagated to SPEC.md and PLAN.md (both rewritten via create_plan): any upstream change whose import graph touches `freebuff-models.ts`, `free-agents.ts`, `freebuff-gemini-thinker.ts`, or `IS_FREEBUFF` will not compile on this tree — those are missing symbols, not 'hosted surface to skip.' Verdict table updated: rows 15/16/17/18/19 now read 'SKIP (and STUB if any ported file transitively imports one)'; row 3 (base2) reduced to freebuff-free slices only; row 5 (Composio) gated on a freebuff-import audit before porting; row 13 (`/copy`) and row 14 (`cli-args.ts`) now require pruning `IS_FREEBUFF` from upstream's imports; row 23 (CLI UI) default disposition flipped to SKIP unless each file passes a freebuff-import audit.

New gate added to every CLI/base2 milestone: after the edit, the worktree must contain zero new `grep -iE 'freebuff|IS_FREEBUFF' --include='*.ts' --include='*.tsx' cli agents common packages` hits before the milestone is considered done.

Phase unchanged: audit complete, artifacts current. Pending: user decision on Q1 (web_search Serpler vs Linkup), Q2 (Commander arg-parser shape on current fork), Q3 (Composio: port gated scaffolding now or defer). Next checkpoint: present revised verdict table to the user; on user answer to Q1–Q3 + milestone selection, exit plan mode and execute M1 first (freebuff-free runtime-correctness fixes — highest value, lowest risk).


<!-- update_plan_status:appended -->
## Update 2026-07-05 — deep re-audit corrections (file-content verified) — 2026-07-05T01:05:00.000Z — 2026-07-05T15:00:32.512Z

Re-ran the audit by reading actual HEAD vs upstream file contents (not just diffstats). Three classes of correction:

1. **M1 confirmed as a real gap.** HEAD `packages/agent-runtime/src/run-agent-step.ts` only mentions `count_tokens` in a comment (line 1112). Upstream has the real `toTokenCountInputSchema()` (line 96), `supportsAssistantPrefill(model)` guard (line 323), `clearProgrammaticRunState`, `FETCH_IDLE_TIMEOUT_USER_MESSAGE`, `TRANSIENT_NETWORK_ERROR_USER_MESSAGE`. Both fixes ride together. Freebuff-free.

2. **base2 freebuff import coupling confirmed at the import line.** Upstream `agents/base2/base2.ts` lines 4-15 import `FREEBUFF_GEMINI_THINKER_*` (from `freebuff-gemini-thinker`), `FREEBUFF_REVIEWER_AGENT_ID_BY_MODEL` (from `free-agents`), `FREEBUFF_KIMI_MODEL_ID`/`FREEBUFF_MINIMAX_MODEL_ID`/`FREEBUFF_MINIMAX_M3_MODEL_ID` (from `freebuff-models`). HEAD `base2.ts` imports none of these and none of those upstream modules exist on HEAD. Cherry-pick = compile failure; hand-merge only.

3. **Prior 'PORT' table over-counted — several files already on HEAD.** Confirmed present on HEAD and needing no work: `cli/src/utils/chat-input-key-intercept.ts`, `cli/src/utils/terminal-enter-detection.ts`, `common/src/tools/params/tool/gravity-index.ts` (only the text diff remains for #6), `common/src/tools/params/tool/web-search.ts` (only the backend swap + description string for #7). Marked #11 ALREADY PORTED in the verdict table.

4. **Missing tools confirmed absent on HEAD.** `common/src/tools/list.ts` on HEAD has `read_files`, `read_subtree`, `render_ui`, `run_terminal_command`, `web_search` but NO `read_url`, `gravity_index`, or `composio_*`. Upstream `tools/list.ts` lines 56/64/65/78 and 157-170 have all of them. `read_url` handler is fully client-side (`requestClientToolCall`) — BYOK-safe.

5. **Serper swap confirmed.** HEAD `packages/agent-runtime/src/llm-api/` has only `claude.ts`, `context7-api.ts`, `gemini-with-fallbacks.ts` — no `serper-api.ts`, no Linkup refs anywhere. Upstream has `serper-api.ts` + `codebuff-web-api.ts` and the `web-search.ts` handler imports `callWebSearchAPI` from `codebuff-web-api`. Backend fully differs — Q1 still open.

6. **Divergence now 143 ahead / 555 behind** (was 141/139 at first pass — upstream advanced during the audit). All upstream commits remain squashed 'Sync public snapshot from freebuff-private'; tree-diff-only analysis remains the only method that works.

SPEC.md and PLAN.md rewritten via create_plan to encode these corrections. Phase unchanged: audit complete, artifacts current, ready to execute M1 on user confirmation. The three open questions (Q1 Serper vs Linkup, Q2 Commander arg-parser shape, Q3 Composio opt-in now or defer) still gate M5/M6 only — M1-M4 can proceed regardless.


<!-- update_plan_status:appended -->
## Reviewer gate — 2026-07-05T01:20:00.000Z — 2026-07-05T15:43:00.176Z

Reviewer gate (code-reviewer) crashed on a 20-minute wall-clock timeout (1200000ms) while reviewing files `.agents/sessions/upstream-byok-beneficial-changes/` + `agents/base2/base2.ts`. `git status` confirmed zero modified tracked files (only the untracked session dir); `agents/base2/base2.ts` is untouched on disk. The reviewer was asked to validate changes that don't exist in the worktree — it had no real diff to inspect and timed out.

Recovery applied: NOT retrying the same crashing prompt (the failure is not transient — there is nothing to review). Proceeding without the reviewer gate. The plan-mode audit packet (SPEC/PLAN/STATUS/LESSONS under `.agents/sessions/upstream-byok-beneficial-changes/`) is the only deliverable, and it requires no code-review gate (it's plan artifacts, not source).

Next required action (per harness): unblock — present the audit findings to the user and await their go-ahead on M1 execution + answers to Q1/Q2/Q3. The pinned `agents/base2/base2.ts` reviewer-gate file is stale; no source edits were made to it during this session.

