# PLAN: Upstream beneficial-change audit for the BYOK local-only fork

## Context recap

- `origin` = AnzoBenjamin/openbuff (fork), `upstream` = CodebuffAI/codebuff.
- Fork is **143 ahead / 555 behind** upstream (deep re-audit, 2026-07-05). Upstream squashes all history into "Sync public snapshot from freebuff-private" → analysis must be tree-diff + actual-file-content based, not commit-history based.
- Fork posture: local-first, BYOK, no backend, no credits, no hosted auth, no telemetry shipper. `OPENBUFF_*` / `openbuff.json` primary; `CODEBUFF_*` only narrow compat aliases.

## HARD CONSTRAINT (verified by deep re-audit, 2026-07-05)

The fork has ZERO freebuff symbols. Verified by reading HEAD file contents:

- HEAD `agents/base2/base2.ts` does NOT import `FREEBUFF_*`, `canFreebuffModelSpawnGeminiThinker`, or `FREEBUFF_REVIEWER_AGENT_ID_BY_MODEL`.
- Upstream `agents/base2/base2.ts` lines 4–15 DO import `FREEBUFF_GEMINI_THINKER_*` (from `freebuff-gemini-thinker`), `FREEBUFF_REVIEWER_AGENT_ID_BY_MODEL` (from `free-agents`), and `FREEBUFF_KIMI_MODEL_ID`/`FREEBUFF_MINIMAX_MODEL_ID`/`FREEBUFF_MINIMAX_M3_MODEL_ID` (from `freebuff-models`).
- None of `freebuff-models.ts`, `free-agents.ts`, `freebuff-gemini-thinker.ts` exist on HEAD. No `*freebuff*` files anywhere. No `IS_FREEBUFF` refs in `cli/`.

**Consequence: any upstream change whose import graph touches freebuff will not compile on this tree.** Those are missing symbols, not "hosted surface to skip." Every port must be freebuff-graph-free or explicitly stubbed before applying the diff. base2 + CLI ports require hand-merge, never cherry-pick.

## HEAD already-ported corrections (found in deep re-audit)

Prior table over-counted "PORT" entries. These are already present on HEAD and need NO work:

