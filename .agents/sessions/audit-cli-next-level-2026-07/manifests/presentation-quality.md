# CLI presentation-quality file manifest

## Scope

Independent file selection for the CLI presentation half of audit shard pair 4. This manifest covers the rendered OpenTUI surface and the code that directly controls its terminal behavior:

- root TUI composition and chat viewport
- terminal dimensions, responsive layout, resizing, scrolling, and collapse/navigation behavior
- keyboard reachability, input editing, suggestions, search, and full-screen picker screens
- message, nested-agent, thinking, plan/gate, and tool-call presentation
- theme selection, color capability detection, contrast inputs, markdown/text wrapping, images, and terminal links
- interactive primitives, banners, status/error UI, ask-user forms, and mode controls
- perceived performance: memo boundaries, store subscription boundaries, stable render trees, animations, and rerender instrumentation
- OpenTUI-specific integration constraints and terminal/platform compatibility

This is a discovery manifest only. It intentionally contains no quality findings or feature proposals.

## Primary source subshards

All line counts are approximate `wc -l` counts from the current tree. Primary groups target 5-15 files and stay below the audit pattern's ~3k LOC risk threshold.

### P1 — OpenTUI bootstrap and chat shell (~2.9k LOC, 6 files)

- `cli/src/index.tsx` — renderer creation, renderer options/cleanup, root mounting, process lifecycle
- `cli/src/app.tsx` — top-level authenticated/project surfaces, logo/header composition, terminal-focus integration
- `cli/src/chat.tsx` — central chat layout, overlay routing, scrollbox, message list, status bar, input bar, keyboard callback wiring
- `cli/src/hooks/use-chat-ui.ts` — aggregation point for dimensions, responsive state, theme palette, scrolling, and overflow state
- `cli/src/hooks/use-chat-state.ts` — stabilized chat/store selections consumed by the render shell
- `cli/src/components/error-boundary.tsx` — React class boundary adapted to OpenTUI JSX constraints

Sizing note: this group is close to the ~3k LOC threshold because `chat.tsx` is 1,779 LOC. Do not add adjacent streaming/business hooks to this subshard.

### P2 — Responsive layout, resize, and scroll mechanics (~1.2k LOC, 11 files)

- `cli/src/hooks/use-terminal-dimensions.ts`
- `cli/src/hooks/use-terminal-layout.ts`
- `cli/src/hooks/use-terminal-breakpoints.ts`
- `cli/src/hooks/use-grid-layout.ts`
- `cli/src/components/grid-layout.tsx`
- `cli/src/hooks/use-scroll-management.ts`
- `cli/src/utils/chat-scroll-accel.ts`
- `cli/src/utils/layout-helpers.ts`
- `cli/src/utils/text-layout.ts`
- `cli/src/utils/ui-constants.ts`
- `cli/src/utils/renderer-cleanup.ts`

### P3 — Input editing and global keyboard behavior (~3.0k LOC, 10 files)

- `cli/src/components/chat-input-bar.tsx`
- `cli/src/components/multiline-input.tsx`
- `cli/src/components/input-cursor.tsx`
- `cli/src/hooks/use-chat-keyboard.ts`
- `cli/src/hooks/use-chat-input.ts`
- `cli/src/hooks/use-input-history.ts`
- `cli/src/utils/keyboard-actions.ts`
- `cli/src/utils/chat-input-key-intercept.ts`
- `cli/src/utils/terminal-enter-detection.ts`
- `cli/src/utils/keypad-keys.ts`

Sizing note: approximately 2,961 LOC; keep suggestion/search files in P4.

### P4 — Suggestions, searchable lists, and command/history overlays (~2.0k LOC, 6 files)

- `cli/src/hooks/use-suggestion-engine.ts`
- `cli/src/components/suggestion-menu.tsx`
- `cli/src/hooks/use-searchable-list.ts`
- `cli/src/components/selectable-list.tsx`
- `cli/src/components/command-palette-screen.tsx`
- `cli/src/components/prompt-history-search-screen.tsx`

