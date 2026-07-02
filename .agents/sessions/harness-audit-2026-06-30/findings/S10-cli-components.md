# Shard S10 — CLI components & screens

**Auditor:** harness-audit-2026-06-30 / S10
**Scope:** `cli/src/components/**`, focused on `status-bar`, `command-palette-screen`, `review-screen`, `plan-session-picker-screen`, `model-route-picker`, `provider-picker-screen`, `chat-input-bar`, `message-block`, `message-with-agents`, `chat-history-screen`, `prompt-history-search-screen`, `agent-checklist`, `validation-error-popover`, `error-boundary`, `bottom-banner`, and `top-banner`.
**Files inspected (line counts):**
- `cli/src/components/status-bar.tsx` (280)
- `cli/src/components/command-palette-screen.tsx` (365)
- `cli/src/components/review-screen.tsx` (115)
- `cli/src/components/plan-session-picker-screen.tsx` (320)
- `cli/src/components/model-route-picker.tsx` (783)
- `cli/src/components/provider-picker-screen.tsx` (631)
- `cli/src/components/chat-input-bar.tsx` (458)
- `cli/src/components/message-block.tsx` (376)
- `cli/src/components/message-with-agents.tsx` (521)
- `cli/src/components/chat-history-screen.tsx` (410)
- `cli/src/components/prompt-history-search-screen.tsx` (285)
- `cli/src/components/agent-checklist.tsx` (350)
- `cli/src/components/validation-error-popover.tsx` (192)
- `cli/src/components/error-boundary.tsx` (55)
- `cli/src/components/bottom-banner.tsx` (136)
- `cli/src/components/top-banner.tsx` (177)
- Shared helpers sampled: `multiline-input.tsx` (1239), `selectable-list.tsx` (248), `button.tsx` (66), `suggestion-menu.tsx` (207), `message-footer.tsx` (246), `shimmer-text.tsx` (248), `scroll-to-bottom-button.tsx` (35), `terminal-link.tsx` (98), `cli/src/hooks/use-searchable-list.ts` (98)

## Audit Domains Covered
1. Accessibility semantics / ARIA-like labeling for TUI controls
2. Keyboard focus order and focus visibility
3. Keyboard/mouse parity for interactive controls
4. Responsive layout / small terminal behavior
5. Color-only or color-dominant state signaling
6. Render performance / large-list and streaming re-render cost
7. Timers, intervals, and async cleanup
8. Error containment / resilience of UI rendering

---

## Findings

### S10-F01 — `ErrorBoundary` is explicitly a passthrough, but consumers treat it like a real render boundary
**Severity:** High
**Domain:** 8 (error containment), 6 (render performance blast radius)
**Files:**
- `cli/src/components/error-boundary.tsx` lines 10–31, 37–54
- `cli/src/components/message-with-agents.tsx` lines 70–85

**Observation.** `ErrorBoundaryPlaceholder` documents that it “does NOT catch render errors” and simply returns `children`. The deprecated alias `ErrorBoundary` points at that placeholder. `MessageWithAgents` wraps `AgentChildrenGrid` in `<ErrorBoundary fallback={...}>`, which visually suggests child-agent render failures are contained, but any exception thrown during `GridLayout`, `MessageWithAgents`, or nested message rendering will still bubble out of the subtree.

**Impact.** A malformed tool block, markdown edge case, bad attachment, or deeply nested agent message can still take down the entire chat render. The fallback text in `message-with-agents.tsx` is dead UI in the React-boundary sense, so the component has a false sense of resilience.

**Recommendation.** Rename the placeholder to avoid “Boundary” semantics at call sites, and wrap known-risk render functions with `withErrorFallback()` at the actual risky expression boundaries. For agent trees, catch per child/group so one bad agent card does not blank the whole conversation.

---

### S10-F02 — Cross-cutting controls lack semantic labels/roles and keyboard-discoverable names
**Severity:** Medium-High
**Domain:** 1 (a11y semantics), 2 (focus order), 3 (keyboard/mouse parity)
**Files:**
- `cli/src/components/button.tsx` lines 9–20, 48–65
- `cli/src/components/selectable-list.tsx` lines 137–190
- `cli/src/components/bottom-banner.tsx` lines 119–133
- `cli/src/components/top-banner.tsx` lines 168–170
- `cli/src/components/message-block.tsx` lines 217–231, 352–370
- `cli/src/components/validation-error-popover.tsx` lines 42–69, 162–184

