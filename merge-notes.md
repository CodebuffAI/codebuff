# Merge Notes: origin/main into brandon/upgrade-opentui-2025-10-28

## Theme System
- Kept the upgraded dynamic theme detection from our branch to preserve neutral/transparent defaults and macOS Terminal fallbacks.
- Added static `chatThemes` export to satisfy new tests and upstream imports.
- Normalized the `ThemeColor` type to always emit string values (using `'default'` sentinel) so downstream components can rely on concrete color strings while still resolving terminal defaults via `resolveThemeColor`.

## Chat Surface (`cli/src/chat.tsx`)
- Merged upstream validation/error handling, dynamic logo sizing, and repo path link while retaining our theme cloning + subscription model.
- Swapped text rendering to use OpenTUI `wrapMode` styles instead of the untyped `wrap` prop to appease the newer JSX typings.
- Applied `resolveThemeColor` wherever theme-derived colors reach JSX to avoid passing `'default'` through to components.

## Branch Rendering (`BranchItem`, `MessageBlock`, `use-message-renderer`)
- Preserved our richer branch UI (status labels, collapse previews, raised pill) but adopted upstream support for HTML content blocks, branch graph characters, and validation messaging.
- Made `BranchItem` accept optional `branchChar` so upstream tree computation works without dropping our layout.
- Adjusted `MessageBlock` to accept theme-aware `ThemeColor` values, resolving them to concrete strings internally.
- Converted all uses of OpenTUI `<text>` to the new `style.wrapMode` pattern and reconciled color handling to avoid passing sentinel values directly to the renderer.

## Login Modal & TerminalLink
- Took upstream improvements (responsive logo via `useLogo`, sheen animation tweaks, light/dark heuristics) and merged with our theme-aware clipboard/keyboard flow.
- Added the new `isLightModeColor` helper expected by upstream tests.
- Updated `TerminalLink` to expose the new `inline` behavior and use `wrapMode` styles for compatibility with latest OpenTUI typings.

## Validation Messaging
- Adopted upstream validation block generation (`create-validation-error-blocks.tsx`, new tests) and wired it into our initial chat message creation while keeping the themed styling choices.

## Tooling & Lockfile
- Regenerated `bun.lock` via `bun install` so dependency graph matches upstream package updates.
- Verified CLI typecheck (`bun run typecheck`) and full test suite (`bun test`), ensuring tmux integration passes after resetting any lingering tmux server state.