### P5 — Full-screen project/session/provider/model pickers (~2.85k LOC, 6 files)

- `cli/src/components/project-picker-screen.tsx`
- `cli/src/components/chat-history-screen.tsx`
- `cli/src/components/model-route-picker.tsx`
- `cli/src/components/provider-picker-screen.tsx`
- `cli/src/components/plan-session-picker-screen.tsx`
- `cli/src/hooks/use-directory-browser.ts`

Sizing note: close to the ~3k threshold because the model and provider pickers are 861 and 663 LOC. Keep picker data/config semantics out of this presentation pass.

### P6 — Message composition, markdown handoff, and collapse state (~2.65k LOC, 11 files)

- `cli/src/components/message-with-agents.tsx`
- `cli/src/components/message-block.tsx`
- `cli/src/components/message-footer.tsx`
- `cli/src/components/blocks/blocks-renderer.tsx`
- `cli/src/components/blocks/single-block.tsx`
- `cli/src/components/blocks/content-with-markdown.tsx`
- `cli/src/components/blocks/user-content-copy.tsx`
- `cli/src/components/collapse-button.tsx`
- `cli/src/utils/collapse-helpers.ts`
- `cli/src/utils/block-processor.ts`
- `cli/src/state/message-block-store.ts`

### P7 — Nested agents, thinking, and grouped branches (~2.0k LOC, 10 files)

- `cli/src/components/blocks/agent-block-grid.tsx`
- `cli/src/components/blocks/agent-list-branch.tsx`
- `cli/src/components/blocks/agent-branch-item.tsx`
- `cli/src/components/blocks/agent-branch-wrapper.tsx`
- `cli/src/components/blocks/implementor-row.tsx`
- `cli/src/components/blocks/thinking-block.tsx`
- `cli/src/components/thinking.tsx`
- `cli/src/components/blocks/tool-branch.tsx`
- `cli/src/components/blocks/tool-block-group.tsx`
- `cli/src/components/blocks/ask-user-branch.tsx`

### P8 — Tool renderer framework and discovery/command tools (~1.56k LOC, 12 files)

- `cli/src/components/tools/types.ts`
- `cli/src/components/tools/registry.ts`
- `cli/src/components/tools/tool-call-item.tsx`
- `cli/src/components/tools/discovery-output.tsx`
- `cli/src/components/tools/query-index.tsx`
- `cli/src/components/tools/code-search.tsx`
- `cli/src/components/tools/run-terminal-command.tsx`
- `cli/src/components/tools/spawn-agents.tsx`
- `cli/src/components/tools/list-directory.tsx`
- `cli/src/components/tools/read-subtree.tsx`
- `cli/src/components/tools/read-docs.tsx`
- `cli/src/components/tools/glob.tsx`

### P9 — Edit/action tools, diffs, and interactive tool output (~2.6k LOC, 13 files)

- `cli/src/components/tools/diff-viewer.tsx`
- `cli/src/components/tools/apply-patch.tsx`
- `cli/src/components/tools/str-replace.tsx`
- `cli/src/components/tools/edit-transaction.tsx`
- `cli/src/components/tools/read-files.tsx`
- `cli/src/components/tools/write-file.tsx`
- `cli/src/components/tools/run-file-change-hooks.tsx`
- `cli/src/components/tools/proposal-actions.tsx`
- `cli/src/components/tools/render-ui.tsx`
- `cli/src/components/tools/write-todos.tsx`
- `cli/src/components/tools/suggest-followups.tsx`
- `cli/src/components/tools/skill.tsx`
- `cli/src/components/tools/task-completed.tsx`

### P10 — Theme resolution and terminal color capability (~2.1k LOC, 5 files)