**Observation.** `Button` is implemented as a `<box>` with mouse handlers and unselectable text, but has no role, accessible name, `aria-*`, focusability, disabled state, or keyboard activation contract. Higher-level controls inherit that limitation: close buttons render as `x`/`[x]`, validation errors render as `[!]`, delete actions render as `[×]`, and edit renders as `[✎ edit]` without a semantic label or alternate activation path.

**Impact.** Users who cannot use mouse interaction in the terminal have no consistent way to reach many controls. Assistive tooling or automated accessibility checks cannot distinguish “button”, “link”, “delete”, “close”, or “report issue” intent. This particularly affects transient controls such as validation-popover close/report, banner close, scroll-to-bottom, message edit, and chat-history delete.

**Recommendation.** Extend the shared `Button`/`Clickable` primitive with an explicit `label`/`ariaLabel`/`role` equivalent supported by OpenTUI (or a project-local metadata convention if OpenTUI lacks ARIA), and document keyboard activation. For icon-only controls, include visible text or a non-color textual label such as `Close banner`, `Show validation errors`, `Delete chat`, and `Edit and resend`.

---

### S10-F03 — Many mouse-visible controls are not keyboard reachable; focus order is split between hidden global handlers and clickable boxes
**Severity:** High
**Domain:** 2 (focus order), 3 (keyboard/mouse parity), 1 (a11y semantics)
**Files:**
- `cli/src/components/button.tsx` lines 48–65
- `cli/src/components/chat-history-screen.tsx` lines 319–326, 373–404
- `cli/src/components/model-route-picker.tsx` lines 650–657, 737–744, 768–779
- `cli/src/components/validation-error-popover.tsx` lines 55–69, 162–184
- `cli/src/components/top-banner.tsx` lines 168–170
- `cli/src/components/bottom-banner.tsx` lines 119–133

**Observation.** Screens often provide keyboard navigation for the primary list via `MultilineInput` intercepts or `useKeyboard`, while secondary actions are only `<Button>` mouse targets. Examples: chat history’s `[×]` delete action is clickable but not reachable through Up/Down/Enter; model route picker’s visible list rows are rendered by `SelectableList` with `onSelect={() => {}}`, so clicking a row does not perform the same action as pressing Enter; top/bottom banner close buttons and validation-popover close/report buttons are mouse-only.

**Impact.** The visible focus order does not match the operable focus order. A keyboard user can select some primary rows, but cannot discover or invoke many adjacent controls, creating a two-class UI where mouse users see more functionality than keyboard users.

**Recommendation.** Define a per-screen tab/focus model or keep all secondary actions in documented keyboard shortcuts. At minimum: add Delete/Backspace for chat-history deletion with confirmation/undo; make `SelectableList.onSelect` in model-route-picker mirror Enter behavior; provide Esc/shortcut handling for popover/banner close actions; and expose these shortcuts in footer help text.

---

### S10-F04 — Selectable list focus is primarily color/background based and hover can steal keyboard focus
**Severity:** Medium
**Domain:** 2 (focus visibility), 5 (color-only signal), 3 (keyboard/mouse parity)
**Files:**
- `cli/src/components/selectable-list.tsx` lines 107–114, 147–159, 161–190
- `cli/src/components/command-palette-screen.tsx` lines 334–354
- `cli/src/components/plan-session-picker-screen.tsx` lines 249–270
- `cli/src/components/chat-history-screen.tsx` lines 303–326
- `cli/src/components/prompt-history-search-screen.tsx` lines 255–276

**Observation.** `SelectableList` indicates the current row via `backgroundColor`, foreground color, and bolding. It does not add a universal non-color cursor marker (`›`, `❯`, `*`, etc.) for ordinary rows. It also calls `onFocusChange(idx)` on `onMouseOver`, so incidental mouse movement over the terminal changes the same `focusedIndex` that keyboard Enter uses.

**Impact.** Users with low contrast themes, color blindness, screen recordings, or monochrome terminals can lose the active row. Pointer movement can unexpectedly change the row submitted by Enter, which is especially risky in destructive contexts like chat deletion or model/provider configuration.