- `cli/src/utils/chat-input-key-intercept.ts` — present on HEAD (was verdict #11).
- `cli/src/utils/terminal-enter-detection.ts` — present on HEAD.
- `common/src/tools/params/tool/gravity-index.ts` — present on HEAD (only the params-text diff in #6 remains; the file itself exists).
- `common/src/tools/params/tool/web-search.ts` — present on HEAD (only the backend swap + description string in #7 remains).

## Verdict table — upstream change → disposition for BYOK fork

| # | Upstream change (file/symbol) | Category | Disposition | Rationale |
|---|---|---|---|---|
| 1 | `common/src/constants/model-config.ts`: add `mimoModels`, `minimaxModels`, `moonshotModels` registries + types; add `'minimax'`,`'mimo'` to `ALLOWED_MODEL_PREFIXES`; add `providerDomains.minimax`/`.mimo`; add `supportsAssistantPrefill(model)`. **Drop upstream's `'free'` prefix** (hosted-only). | Model config | **PORT** | Self-contained in `model-config.ts`. Upstream split these OUT of `freebuff-models.ts` deliberately so they're portable. `supportsAssistantPrefill` is required by M1's runtime guard. |
| 2 | `model-config.ts`: `openrouter_gpt5` `gpt-5.5 → gpt-5.1`, `openrouter_gpt5_chat` `gpt-5.2-chat-latest → gpt-5.1-chat` | Model config | **SKIP** | Upstream rollback for their hosted load. BYOK users pick their own model. Keep HEAD (5.5). |
| 3 | `agents/base2/base2.ts`: default model `4.7 → 4.8`; `noReview` option; enable `read_url`/`gravity_index`/`render_ui`; Composio gated spawn; system-prompt refresh incl. `PLACEHOLDER.CURRENT_DATE` (already on HEAD). | Agent core | **PORT (heavily reduced)** | Only slices that do NOT import `FREEBUFF_*`, `canFreebuffModelSpawnGeminiThinker`, `FREEBUFF_REVIEWER_AGENT_ID_BY_MODEL`, `freebuff-gemini-thinker`. Concretely: default model bump to `4.8`, `noReview` plumbing, the three new tool names in the tool list, system-prompt improvements. **Reject every hunk referencing freebuff model IDs, freebuff Gemini thinker, reviewer-by-model maps, or the `'free'`/`'lite'`/`'max'` modes.** HEAD factory already diverges (`mode: 'default' | 'fast'`, not upstream's 5-mode union) → hand-merge the tool list, do not cherry-pick. |
| 4 | New tool `read_url` (params, `ToolName`/`ToolParamsMap`, registry wiring, handler) | Tools | **PORT** | Pure client-side fetch + readability extraction (`requestClientToolCall`). BYOK-safe + freebuff-free. Fully absent on HEAD. |
| 5 | New tool family `composio_*` (params, `COMPOSIO_META_TOOL_NAMES`, handler, base2 gated spawn). Upstream's `composio.ts` lives under `common/src/constants/` + `common/src/tools/params/tool/`. | Tools | **ADAPT (opt-in)** | Keep `ENABLE_COMPOSIO_TOOLS = false` default. Port scaffolding only after auditing its import graph is freebuff-free; if it isn't, defer entirely (Q3 — defer until a user asks is the safe default). |
| 6 | `gravity_index` params: `conversion_url` → `credential_request.setup_url` / `click_url`; `install.steps` + `install.env_vars`; `required_env_vars` discovery flow. File already on HEAD. | Tools | **PORT (text only)** | Backend-independent contract update. Just the params-text diff; verify local `gravity_index` handler signature matches. |
| 7 | `web_search`: Linkup → Serper backend swap (`llm-api/serper-api.ts` + `codebuff-web-api.ts`, response shape richer SERP fields, description string "Linkup → Serper"). File already on HEAD. | Tools | **ADAPT or SKIP** | BYOK users may not have a Serper key. Paths: (a) port Serper env-gated with Linkup fallback (more work) or (b) SKIP and keep Linkup. **Decision Q1.** The description-string swap alone is freebuff-free and applies selectively. |
| 8 | `supportsAssistantPrefill` runtime guard in `run-agent-step.ts` + `toTokenCountInputSchema()` + `clearProgrammaticRunState` + `FETCH_IDLE_TIMEOUT_USER_MESSAGE` + `TRANSIENT_NETWORK_ERROR_USER_MESSAGE` | Runtime correctness | **PORT** | Highest-value port. HEAD only mentions `count_tokens` in a *comment* (line 1112); upstream has the real `toTokenCountInputSchema()` (line 96), `supportsAssistantPrefill(model)` guard (line 323), `clearProgrammaticRunState`, network-error UX. Unblocks BYOK Anthropic Claude 4.6+ (opus-4.8, Fable via Bedrock) continuation steps. Freebuff-free. All ride together. |
| 9 | `run-agent-step.ts` / `run-programmatic-step.ts`: `TraceWriter` plumbing. **Drop `isFreeMode` import** (freebuff concept, won't resolve). | Runtime robustness | **PORT (adapt)** | Keep `TraceWriter`; drop freebuff refs. Network-error UX already folded into #8. |
| 10 | CLI: `terminal-watchdog.ts` + `terminal-reset-sequences.ts` | CLI robustness | **PORT** | Freebuff-free, self-contained, high value for `bun run dev` / direct-binary runs. Confirmed absent on HEAD. (Verified content: detached `/bin/sh` + `cat` holding until parent death, then writes reset sequences to inherited tty fd.) |
| 11 | CLI: `chat-input-key-intercept.ts` + `terminal-enter-detection.ts` | CLI robustness | **ALREADY PORTED** | Confirmed present on HEAD in the deep re-audit. No work. |
| 12 | CLI: `write-file-atomic.ts` + `chat-meta.ts` sidecar | CLI robustness | **PORT** | Freebuff-free; direct fit for a local-first fork that stores chats locally. Confirmed absent on HEAD. (Verified content: `writeFileAtomic` writes temp + rename; `chatMetaSchema` binds sidecar to exact messages size+mtime.) Prune any `IS_FREEBUFF` branch upstream added in the same files. |
| 13 | CLI: `copy-conversation.ts` `/copy` + OSC52 truncation under SSH | CLI feature | **PORT (adapt)** | Upstream `copy-conversation.ts` imports `IS_FREEBUFF` from `../utils/constants` — stub that import (no freebuff constant here). OSC52 truncation logic itself is freebuff-free. |
| 14 | CLI: `cli-args.ts` Commander refactor | CLI refactor | **ADAPT (selective)** | Upstream `cli-args.ts` branches on `IS_FREEBUFF`. Port the `else` branch only, prune the freebuff branch, drop `IS_FREEBUFF` import. **Decision Q2** (verify fork's current arg-parsing shape). |
| 15 | `freebuff-models.ts`, `freebuff-referral-tiers.ts`, `freebuff-streak.ts`, `freebuff-session-display.ts`, `freebuff-referral-cache.ts`, `freebuff-streak-line.ts`, `engagement.ts`, `freebuff-landing-screen.tsx`, `freebuff-referral-banner.tsx`, `ad-banner.tsx`, `freebuff-active-session-summary.tsx`, `use-freebuff-streak-query.ts`, `freebuff-landing-focus-store.ts`, `freebuff-exit.ts`, `freebuff-premium-reset.ts`, `fetch-usage.ts`, `anonymous-id.ts` | Hosted / engagement / ads / telemetry | **SKIP** (and **STUB** if any ported file transitively imports one) | Absent from this instance, not merely disabled. Any ported file importing them won't compile. |
| 16 | `agents/base2/base2-free-*.ts`, `base2-max.ts`, `base2-lite.ts`, `base2-mimo.ts`, `base2-kimi-2-7-code.ts`, `base2-gemini-evals.ts`; `agents/reviewer/code-reviewer-{glm,mimo,minimax}-*.ts` | Agent variants | **SKIP** | freebuff model-picker variants. BYOK users select models via `openbuff.json`, not agent variants. |
| 17 | `sdk/src/composio.ts` (upstream) | SDK | **ADAPT (opt-in, gated)** | Mirrors #5. Port only if freebuff-graph clean and `ENABLE_COMPOSIO_TOOLS = false` preserved. |
| 18 | `freebuff/`, `web/`, `.github/workflows/*`, `reddit-capi`, BigQuery/log-schema growth, release-bundle auth rewires | Hosted / infra | **SKIP** | Out of posture; would not compile here. |

## Milestones (M1–M6), ordered by value/risk

### M1 — Runtime correctness (HIGHEST VALUE, freebuff-free)
- **Scope:** `packages/agent-runtime/src/run-agent-step.ts` (+ `run-programmatic-step.ts` for `clearProgrammaticRunState`/`TraceWriter`).
- **Tasks:**
  - Port upstream's `toTokenCountInputSchema()` (line 96) + the `supportsAssistantPrefill(model)` guard (line 323).
  - Port `clearProgrammaticRunState`, `FETCH_IDLE_TIMEOUT_USER_MESSAGE`, `TRANSIENT_NETWORK_ERROR_USER_MESSAGE`.
  - Add `supportsAssistantPrefill` export to `common/src/constants/model-config.ts` (depends on #1's model-config refresh — do model-config first or together).
  - **Drop** `isFreeMode` and any `FREEBUFF_*` import; keep `TraceWriter`.
- **Validation:** `bun --cwd packages/agent-runtime run test`; targeted `run-agent-step-preflight.test.ts` + `to-token-count-input-schema.test.ts` to port; `bun run typecheck` across the workspace; freebuff-grep must be zero new hits.

### M2 — New `read_url` tool end-to-end
- **Scope:** `common/src/tools/params/tool/read-url.ts`, `common/src/tools/list.ts`, `common/src/tools/constants.ts`, `agents/types/tools.ts`, `common/src/templates/initial-agents-dir/types/tools.ts`, `packages/agent-runtime/src/tools/handlers/tool/read-url.ts`, `common/src/tools/compile-tool-definitions.ts`.
- **Tasks:** Port the params file, register the tool in `toolParams` and the `ToolName` union / `ToolParamsMap`, port the handler, rewire `compile-tool-definitions`. Verify the client-side handler shape (`requestClientToolCall`) matches fork's runtime contract.
- **Validation:** `bun --cwd common run test`; `bun --cwd packages/agent-runtime run test`; typecheck; freebuff-grep zero.

### M3 — Model registry refresh + base2 (reduced)
- **Scope:** `common/src/constants/model-config.ts` (mimo/minimax/moonshot + `supportsAssistantPrefill` + `providerDomains`); `agents/base2/base2.ts` (default 4.7→4.8, `noReview`, enable `read_url`/`gravity_index`/`render_ui`, system-prompt refresh). Optionally `agents/base2/quality-prompt-section.ts`.
- **Tasks:**
  - Add `mimoModels`/`minimaxModels`/`moonshotModels` + types; add `'minimax'`,`'mimo'` to `ALLOWED_MODEL_PREFIXES`; add `providerDomains.minimax`/`.mimo`; add `supportsAssistantPrefill`. **Drop `'free'` prefix.**
  - Hand-merge base2: bump default to `anthropic/claude-opus-4.8`, add `noReview` to the options, add the three tool names to `toolNames`, refresh system-prompt sections. **Reject every hunk referencing freebuff model IDs, freebuff Gemini thinker, reviewer-by-model map, or `'free'`/`'lite'`/`'max'` modes.**
- **Validation:** `bun --cwd agents run test` (`base2.test.ts` regression net); `bun run typecheck`; freebuff-grep zero new hits in `cli agents common packages`.

### M4 — CLI robustness utilities
- **Scope:** `cli/src/utils/{terminal-watchdog,terminal-reset-sequences,write-file-atomic,chat-meta}.ts`; `cli/src/commands/copy-conversation.ts` + OSC52 truncation.
- **Tasks:**
  - Port `terminal-watchdog.ts` + `terminal-reset-sequences.ts` (detached sh + cat + reset-on-death).
  - Port `write-file-atomic.ts` + `chat-meta.ts` sidecar; rewire wherever chat-messages writes happen to use atomic write + sidecar refresh.
  - Port `/copy` command + OSC52 truncation; **stub the `IS_FREEBUFF` import in `copy-conversation.ts`** (no freebuff constant on this instance — prune the branch, keep the OSC52 logic).
- **Validation:** `bun --cwd cli run test` + typecheck; acceptance: `kill -9` a dev CLI session and confirm the terminal resets (watchdog). freebuff-grep zero.

### M5 — Selective CLI UI + `cli-args.ts` (Q2-gated)
- **Scope:** `cli/src/cli-args.ts`; selected `cli/src/components/*` (if a per-file freebuff-import audit is clean).
- **Tasks:** Port the `else` branch of upstream's `cli-args.ts`, prune the freebuff branch, drop `IS_FREEBUFF` import. For any CLI component port, first run `git show upstream/main:<path> | grep -iE 'freebuff|IS_FREEBUFF|freebuff-session|use-freebuff-session'`; if clean, proceed; else defer.
- **Validation:** `bun --cwd cli run test` + typecheck; freebuff-grep zero.

### M6 — `gravity_index` contract refresh + `web_search` Serper swap (Q1-gated)
- **Scope:** `common/src/tools/params/tool/gravity-index.ts` (text diff only — file already on HEAD); `packages/agent-runtime/src/llm-api/serper-api.ts` + `codebuff-web-api.ts`; `common/src/tools/params/tool/web-search.ts` description string + handler.
- **Tasks:**
  - Apply the gravity-index params-text diff (`conversion_url` → `credential_request.setup_url`/`click_url`, `install.steps`/`install.env_vars`, `required_env_vars`); verify the handler signature matches.
  - On Q1 = "port Serper env-gated w/ Linkup fallback": add `serper-api.ts` + `codebuff-web-api.ts`, env-gate on `SERPER_API_KEY`, keep Linkup path. On Q1 = "skip": apply only the description-string swap and keep Linkup.
- **Validation:** `bun --cwd common run test`; `bun --cwd packages/agent-runtime run test`; typecheck; freebuff-grep zero.

## Open questions (need user decision before M5/M6)

- ❓ **Q1:** `web_search` backend — port Serper env-gated w/ Linkup fallback, or keep Linkup and skip the Serper swap?
- ❓ **Q2:** Is the fork's current arg parsing already Commander-based (affects M5 scope)?
- ❓ **Q3:** Port Composio scaffolding now (opt-in, `ENABLE_COMPOSIO_TOOLS = false`) or defer until a user asks?

## Validation gates (every milestone)

1. `bun run typecheck` across the workspace (or per-package).
2. `bun --cwd <pkg> run test` for every touched package.
3. `grep -iE 'freebuff|IS_FREEBUFF' --include='*.ts' --include='*.tsx' cli agents common packages sdk` → zero new hits vs pre-milestone baseline.
4. For M1: targeted preflight + token-count schema tests. For M3: `base2.test.ts` regression. For M4: `kill -9` terminal-watchdog acceptance.

## Checkpoint / update rules

- After each completed milestone: `update_plan_status` to mark the tasks `done`, set `currentTask` to the next milestone, and record any new gotchas in LESSONS.md.
- If a port attempt reveals a hidden freebuff transitive import: `update_plan_status` with a LESSONS entry and reclassify the verdict (STUB-REQUIRED or SKIP).
- If upstream advances: `git fetch upstream && git rev-list --count HEAD..upstream/main && git rev-list --count upstream/main..HEAD`; re-run the verdict-table diff for the changed subsystems only.
- SPEC.md / PLAN.md changes go through `create_plan` (substantial rewrites). STATUS.md / LESSONS.md incremental updates go through `update_plan_status`.