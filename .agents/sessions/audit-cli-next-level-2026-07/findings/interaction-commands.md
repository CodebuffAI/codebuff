# Interaction and commands audit findings

## [MEDIUM] Correctness — cli/src/components/multiline-input.tsx:940 — Ctrl+B can move the cursor before the start of input

- **Risk:** Pressing Ctrl+B at cursor position 0 emits `cursorPosition: -1`, which can desynchronize editing/rendering and make subsequent slice-based edits operate from the end of the string.
- **Fix:** Clamp the Ctrl+B target with `Math.max(0, cursorPosition - 1)` or route it through the existing clamping `moveCursor` helper, and add a component-level boundary test.
- **Evidence:** `handleNavigationKeys` directly calls `onChange({ cursorPosition: cursorPosition - 1 })` at lines 940-948 while the ordinary left-arrow path at lines 962-966 uses `moveCursor`; `cli/src/components/__tests__/multiline-input.test.tsx` contains no Ctrl+B/Ctrl+F boundary case.
- **Confidence:** High — Evidence.

## [MEDIUM] Correctness — cli/src/components/command-palette-screen.tsx:170 — Palette search permanently excludes files after the first 50

- **Risk:** In repositories with more than 50 flattened entries, Ctrl+P cannot find or attach any file outside the tree's first 50 entries even after the user types an exact query.
- **Fix:** Keep an uncapped flattened search corpus and apply `MAX_EMPTY_FILE_ITEMS` only to the empty-query result, then cap matched render results after scoring.
- **Evidence:** `allEntries` always calls `buildEntries(..., LAYOUT.MAX_EMPTY_FILE_ITEMS)` at lines 170-175, so the later non-empty-query filter at lines 177-191 never sees later files; the comment says the cap is only for empty queries, while `command-palette-screen.test.ts` only verifies that `buildEntries` respects a supplied cap.
- **Confidence:** High — Evidence.

## [MEDIUM] Performance — cli/src/hooks/use-suggestion-engine.ts:641 — Every new @ session rebuilds the project tree

- **Risk:** Typing `@` after closing a prior mention session triggers a fresh traversal/stat of up to 10,000 files, causing avoidable input latency and filesystem churn on large repositories.
- **Fix:** Serve the existing `fileTree` immediately, refresh through a TTL/versioned background cache or index-backed path list, and invalidate from known filesystem/index events rather than every inactive-to-active transition.
- **Evidence:** the effect at lines 665-671 invokes `refreshFileSuggestions()` whenever `mentionContext.active` becomes true; that calls `getProjectFileTree` at lines 641-657, whose implementation in `common/src/project-file-tree.ts:140-229` breadth-first reads directories and stats entries up to `DEFAULT_MAX_FILES = 10_000`.
- **Confidence:** High — Evidence.

## [MEDIUM] Error handling — cli/src/commands/router.ts:76 — Interactive bash jobs have no timeout or cancellation path

- **Risk:** A command such as `!tail -f`, a hung subprocess, or a prompt-waiting program can remain running indefinitely, leave a permanent pending card, and cannot be stopped by the CLI's normal response-interrupt controls.
- **Fix:** Run interactive bash commands as cancellable jobs with an AbortSignal/job id, expose a Stop action and bounded default timeout, and reserve an explicit detach/background command for intentional long-running work.
- **Evidence:** `runBashCommand` calls `runTerminalCommand` with `process_type: 'SYNC'` and `timeout_seconds: -1` at lines 76-82 and retains only a UI message id, not a process/job handle; `PendingBashMessage` renders status text only, and `bash-command.test.ts` asserts state transitions but has no timeout/cancel test.
- **Confidence:** High — Evidence.

## [MEDIUM] Security — cli/src/commands/command-registry.ts:352 — Convenience git commands interpolate raw shell arguments

- **Risk:** `/diff` and `/changes` look like constrained git helpers but accept shell metacharacters and command substitution, so pasted or suggested arguments can execute unrelated local commands.
- **Fix:** Parse an allowlist of git flags/pathspecs and invoke git with an argv-based process API, or clearly route advanced users to explicit bash mode instead of concatenating strings.
- **Evidence:** `/diff` builds `git diff ${trimmedArgs}` at lines 352-359 and `/changes` builds `git status ${trimmedArgs}` at lines 363-371 before passing the string to the shell-backed `runBashCommand`; their registry descriptions promise only diff/status behavior in `cli/src/data/slash-commands.ts:169-177`.
- **Confidence:** High — Evidence.

## [MEDIUM] State mutation — cli/src/hooks/use-input-history.ts:65 — Cross-terminal history writes can lose prompts

- **Risk:** Two Openbuff processes saving near-simultaneously can both read the same history snapshot and overwrite each other, despite the code explicitly attempting cross-terminal history support.
- **Fix:** Use an append-only journal or an inter-process lock plus atomic temp-file rename, then reload/deduplicate after the committed write.
- **Evidence:** `saveToHistory` re-reads disk then constructs `[...diskHistory, message]` at lines 65-75, while `saveMessageHistory` rewrites the entire JSON file synchronously at `cli/src/utils/message-history.ts:106-123`; there is no lock, compare-and-swap, or append operation.
- **Confidence:** High — Evidence.

## [MEDIUM] Performance — cli/src/utils/pending-attachments.ts:347 — “Background” attachment loading still blocks the renderer thread

- **Risk:** Attaching a large directory or many files can freeze keyboard input because the deferred callback performs synchronous `readdirSync`, sorting, `statSync`, `readFileSync`, UTF-8 conversion, and store updates on the main event loop.
- **Fix:** Move attachment inspection to async filesystem APIs or a worker, cap work before sorting/reading, and report progressive/cancellable processing for batches.
- **Evidence:** line 347 describes asynchronous reading via `setTimeout`, but lines 354-438 execute synchronous directory enumeration, full sorting, stats, reads up to 1 MB, binary scanning, and conversion; the send route blocks while any file remains `processing` at `cli/src/commands/router.ts:467-472`.
- **Confidence:** High — Evidence.

