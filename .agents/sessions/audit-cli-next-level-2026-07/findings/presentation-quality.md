# Presentation-quality audit findings

## [MEDIUM] Correctness — cli/src/components/command-palette-screen.tsx:172 — Palette search can never find files beyond the first 50
- **Risk:** In repositories with more than 50 flattened paths, Ctrl+P search silently excludes every later file even after the user types an exact filename, making the primary navigation feature unreliable at realistic monorepo scale.
- **Fix:** Keep the empty-query display capped, but build/search the complete flattened path index (or query the index lazily) and only cap the final rendered matches.
- **Evidence:** `allEntries` is permanently built with `buildEntries(slashCommands, fileTree, LAYOUT.MAX_EMPTY_FILE_ITEMS)` where `MAX_EMPTY_FILE_ITEMS = 50`, and `filteredEntries` only scores that already-truncated array; `command-palette-screen.test.ts:63-73` asserts the cap but has no test proving typed search reaches a path beyond it.
- **Confidence:** High (Evidence).

## [MEDIUM] State mutation — cli/src/chat.tsx:1339 — Hidden chat shortcuts remain active beneath full-screen search overlays
- **Risk:** While the command palette or prompt-history screen owns focus, PageUp/PageDown, Ctrl+T, Ctrl+R/Ctrl+P, and Tab can still mutate the hidden chat or open a second overlay because the global chat keyboard hook remains enabled.
- **Fix:** Include `commandPaletteOpen` and `promptHistoryOpen` in the `disabled` gate, and make each overlay the sole keyboard owner until it closes.
- **Evidence:** The `useChatKeyboard` disable expression at `chat.tsx:1342-1347` covers ask-user, review, model, provider, and plan pickers but omits both search overlays; `keyboard-actions.ts:168-183,327-354` continues resolving global overlay, collapse, mode, and scroll shortcuts, while the overlay interceptors intentionally return `false` for most of those keys.
- **Confidence:** High (Evidence).

## [MEDIUM] Correctness — cli/src/hooks/use-scroll-management.ts:126 — Keyboard page-up incorrectly re-enables follow mode
- **Risk:** A user paging upward to read earlier output is marked “at bottom,” so the next streamed message can snap the viewport back to the latest content and destroy their reading position.
- **Fix:** Distinguish intentional navigation (`scrollUp`/`scrollDown`) from follow-to-latest animation, disable auto-follow when the target is above the bottom, and derive `isAtBottom` from the actual resulting position.
- **Evidence:** Every animated scroll sets `programmaticScrollRef.current = true` (`:66`), and the change handler then unconditionally sets `autoScrollEnabledRef.current = true` and `setIsAtBottom(true)` (`:126-130`), including animations initiated by `scrollUp()` (`:92-100`); no dedicated scroll-management test exists in the manifest or test tree.
- **Confidence:** High (Evidence).

## [MEDIUM] State mutation — cli/src/hooks/use-chat-ui.ts:72 — Scroll listeners stay attached to a destroyed scrollbox after overlays
- **Risk:** Opening and closing a full-screen picker/search screen replaces the chat scrollbox, but overflow and at-bottom tracking can remain bound to the old instance, causing stale scrollbar visibility/status state and leaked listeners.
- **Fix:** Use a callback ref or renderer-instance state so listener effects depend on the current `ScrollBoxRenderable`, detach on ref replacement, and reattach after the chat viewport remounts.
- **Evidence:** `useChatUI` subscribes to `scrollbox.verticalScrollBar` in an effect with `[]` (`:72-93`), and `useChatScrollbox` similarly depends only on the stable ref object (`use-scroll-management.ts:113-143`); `chat.tsx:1543-1617` returns full-screen overlays that unmount the normal scrollbox without unmounting `Chat` or either hook.
- **Confidence:** High (Evidence).