**Recommendation.** Render a persistent textual focus marker for the focused row independent of color, and keep hover state separate from keyboard focus unless the user clicks or explicitly moves focus. If hover should focus, consider a short debounce or a “hover preview” state that Enter does not consume.

---

### S10-F05 — Small-terminal width calculations can go negative or force unusable panes
**Severity:** Medium-High
**Domain:** 4 (responsive layout), 2 (focus order)
**Files:**
- `cli/src/components/command-palette-screen.tsx` lines 253–268, 279–289, 334–344
- `cli/src/components/prompt-history-search-screen.tsx` lines 173–188, 199–209, 255–265
- `cli/src/components/plan-session-picker-screen.tsx` lines 43–48, 179–183, 229–237
- `cli/src/components/chat-history-screen.tsx` lines 40–43, 227–233, 281–290
- `cli/src/components/model-route-picker.tsx` lines 592–603, 658–663

**Observation.** Several full-screen overlays compute content widths from `terminalWidth - CONTENT_PADDING` without a lower bound. `CommandPaletteScreen` and `PromptHistorySearchScreen` can pass a negative `contentWidth` if terminal width is below the padding. `PlanSessionPickerScreen` and `ChatHistoryScreen` similarly use `terminalWidth - 4` directly. `ModelRoutePicker` always renders a side-by-side 45%/55% dual pane, with no narrow-width single-pane mode.

**Impact.** Very narrow terminals can produce clipped, invisible, or invalid layout dimensions. The model-route dashboard can become unreadable even before dimensions go negative because both panes compete for a single row of terminal width while focus remains split between left and right panes.

**Recommendation.** Clamp all computed widths to a safe minimum before passing them to layout props. Add a narrow-width mode for model-route-picker that renders one pane at a time (left route list, then right model/reasoning list) with the same keyboard state machine but no horizontal split.

---

### S10-F06 — Model-route status/error messaging is color-misleading and disappears in compact height
**Severity:** Medium
**Domain:** 5 (color-only signal), 4 (responsive layout), 7 (timers)
**Files:** `cli/src/components/model-route-picker.tsx` lines 502–505, 568–580

**Observation.** Successful saves set `statusMessage` with a leading `✓` and schedule a 4s clear timer. Errors set `statusMessage` with a leading `✗`, but the header renders all status messages with `fg: theme.success`. The status is also only rendered inside `!isCompactMode`; compact-height terminals hide both success and error status entirely.

**Impact.** Errors are shown in a success color when the header is visible, and are not shown at all in compact mode. Users may believe a failing config write succeeded, or may receive no feedback after pressing Enter in a constrained terminal.

**Recommendation.** Store status as `{kind: 'success' | 'error', message}` and map to success/error colors plus textual prefixes. Render status in the footer or active pane even in compact mode, and clear both success/error timers with the existing cleanup.

---

### S10-F07 — `ShimmerText` creates independent high-frequency intervals and has an empty-text edge case
**Severity:** Medium
**Domain:** 7 (timers/interval cleanup), 6 (render performance), 5 (color/animation signal)
**Files:**
- `cli/src/components/shimmer-text.tsx` lines 147–153, 213–245
- `cli/src/components/status-bar.tsx` lines 126–147

**Observation.** Every `ShimmerText` instance starts its own `setInterval`, often at 160–180ms. Cleanup is present, so this is not a straightforward unmount leak. However, each tick rerenders the component and rebuilds span parts. If `text` is ever empty, `numChars` is `0` and the interval callback computes `(prev + 1) % numChars`, producing `NaN` and continuing to tick pointlessly.

**Impact.** Status animations consume a continuous render budget during streaming/waiting. Multiple shimmer instances would multiply intervals. The empty-string case can become a silent hot loop with invalid state if a future call passes a dynamic empty label.

**Recommendation.** Return plain `null`/empty text without starting an interval when `numChars === 0`. Consider sharing a global animation tick or slowing the interval when the terminal is under load. Provide a reduced-motion/static status option for users who cannot tolerate animation.

---

### S10-F08 — Large prompt/file history screens do synchronous heavy work on mount and each keystroke
**Severity:** Medium
**Domain:** 6 (render performance), 4 (responsive perceived latency)
**Files:**
- `cli/src/components/prompt-history-search-screen.tsx` lines 95–103, 61–80
- `cli/src/components/command-palette-screen.tsx` lines 78–88, 182–205
- `cli/src/components/chat-history-screen.tsx` lines 52–63