- `cli/src/hooks/use-theme.tsx`
- `cli/src/utils/theme-system.ts`
- `cli/src/utils/theme-config.ts`
- `cli/src/utils/terminal-color-detection.ts`
- `cli/src/types/theme-system.ts`

### P11 — Markdown, text wrapping, links, images, and terminal transport (~2.4k LOC, 11 files)

- `cli/src/utils/markdown-renderer.tsx`
- `cli/src/utils/syntax-highlighter.tsx`
- `cli/src/utils/word-wrap-utils.ts`
- `cli/src/components/terminal-link.tsx`
- `cli/src/components/highlighted-text.tsx`
- `cli/src/utils/clipboard.ts`
- `cli/src/utils/terminal-images.ts`
- `cli/src/utils/image-display.ts`
- `cli/src/components/image-card.tsx`
- `cli/src/components/image-thumbnail.tsx`
- `cli/src/utils/image-thumbnail.ts`

### P12 — Interactive primitives, status/error UI, ask-user, and mode controls (~2.75k LOC, 15 files)

- `cli/src/components/clickable.tsx`
- `cli/src/components/button.tsx`
- `cli/src/components/top-banner.tsx`
- `cli/src/components/bottom-banner.tsx`
- `cli/src/components/help-banner.tsx`
- `cli/src/components/status-bar.tsx`
- `cli/src/components/user-error-banner.tsx`
- `cli/src/components/validation-error-popover.tsx`
- `cli/src/components/ask-user/index.tsx`
- `cli/src/components/ask-user/components/accordion-question.tsx`
- `cli/src/components/ask-user/components/options-list.tsx`
- `cli/src/components/ask-user/components/question-option.tsx`
- `cli/src/components/ask-user/components/custom-answer-input.tsx`
- `cli/src/components/segmented-control.tsx`
- `cli/src/components/agent-mode-toggle.tsx`

### P13 — Animation and rerender instrumentation (~0.53k LOC, 5 files)

- `cli/src/hooks/use-why-did-you-update.ts`
- `cli/src/utils/yield-to-event-loop.ts`
- `cli/src/hooks/use-now.ts`
- `cli/src/hooks/use-sheen-animation.tsx`
- `cli/src/components/shimmer-text.tsx`

## Related tests

The tests below are the most direct presentation verification surfaces. They are intentionally not one giant subshard: the combined set is well over 3k LOC, and several individual files exceed 600-1,200 LOC.

### Layout, resize, scrolling, and performance

- `cli/src/__tests__/rerender-perf.integration.test.ts`
- `cli/src/components/__tests__/grid-layout.test.tsx` — 1,033 LOC; oversized single test file
- `cli/src/components/__tests__/grid-layout.integration.test.tsx`
- `cli/src/components/__tests__/subagent-card-layout.test.tsx`
- `cli/src/components/__tests__/agent-branch-overflow.test.tsx`
- `cli/src/hooks/__tests__/use-terminal-layout.test.ts` — 675 LOC
- `cli/src/hooks/__tests__/use-grid-layout.test.ts`
- `cli/src/utils/__tests__/layout-helpers.test.ts`
- `cli/src/utils/__tests__/text-layout.test.ts`

### Input, keyboard reachability, search, and pickers

- `cli/src/components/__tests__/multiline-input.test.tsx`
- `cli/src/hooks/__tests__/use-chat-input.test.ts`
- `cli/src/hooks/__tests__/use-input-history.test.ts`
- `cli/src/hooks/__tests__/use-suggestion-engine.test.ts`
- `cli/src/hooks/__tests__/use-suggestion-engine-mention.test.ts`
- `cli/src/utils/__tests__/keyboard-actions.test.ts` — 650 LOC
- `cli/src/utils/__tests__/chat-input-key-intercept.test.ts`
- `cli/src/utils/__tests__/terminal-enter-detection.test.ts`
- `cli/src/components/__tests__/selectable-list.test.ts`
- `cli/src/components/__tests__/command-palette-screen.test.ts`
- `cli/src/components/__tests__/prompt-history-search-screen.test.ts`
- `cli/src/components/__tests__/plan-session-picker-screen.test.ts`
- `cli/src/__tests__/utils/project-picker.test.ts`

