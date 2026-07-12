# Interaction and commands file-picker manifest

## Scope

Independent source map for the CLI's conversational input surface: chat/input composition, terminal keyboard behavior, slash-command discovery and routing, bash mode, prompt history/completion/suggestions, attachments/images/clipboard, and user-facing help/discoverability. This is a file-selection manifest only; it contains no quality judgments or feature recommendations.

The primary surface is large enough to split before auditing. Groups below are intentionally bounded to roughly 5–15 primary files. Tests and documentation are listed separately so an auditor can verify contracts without silently expanding a source shard.

## Subshard IC-1 — Input widget and terminal-key dispatch

Primary files (8; approximately 4.5k LOC, **over the ~3k LOC target — split `chat.tsx` into its own review pass if context is tight**):

- `cli/src/chat.tsx`
- `cli/src/components/chat-input-bar.tsx`
- `cli/src/components/multiline-input.tsx`
- `cli/src/components/input-cursor.tsx`
- `cli/src/components/input-mode-banner.tsx`
- `cli/src/hooks/use-chat-input.ts`
- `cli/src/hooks/use-chat-keyboard.ts`
- `cli/src/utils/keyboard-actions.ts`

Key symbols / flows:

- `Chat` composes input state, overlay state, suggestion state, command routing, clipboard status, and global keyboard handlers.
- `ChatInputBar` renders the active input mode, previews, suggestions, and `MultilineInput`.
- `MultilineInput` owns cursor movement, editing, paste/IME handling, printable-key normalization, selection, wrapping, and newline shortcuts.
- `useChatKeyboard` maps global terminal events to `ChatKeyboardHandlers`; `dispatchAction` bridges classified actions to UI behavior.
- `keyboard-actions.ts` classifies keys by mode and interaction state; `useChatInput` provides input sizing and build/send helpers.

Related tests:

- `cli/src/components/__tests__/multiline-input.test.tsx`
- `cli/src/hooks/__tests__/use-chat-input.test.ts`
- `cli/src/utils/__tests__/keyboard-actions.test.ts`
- `cli/src/utils/__tests__/chat-input-key-intercept.test.ts`
- `cli/src/utils/__tests__/terminal-enter-detection.test.ts`
- `cli/src/hooks/__tests__/use-terminal-layout.test.ts`

## Subshard IC-2 — Suggestions, mentions, completion, and prompt history

Primary files (10; approximately 2.6k LOC):

- `cli/src/hooks/use-suggestion-engine.ts`
- `cli/src/hooks/use-input-history.ts`
- `cli/src/hooks/use-path-tab-completion.ts`
- `cli/src/components/suggestion-menu.tsx`
- `cli/src/components/command-palette-screen.tsx`
- `cli/src/components/prompt-history-search-screen.tsx`
- `cli/src/utils/path-completion.ts`
- `cli/src/utils/chat-history.ts`
- `cli/src/project-files.ts`
- `cli/src/hooks/use-searchable-list.ts`

Key symbols / flows:

- `useSuggestionEngine` parses `/` and `@` trigger contexts, ranks slash commands, agents, and project files, and returns selection state.
- `usePathTabCompletion` delegates filesystem/path expansion to `path-completion.ts`.
- `useInputHistory` navigates persisted prompt entries; `PromptHistorySearchScreen` provides fuzzy full-screen retrieval.
- `CommandPaletteScreen` builds searchable command and file entries from `SlashCommand[]` plus the project file tree.
- `project-files.ts` supplies the file tree used by mention matching, palette entries, and generated game-development commands.

Related tests:

- `cli/src/hooks/__tests__/use-suggestion-engine.test.ts`
- `cli/src/hooks/__tests__/use-suggestion-engine-mention.test.ts`
- `cli/src/hooks/__tests__/use-input-history.test.ts`
- `cli/src/hooks/__tests__/use-path-tab-completion.test.ts`
- `cli/src/__tests__/path-completion.test.ts`
- `cli/src/components/__tests__/command-palette-screen.test.ts`
- `cli/src/components/__tests__/prompt-history-search-screen.test.ts`
- `cli/src/data/__tests__/slash-commands.test.ts`

## Subshard IC-3 — Slash-command registry, routing, help, and bash mode

Primary files (11; approximately 2.8k LOC):

- `cli/src/data/slash-commands.ts`
- `cli/src/commands/command-registry.ts`
- `cli/src/commands/router.ts`
- `cli/src/commands/router-utils.ts`
- `cli/src/commands/help.ts`
- `cli/src/commands/image.ts`
- `cli/src/commands/prompt-builders.ts`
- `cli/src/utils/bash-context-processor.ts`
- `cli/src/utils/bash-messages.ts`
- `cli/src/components/pending-bash-message.tsx`
- `cli/src/utils/input-modes.ts`

Key symbols / flows:

- `SLASH_COMMANDS`, `SLASHLESS_COMMAND_IDS`, and `getSlashCommandsWithSkills` define discoverable command metadata, aliases, implicit commands, skill commands, and engine presets.
- `COMMAND_REGISTRY`, `findCommand`, and `findCommandSuggestions` define executable handlers and argument-aware resolution.
- `routeUserPrompt` distinguishes normal prompts, slash/implicit commands, queueing, and bash execution; `runBashCommand` and `addBashMessageToHistory` feed terminal results back into conversation context.
- `processBashContext`, `buildBashHistoryMessages`, and `formatBashContextForPrompt` translate local shell activity into model-visible message content.
- `help.ts` and command descriptions are the main built-in discoverability contract; `input-modes.ts` defines mode labels/behavior including bash/image/feedback modes.