**Observation.** Prompt history search synchronously calls `loadMessageHistory()` on mount, reverses the full history, and fuzzy-scores all prompts on each query update before slicing to 200. The command palette flattens file-tree entries in `buildEntries()` and then filters/scores in render-time `useMemo`s. Chat history improves first paint by deferring background loading via `setTimeout(0)`, but the deferred callback still performs synchronous disk/list work on the UI thread.

**Impact.** Large history files or large repository file trees can freeze the TUI while overlays mount or while a user types. Because these screens also own focused input, any stall feels like dropped keystrokes.

**Recommendation.** Move large history/file indexing off the hot render path: pre-index histories, debounce fuzzy scoring, chunk background loading, and cap before expensive scoring where possible. For command palette, flatten once when the file tree changes and use an indexed search structure rather than rescanning all entries per keystroke.

---

### S10-F09 — Command palette only searches the first 50 flattened file entries
**Severity:** Medium
**Domain:** 6 (performance tradeoff), 8 (cross-screen correctness), 2 (focus expectations)
**Files:** `cli/src/components/command-palette-screen.tsx` lines 37–40, 78–88, 182–205

**Observation.** `buildEntries()` always receives `LAYOUT.MAX_EMPTY_FILE_ITEMS` and slices the flattened file tree before returning entries. The later query path filters `allEntries`, which already contains only all commands plus the first 50 file entries. The comment says the cap is for when the query is empty, but the cap is applied before search as well.

**Impact.** Users can type an exact filename and still get “No matches” if that file is not in the first 50 flattened entries. This looks like a search/focus failure rather than a deliberate performance cap.

**Recommendation.** Use separate entry sets: a small capped list for empty-query display and a larger/full indexed list for non-empty search. If full search is too expensive, surface an explicit message such as “Showing first N results; keep typing to search all files” only when the implementation actually searches all files.

---

### S10-F10 — Agent checklist scroll math ignores expanded dependency-tree rows
**Severity:** Medium
**Domain:** 2 (focus visibility), 4 (responsive scrolling), 6 (render performance)
**Files:** `cli/src/components/agent-checklist.tsx` lines 156–188, 313–319

**Observation.** The focused-row auto-scroll effect assumes every agent occupies exactly one line (`itemHeight = 1`, `focusedTop = focusedIndex * itemHeight`). Expanded dependency trees render additional rows between agents, and `buildDepTree(...)` is recomputed inline for each expanded item during render.

**Impact.** Once dependencies are expanded, keyboard focus can scroll to the wrong visual location. The focused agent may remain off-screen or jump unpredictably, especially with several expanded trees. Large local-agent dependency graphs also add render work on every hover/focus/selection update.

**Recommendation.** Model the checklist as a flattened visible-row array that includes dependency rows, and scroll by actual visible row index. Memoize dependency trees/counts by `agentDefinitions` and `allAgents`, and avoid rebuilding trees inside JSX for every render.

---

### S10-F11 — Provider picker availability and custom-validation states are partly symbolic/color-coded without enough explanation
**Severity:** Medium
**Domain:** 5 (color-only/symbol-only signal), 1 (a11y semantics), 2 (focus clarity)
**Files:** `cli/src/components/provider-picker-screen.tsx` lines 208–211, 513–518, 610–618

**Observation.** `envStatus()` returns only `✓` or `!`, appended to `env: NAME` without a legend. Custom-provider review uses success/error color on a summary sentence to indicate whether submission is allowed. The invalid state says required fields are missing but does not identify which specific field(s) failed after the user tabs through the multi-step form.

**Impact.** Users relying on monochrome terminals, screen readers, or copied logs may not know what `!` means. Custom provider setup can leave users in the review step without actionable focus guidance.

**Recommendation.** Render explicit text such as `env: OPENAI_API_KEY set` / `env: OPENAI_API_KEY missing`. In custom review, list missing/invalid fields and provide direct keyboard shortcuts to jump to each failing field.

---