## [MEDIUM] Error handling — cli/src/components/error-boundary.tsx:26 — Nested-agent fallback is a passthrough, not an error boundary
- **Risk:** A malformed or renderer-incompatible nested agent subtree can still take down the entire TUI instead of showing the promised local fallback, interrupting the session and hiding the output that caused the failure.
- **Fix:** Install a real OpenTUI-compatible error boundary at the root and nested-agent/tool boundaries, or pre-render risky subtrees through a supported isolation mechanism with a tested fallback.
- **Evidence:** `ErrorBoundaryPlaceholder` returns `children` unchanged and explicitly says it does not catch render errors (`:10-30`), yet `message-with-agents.tsx:75-92` imports the deprecated `ErrorBoundary` alias and wraps `AgentChildrenGrid` with an “Error rendering agent children” fallback that can never activate; fatal process handlers in `index.tsx:386-423` exit on uncaught render failures.
- **Confidence:** High (Evidence).

## [MEDIUM] Performance — cli/src/utils/terminal-color-detection.ts:82 — Theme probing can add a full second before first paint on unknown terminals
- **Risk:** Every interactive startup on an unrecognized TTY can wait through two sequential 500 ms OSC queries before OpenTUI renders, making the CLI feel slow precisely on terminals where detection is least likely to work.
- **Fix:** Treat only known/probed terminals as OSC-capable, prefer immediate environment fallbacks, cache capability, and move nonessential detection after first paint when safe.
- **Evidence:** `terminalSupportsOSC()` falls back to `process.stdin.isTTY === true` for every unknown terminal (`:82-83`), `detectTerminalThemeCore()` awaits OSC 11 and then OSC 10 sequentially (`:416-430`), each query has a 500 ms timeout (`:18-20,193-196`), and `index.tsx:246-258` awaits detection before argument parsing and renderer creation; tests cover known-positive terminals but no unknown-TTY fast path (`terminal-color-detection.test.ts:250-309`).
- **Confidence:** High (Evidence).

## [LOW] API/ABI contract breaks — cli/src/hooks/use-terminal-layout.ts:7 — Three incompatible responsive contracts drift across the CLI
- **Risk:** Components switch chrome and layouts at different widths, so the same terminal can be “narrow” to one screen and “standard” to another, producing hard-to-predict transitions and documentation that cannot be trusted.
- **Fix:** Define one exported responsive token set with named layout intents, migrate all screens to it, and add cross-component boundary tests plus synchronized documentation.
- **Evidence:** `use-terminal-layout.ts` documents `xs` as `<80` but implements `<50` (`:7,23,121-130`), `use-terminal-breakpoints.ts:20-29` uses 60/100 and 15/20/30, grid layout uses 100/150/200 (`use-grid-layout.ts:13-22`), and `cli/knowledge.md:306-320` still specifies a 70-column screen-mode contract; existing tests validate each local constant rather than a shared contract.
- **Confidence:** High (Evidence).

## [LOW] Dependency hygiene — cli/package.json:54 — Unused `terminal-image` retains a heavy duplicate image stack
- **Risk:** The workspace install and dependency graph carry an unused terminal rendering package plus its transitive legacy image decoder, increasing maintenance and supply-chain surface without providing CLI behavior.
- **Fix:** Remove `terminal-image` if the custom `terminal-images.ts` path is authoritative, or replace the custom protocol code with the dependency and delete the duplicate implementation.
- **Evidence:** `terminal-image` is declared at `cli/package.json:54` but has no imports anywhere under `cli/`; `bun.lock` shows it depends on `jimp@1.6.0` and `render-gif`, which additionally brings `jimp@0.14.0`, while the CLI already imports `jimp@1.6.0` directly in `utils/image-thumbnail.ts`.
- **Confidence:** High (Evidence).

## [LOW] Test coverage gaps — cli/src/components/__tests__/command-palette-screen.test.ts:32 — Presentation tests do not assert what users can actually read
- **Risk:** Layout/reconciliation regressions can pass helper-level tests while command rows, focus highlights, or text disappear in the real renderer, especially across terminal widths and color capabilities.
- **Fix:** Add ANSI-aware tmux golden checks at narrow/standard/wide sizes and light/dark/256-color modes, asserting visible command labels, selected-row markers, focus restoration, and overlay close behavior rather than only capture existence.
- **Evidence:** The command-palette test file exercises `buildEntries`, `scoreEntry`, and `entryToListItem` only (`:32-297`); the supplied built-binary capture `debug/tmux-sessions/audit-cli-baseline/capture-003-command-palette.txt` at 120x36 visibly contains `/` and `23 items` but no readable command labels (plain capture may omit styling, not expected text), and no integration test correlates the capture with the 23 rendered commands.
- **Confidence:** Medium (Inference corroborated by capture evidence).