### Messages, agents, tools, collapse, and markdown

- `cli/src/components/__tests__/message-with-agents.test.tsx` — 765 LOC
- `cli/src/components/__tests__/message-block.streaming.test.tsx`
- `cli/src/components/__tests__/message-block.completion.test.tsx`
- `cli/src/utils/__tests__/block-processor.test.ts`
- `cli/src/utils/__tests__/message-block-helpers.test.ts`
- `cli/src/utils/__tests__/collapse-helpers.test.ts` — 1,272 LOC; oversized single test file
- `cli/src/utils/__tests__/markdown-renderer.test.tsx`
- `cli/src/components/tools/__tests__/registry-metadata.test.ts`
- `cli/src/components/tools/__tests__/diff-viewer.test.tsx`
- `cli/src/components/tools/__tests__/apply-patch.test.tsx`
- `cli/src/components/tools/__tests__/str-replace.test.tsx`
- `cli/src/components/tools/__tests__/edit-transaction.test.tsx`
- `cli/src/components/tools/__tests__/read-files.test.tsx`
- `cli/src/components/tools/__tests__/discovery-tools.test.tsx`
- `cli/src/components/tools/__tests__/query-index.test.tsx`
- `cli/src/components/tools/__tests__/code-search.test.tsx`
- `cli/src/components/tools/__tests__/run-terminal-command.test.ts`
- `cli/src/components/tools/__tests__/render-ui.test.tsx`

### Theme, interaction primitives, and end-to-end terminal rendering

- `cli/src/utils/__tests__/terminal-color-detection.test.ts`
- `cli/src/__tests__/unit/copy-button.test.ts`
- `cli/src/__tests__/unit/segmented-control.test.ts`
- `cli/src/__tests__/unit/agent-mode-toggle.test.ts`
- `cli/src/components/__tests__/status-indicator.test.tsx`
- `cli/src/components/__tests__/user-error-banner.test.tsx`
- `cli/src/components/ask-user/__tests__/multiple-choice-form.test.ts`
- `cli/src/components/ask-user/__tests__/validation.test.ts`
- `cli/src/__tests__/integration-tmux.test.ts`
- `cli/src/__tests__/e2e-cli.test.ts`

## Related docs and integration metadata

- `docs/architecture.md` — canonical CLI entry flow and package responsibility
- `docs/testing.md` — tmux-based render verification and capture expectations
- `docs/agents-and-tools.md` — current nested agent/tool block rendering contract and narrow-width behavior
- `cli/knowledge.md` — OpenTUI flex/resize rules, text-node constraints, clickable primitives, markdown wrapping, reconciliation hazards, menu navigation, and streaming-markdown policy
- `cli/tmux.knowledge.md` — bracketed-paste requirement, terminal captures, ANSI capture, and OpenTUI keyboard behavior under tmux
- `cli/README.md` — user-facing CLI capability summary
- `WINDOWS.md` — Windows terminal/shell compatibility expectations
- `cli/package.json` — OpenTUI 0.2.2, React 19, React reconciler, terminal-image, string-width, Yoga, and Zustand integration versions
- `cli/src/types/react19-compat.d.ts` — local React/OpenTUI JSX compatibility declaration

## Key symbols and render flows