## [LOW] Security — cli/src/utils/clipboard-image.ts:18 — Clipboard images accumulate as persistent plaintext temp files

- **Risk:** Screenshots and copied images can contain secrets and remain indefinitely in a predictable shared temp directory after removal, sending, or process exit.
- **Fix:** Use a per-process mode-0700 temp directory with restrictive file permissions and delete owned files on attachment removal, successful capture/send, startup TTL cleanup, and graceful exit.
- **Evidence:** `getClipboardTempDir` creates `${os.tmpdir()}/codebuff-clipboard-images` at lines 18-23 and platform readers write timestamped PNGs there (for example lines 175-201); repository search finds no production cleanup for that directory or its files.
- **Confidence:** High — Evidence.

## [LOW] Test coverage gaps — cli/src/components/help-banner.tsx:59 — Help omits major implemented interaction shortcuts

- **Risk:** Users cannot discover Ctrl+P palette, Ctrl+R prompt search, Ctrl+V attachments, Shift+Enter, Tab completion/mode switching, or PageUp/PageDown from the built-in help, weakening learnability and making shortcut behavior feel inconsistent.
- **Fix:** Generate help rows from a shared shortcut registry used by keyboard classification, include platform-specific labels, and add a contract test that every user-facing global action has help metadata.
- **Evidence:** `HelpBanner` lists only Ctrl+C/Esc, Ctrl+J/Opt+Enter, arrows, Ctrl+T, `/`, `@`, and `!` at lines 59-105, while `keyboard-actions.ts` implements Ctrl+P, Ctrl+R, Ctrl+V, Tab/Shift+Tab, and PageUp/PageDown and `MultilineInput` implements Shift+Enter and additional editing bindings.
- **Confidence:** High — Evidence.

## [LOW] API/ABI contract breaks — cli/src/utils/clipboard-image.ts:18 — Clipboard storage retains the legacy Codebuff namespace

- **Risk:** Openbuff writes new runtime artifacts under `codebuff-clipboard-images`, complicating support, cleanup, migration expectations, and privacy documentation for a renamed CLI.
- **Fix:** Move to an Openbuff-named temp namespace with one-time cleanup of the legacy directory and document the temporary-file lifecycle.
- **Evidence:** the current directory literal is `codebuff-clipboard-images` at line 19, while `docs/architecture.md` states `openbuff` is the primary CLI identity and retained Codebuff compatibility aliases are intentionally narrow.
- **Confidence:** High — Evidence.

## Strengths observed

- Keyboard classification is centralized and extensively unit-tested, with explicit priority ordering for modal input, streaming interruption, menus, history, queueing, and exit behavior.
- Attachment processing now records provenance/completeness, blocks mandatory sensitive paths for project file mentions, caps previews, detects binary content, and warns the model when supplied context is incomplete.
- Slash commands have a unified registry, aliases, typo suggestions, generated skill/game presets, and a command palette plus prompt-history search rather than relying only on memorized command names.
- Image handling has per-file and aggregate size controls, compression attempts, terminal fallbacks, and provider-boundary normalization tests.
- Dependency versions for the core terminal renderer are pinned consistently in `cli/package.json`, and the interaction surface has substantial focused test coverage.

## Coverage / files actually read

Evaluated all eight audit domains across the manifest's five subshards: Security, Correctness, State mutation, Error handling, Performance, Dependency hygiene, Test coverage gaps, and API/ABI contract breaks. Read or inspected bounded ranges/diffs/search evidence from: `cli/src/chat.tsx`; `cli/src/components/chat-input-bar.tsx`, `multiline-input.tsx`, `input-cursor.tsx`, `input-mode-banner.tsx`, `help-banner.tsx`, `suggestion-menu.tsx`, `command-palette-screen.tsx`, `prompt-history-search-screen.tsx`, `pending-bash-message.tsx`, `pending-attachments-banner.tsx`, attachment/image cards and blocks; `cli/src/hooks/use-chat-input.ts`, `use-chat-keyboard.ts`, `use-suggestion-engine.ts`, `use-input-history.ts`, `use-path-tab-completion.ts`, `use-clipboard.ts`, `use-send-message.ts`, and `hooks/helpers/send-message.ts`; `cli/src/utils/keyboard-actions.ts`, `path-completion.ts`, `chat-history.ts`, `message-history.ts`, `bash-context-processor.ts`, `bash-messages.ts`, `input-modes.ts`, `clipboard.ts`, `clipboard-image.ts`, `image-handler.ts`, `image-processor.ts`, `pending-attachments.ts`, image display/thumbnail/terminal helpers; `cli/src/data/slash-commands.ts`; `cli/src/commands/command-registry.ts`, `router.ts`, `router-utils.ts`, `help.ts`, `image.ts`, prompt/plan/index/init/info command integrations; `cli/src/state/chat-store.ts`; `cli/src/types/store.ts`, `chat.ts`, and send-message contract; `common/src/project-file-tree.ts`, engine profiles and game presets; `sdk/src/impl/chatgpt-backend-fetch.ts`; the manifest-listed keyboard, suggestions/history, command/bash, clipboard/image, attachment, and send-message tests; and `docs/architecture.md`, `docs/request-flow.md`, `docs/agents-and-tools.md`, `docs/testing.md`, `README.md`, `WINDOWS.md`, `cli/package.json`, and relevant lockfile entries. Existing `.agents/sessions/*` audit artifacts were not read.