### S10-F12 — Message/agent rendering still has expensive per-render work despite `memo()` wrappers
**Severity:** Medium
**Domain:** 6 (render performance), 8 (error containment)
**Files:**
- `cli/src/components/message-with-agents.tsx` lines 104–153, 393–427
- `cli/src/components/message-footer.tsx` lines 74–83
- `cli/src/components/message-block.tsx` lines 116–185

**Observation.** The message tree uses `memo()` and shallow store selectors, which is good. But agent messages still compute markdown/rendered content in the render body (`renderMarkdown(...)` or `wrapTextPreservingNewlines(...)`) rather than a `useMemo`. `MessageFooter` rebuilds `textToCopy` by scanning content blocks on each render. `MessageBlock` is memoized, but it receives many object/array props from parent/store state, so streaming updates can still propagate through expensive markdown and footer calculations.

**Impact.** During streaming, nested agents and long markdown messages can rerender frequently. Expensive markdown conversion in render also increases the chance that a single malformed block throws during render; given F01, such exceptions are not contained by the placeholder boundary.

**Recommendation.** Memoize derived markdown/rendered content by message id/content/width/palette. Memoize copy text by `content` and `blocks`. Consider per-block error fallbacks around markdown/tool rendering rather than wrapping only high-level agent grids.

---

### S10-F13 — Status bar context threshold is color-only and status animation can crowd out important metadata
**Severity:** Low-Medium
**Domain:** 5 (color-only signal), 4 (responsive layout), 7 (timers)
**Files:** `cli/src/components/status-bar.tsx` lines 166–177, 223–278

**Observation.** Context usage changes from secondary to warning color at `>= 70%`, but the text remains `ctx NN%`. Other metadata (`cost`, `git`, model, elapsed time, stop button) are packed into a flex row with `wrapMode: 'none'`. The active status text uses `ShimmerText`, while some important state transitions like paused render `null`.

**Impact.** Users who cannot distinguish the warning color do not receive a non-color warning that context is approaching the limit. On narrow terminals, right-side metadata can be truncated or squeezed while the animated status takes visual priority.

**Recommendation.** Add explicit text at thresholds (`ctx 72% warning`, `ctx 90% critical`) and consider ordering or collapsing metadata based on terminal width. For paused state, render a stable textual indicator rather than `null`.

---

### S10-F14 — Searchable-list focus clamping is length-based, not item-identity based
**Severity:** Low-Medium
**Domain:** 2 (focus order), 6 (render performance/correctness)
**Files:** `cli/src/hooks/use-searchable-list.ts` lines 62–83

**Observation.** `useSearchableList` clamps `focusedIndex` only when `filteredItems.length` changes. If the same number of items remains after a query/data update but their order or identity changes, focus stays at the same numeric index rather than following the previously focused item id or resetting to the top match.

**Impact.** The highlighted row can unexpectedly jump to a different chat/session/project when search results reorder but length remains constant. Pressing Enter then selects an item the user did not intentionally focus.

**Recommendation.** Track focused item id and reconcile it after filtering. If the id disappears, reset to index 0; if it remains, move focus to that item’s new index. For search overlays, consider always resetting focus to 0 when query text changes unless the user explicitly navigated.

---

## Summary

| Domain | Findings |
|---|---|
| 1. Accessibility semantics / ARIA-like labeling | F02, F03, F11 |
| 2. Keyboard focus order and focus visibility | F03, F04, F05, F10, F14 |
| 3. Keyboard/mouse parity | F02, F03, F04 |
| 4. Responsive layout / small terminal behavior | F05, F06, F10, F13 |
| 5. Color-only or color-dominant signaling | F04, F06, F07, F11, F13 |
| 6. Render performance | F07, F08, F09, F10, F12, F14 |
| 7. Timers, intervals, async cleanup | F06, F07, F13 |
| 8. Error containment / resilience | F01, F09, F12 |

**Top risks to prioritize:**
1. **F01 (`ErrorBoundary` passthrough)** — UI render failures are not contained despite call sites implying they are.
2. **F03 (mouse-only secondary controls)** — visible actions such as delete/close/report/edit are not consistently keyboard reachable.
3. **F05 + F06 (responsive/status issues)** — narrow/compact terminals can lose critical model-route status and render unusable dual panes.
4. **F08/F12 (hot-path rendering)** — large histories, file trees, and streaming agent markdown can stall the TUI.

**No source edits performed.** Only this audit findings file was written.