## [LOW] Correctness — cli/src/components/tools/diff-viewer.tsx:459 — Side-by-side diffs encode add/delete state primarily by red and green
- **Risk:** In monochrome, low-color, or red-green color-impaired viewing, paired changed rows lose an explicit operation marker, reducing confidence about which side is removed versus added.
- **Fix:** Preserve `-` and `+` markers (or labeled OLD/NEW gutters) in side-by-side mode and add a no-color snapshot test.
- **Evidence:** Unified rows render `signChar` (`:431-454`), but side-by-side rows render only line numbers, colored text, and a separator (`:459-502`); the tests verify the separator and fallback width but not a color-independent semantic marker (`diff-viewer.test.tsx:169-190`).
- **Confidence:** High (Evidence).

## Strengths observed

- The render shell has explicit fatal terminal cleanup, alternate-screen reset handling, and listener removal during renderer handoff.
- Diff presentation now includes parsed hunks, line-number gutters, explicit truncation disclosure, automatic initial collapsing, and unified-mode `+`/`-` markers.
- Message and agent rendering has meaningful pagination, collapse controls, depth-limit disclosure, stable React keys, and substantial focused tests.
- Input handling is unusually comprehensive: paste routing strips ANSI, long paste becomes an attachment, Enter normalization is centralized, and ask-user forms are keyboard-operable.
- Theme and terminal compatibility work is broad: truecolor fallbacks, OSC timeouts/cleanup, light/dark palettes, 256-color awareness, tmux-specific knowledge, and native text wrapping are all present.
- The 120x36 startup capture shows a clean, calm baseline with clear directory context and a prominent input affordance; styling/contrast cannot be conclusively judged from plain text capture.

## Coverage and files actually read

- Evaluated all eight audit domains: Security, Correctness, State mutation, Error handling, Performance, Dependency hygiene, Test coverage gaps, and API/ABI contract breaks. No presentation-scoped critical/high security issue was substantiated; sensitive-file labeling, ANSI stripping on paste, base64 OSC52 payloads, and bounded diff rendering were positive controls.
- Read the audit rubric and the full presentation manifest; inspected current dirty-worktree status and scoped diffs/statistics without reading any existing `.agents/sessions/*` audit report.
- Read in full or targeted line-bounded sections: `cli/src/index.tsx`, `app.tsx`, `chat.tsx`, `use-chat-ui.ts`, `use-chat-state.ts`, `use-chat-messages.ts`, `use-scroll-management.ts`, terminal dimension/layout/breakpoint/grid hooks, `chat-scroll-accel.ts`, layout/text utilities, command/prompt search screens, suggestion/selectable list/input keyboard paths, message/agent/tool/collapse stores and renderers, diff/edit/read tool renderers, theme/color detection, terminal links/clipboard/images, ask-user and interaction primitives, animation/rerender instrumentation, and `cli/package.json`/`bun.lock` dependency metadata.
- Corroborated with the manifest's direct tests for command palette, layout/grid, keyboard, messages/agents, diffs/edit tools, theme detection, ask-user, and rerender performance; searched the complete manifest path set for listener, timeout, truncation, focus, keyboard, dependency, and error-handling patterns.
- Read relevant portions of `docs/architecture.md`, `docs/testing.md`, `docs/agents-and-tools.md`, `cli/knowledge.md`, and `cli/tmux.knowledge.md`.
- Inspected concrete built-binary captures `debug/tmux-sessions/audit-cli-baseline/capture-001-startup.txt` and `capture-003-command-palette.txt` from the isolated 120x36 run, treating absent styling cautiously.