Related integration files:

- `common/src/util/engine-profiles.ts`
- `common/src/util/game-dev-presets.ts`
- `cli/src/commands/plan-artifacts.ts`
- `cli/src/commands/plan-timeline.ts`
- `cli/src/commands/index-command.ts`
- `cli/src/commands/init.ts`
- `cli/src/commands/info.ts`

Related tests:

- `cli/src/commands/__tests__/command-args.test.ts`
- `cli/src/commands/__tests__/command-suggestions.test.ts`
- `cli/src/commands/__tests__/router-input.test.ts`
- `cli/src/commands/__tests__/bash-command.test.ts`
- `cli/src/__tests__/bash-mode.test.ts`
- `cli/src/utils/__tests__/bash-context-processor.test.ts`
- `cli/src/commands/__tests__/image.test.ts`
- `cli/src/commands/__tests__/plan-timeline.test.ts`

## Subshard IC-4 — Clipboard and attachment ingestion

Primary files (12; approximately 3.2k LOC, **likely just over the ~3k LOC target — split platform clipboard code from attachment state if needed**):

- `cli/src/hooks/use-clipboard.ts`
- `cli/src/utils/clipboard.ts`
- `cli/src/utils/clipboard-image.ts`
- `cli/src/utils/image-handler.ts`
- `cli/src/utils/image-processor.ts`
- `cli/src/utils/pending-attachments.ts`
- `cli/src/state/chat-store.ts`
- `cli/src/types/store.ts`
- `cli/src/components/pending-attachments-banner.tsx`
- `cli/src/components/attachment-card.tsx`
- `cli/src/components/file-attachment-card.tsx`
- `cli/src/components/text-attachment-card.tsx`

Key symbols / flows:

- `useClipboard` registers the renderer and exposes transient copy/paste status; `clipboard.ts` selects platform tools, renderer APIs, or OSC52 for copy operations.
- `clipboard-image.ts` detects and reads image/file/text clipboard payloads across macOS, Linux, and Windows.
- `processImageFile`, `extractImagePaths`, and `processImagesForMessage` validate/compress image inputs and translate them into SDK message content.
- `pending-attachments.ts` creates, validates, de-duplicates, updates, and captures image/text/file attachments; `ChatStoreState.pendingAttachments` is the shared lifecycle state.
- Attachment banners/cards render processing, ready, partial, and error states before send.

Related tests:

- `cli/src/utils/__tests__/clipboard.test.ts`
- `cli/src/utils/__tests__/image-processor.test.ts`
- `cli/src/utils/__tests__/image-dimensions.test.ts`
- `cli/src/utils/__tests__/pending-attachments.test.ts`

## Subshard IC-5 — Image rendering and message/SDK handoff

Primary files (11; approximately 2.5k LOC):

- `cli/src/components/image-card.tsx`
- `cli/src/components/image-thumbnail.tsx`
- `cli/src/components/blocks/image-block.tsx`
- `cli/src/utils/image-display.ts`
- `cli/src/utils/image-thumbnail.ts`
- `cli/src/utils/terminal-images.ts`
- `cli/src/hooks/use-send-message.ts`
- `cli/src/hooks/helpers/send-message.ts`
- `cli/src/types/chat.ts`
- `cli/src/types/contracts/send-message.ts`
- `sdk/src/impl/chatgpt-backend-fetch.ts`

Key symbols / flows:

- Image cards/blocks and terminal helpers choose inline image rendering, thumbnails, or textual fallback according to terminal support and dimensions.
- `useSendMessage` coordinates queue/run state; `prepareUserMessage` and the send helper collect pending bash context and attachments before calling the SDK.
- `PendingAttachment` variants become SDK `MessageContent`; `ChatMessage`/`ContentBlock` types retain the user-visible transcript representation.
- `chatgpt-backend-fetch.ts` is a provider-specific boundary that normalizes `image_url` parts and should be checked alongside the generic SDK message contract.

Related tests:

- `cli/src/hooks/helpers/__tests__/send-message.test.ts`
- `cli/src/utils/__tests__/send-message-helpers.test.ts`
- `cli/src/components/__tests__/message-block.completion.test.tsx`
- `cli/src/components/__tests__/message-block.streaming.test.tsx`

## Documentation and user-facing contract references

- `docs/request-flow.md` — authoritative CLI-to-SDK message preparation flow, including bash context and attachments.
- `docs/agents-and-tools.md` (especially “Slash Commands”) — documented registry, aliases, implicit commands, skills, and generated presets.
- `docs/architecture.md` — TUI ownership and high-level command/input responsibilities.
- `docs/testing.md` — expected TUI/tmux validation approach.
- `README.md` and `WINDOWS.md` — installation/platform expectations relevant to clipboard, shell, and terminal interaction.
- `cli/package.json` — terminal/image/clipboard runtime dependencies and CLI test scripts.

## Explicit exclusions

- Provider/model setup, auth/connect screens, project picker, and route picker except where they reuse `MultilineInput`; those belong to onboarding/configuration shards.
- Chat transcript rendering, tool blocks, streaming lifecycle, scrolling, and collapse behavior except the image/message-handoff files explicitly listed above.
- Durable-plan semantics, indexer behavior, agent runtime/tool execution, and SDK provider correctness beyond their direct command or message-content boundary.
- Generated agent bundles such as `cli/src/data/initial-agent-type-sources.generated.ts`.
- `node_modules`, build outputs, release artifacts, snapshots, and existing audit findings/session reports.
- Specialized modal inputs (`ask-user`, feedback, publish) except shared input-mode definitions; they should be reviewed with their owning feature shards to avoid duplication.