1. **Process to root surface:** `main()` / `createRoot(renderer).render(...)` in `index.tsx` → `App` → `Chat`.
2. **Chat layout:** `Chat` calls `useChatUI`, renders the OpenTUI `<scrollbox>`, maps `visibleTopLevelMessages` into `MessageWithAgents`, then renders `StatusBar` and `ChatInputBar` in a non-scrolling footer.
3. **Dimensions and responsive state:** OpenTUI renderer dimensions → `useTerminalDimensions` → `useTerminalLayout` / `useTerminalBreakpoints` / `useGridLayout` → component width, compact-height, narrow-width, and column decisions.
4. **Scrolling:** `useChatUI` owns the `ScrollBoxRenderable` ref → `useChatScrollbox` controls sticky/latest/page scrolling → `createChatScrollAcceleration` supplies inertial acceleration → `StatusBar` exposes the scroll-to-bottom affordance.
5. **Keyboard and input:** OpenTUI `useKeyboard` is used by `MultilineInput`, `useChatKeyboard`, provider/ask-user screens, and related overlays. `Chat` builds `ChatKeyboardState`/handlers; `keyboard-actions.ts` and `chat-input-key-intercept.ts` decide routing among input editing, suggestions, agent focus, scrolling, collapse, and overlays.
6. **Suggestions and search:** `useSuggestionEngine` derives slash/agent/file contexts → `SuggestionMenu`; full-screen command/history/picker screens share `SelectableList`, `useSearchableList`, and focused `<input>` renderables.
7. **Message rendering:** `MessageWithAgents` → `MessageBlock` → `BlocksRenderer` → `processBlocks` routes reasoning, tools, implementors, agent groups, images, and single blocks.
8. **Nested agents:** `AgentBlockGrid` computes responsive groups → `AgentBranchWrapper` owns agent body/preview state → `AgentBranchItem` renders the bordered collapsible surface; nested blocks recurse through the same flow.
9. **Tool rendering:** `ToolBlockGroup` → `ToolBranch` → `renderToolComponent` in the registry → custom `ToolComponent` render config or fallback `ToolCallItem`; collapse/streaming previews and `availableWidth` flow through this boundary.
10. **Markdown/text:** `ContentWithMarkdown` selects `renderMarkdown` or `renderStreamingMarkdown`; output must remain valid within OpenTUI text-node constraints. Width is propagated into code blocks, tables, wrapping, diffs, links, and nested cards.
11. **Theme/color:** `initializeThemeStore` / `detectSystemTheme` combine OSC detection, environment/IDE/platform detection, manual overrides, and theme config → `useTheme` → `createMarkdownPalette` and component color props.
12. **Terminal compatibility:** focus-reporting escape sequences, OSC color queries, OSC52 clipboard, truecolor checks, bracketed paste, keypad/enter normalization, terminal-image sizing, renderer cleanup, and Windows/IDE terminal inference span P1/P3/P10/P11.
13. **Rerender boundaries:** `memo` is pervasive in message/agent/tool/layout components; `BlocksRenderer` stores changing props in a ref behind stable processor handlers; `message-block-store` supplies context/callbacks; `rerender-perf.integration.test.ts` is the direct regression surface.

## Explicit exclusions

- Existing audit reports, findings, manifests, or session conclusions, including everything under `.agents/sessions/**/findings/`; this selection was made from source/docs/tests only.
- `node_modules`, built binaries, `dist/`, release bundles/wrappers, generated agent-source bundles, lockfiles, and generated declarations other than the small React compatibility declaration named above.
- SDK/provider/runtime correctness, model routing, authentication, analytics, billing/cost computation, indexing internals, and tool execution semantics except where their already-produced data is rendered by the CLI.
- Command implementation semantics in `cli/src/commands/`; command palette presentation is included, but command execution behavior belongs to another shard.
- Chat streaming/event processing, queue ownership, persistence, file mutation, and API/network behavior except for their direct render/store subscription boundaries.
- Project discovery, provider config mutation, and plan artifact semantics behind picker screens; only their visible layout, focus, keyboard, validation display, and navigation surfaces are in scope here.
- Image decoding/resizing/upload internals; only terminal sizing/transport and rendered cards/thumbnails are included.
- Init/release/build scripts and packaging, except `cli/package.json` as OpenTUI integration metadata.

