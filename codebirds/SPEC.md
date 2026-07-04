# Freebuff Spec

Freebuff is a free-only variant of the Codebirds CLI, distributed as a separate npm package (`codebirds`). It reuses the entire `cli/` package but builds with a compile-time flag that strips out paid features, subscription logic, credits display, and mode switching — leaving only the FREE mode experience.

---

## 1. Build-Time Flag

### Environment Variable

- **`CODEBIRDS_MODE=true`** — set during the build to produce a Freebuff binary.
- Injected via `--define process.env.CODEBIRDS_MODE="true"` in `bun build`, following the same pattern as `CODEBIRDS_IS_BINARY` and `CODEBIRDS_CLI_VERSION`.

### Runtime Constant

Create a shared constant in `cli/src/utils/constants.ts`:

```ts
export const IS_CODEBIRDS = process.env.CODEBIRDS_MODE === 'true'
```

This enables dead-code elimination in production builds — all `if (!IS_CODEBIRDS)` branches are removed by the bundler.

---

## 2. Branding Changes

| Area                  | Codebirds                                                       | Freebuff                                                       |
| --------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| Terminal title prefix | `Codebirds: `                                                   | `Freebuff: `                                                   |
| CLI commander name    | `codebirds`                                                     | `codebirds`                                                     |
| npm package name      | `codebirds`                                                     | `codebirds`                                                     |
| Binary name           | `codebirds`                                                     | `codebirds`                                                     |
| App header text       | "Codebirds will run commands on your behalf to help you build." | "Freebuff will run commands on your behalf to help you build." |
| ASCII logo            | `CODEBUFF` block letters                                       | `CODEBIRDS` block letters (new logo)                            |
| Description           | "AI coding agent"                                              | "Free AI coding assistant"                                     |
| Homepage              | codebirds.com                                                   | codebirds.com/free (or same)                                    |
| `WEBSITE_URL` usage   | Points to codebirds.com                                         | Same (login, feedback, etc. stay on codebirds.com)              |

### Files to modify (conditional on `IS_CODEBIRDS`)

- **`cli/src/utils/terminal-title.ts`** — Change `TITLE_PREFIX` from `'Codebirds: '` to `'Freebuff: '` when `IS_CODEBIRDS`.
- **`cli/src/login/constants.ts`** — Add a `LOGO_CODEBIRDS` ASCII art variant, select based on `IS_CODEBIRDS`.
- **`cli/src/app.tsx`** — Conditional header text ("Freebuff will run commands...").
- **`cli/src/index.tsx`** — Change commander `.name('codebirds')` and `.description(...)` when `IS_CODEBIRDS`.

---

## 3. Mode Restrictions

Freebuff only supports **FREE mode**. All mode-related features are stripped.

### Behavior

- `agentMode` is always `'FREE'` and never changes.
- The initial mode flag (`--free`, `--max`, `--plan`) CLI options are removed in Freebuff; mode is hardcoded.
- No mode divider messages are ever inserted into chat history.

### Files to modify

- **`cli/src/utils/constants.ts`** — When `IS_CODEBIRDS`, export a single-element `AGENT_MODES = ['FREE']` and `AGENT_MODE_TO_ID` with only the FREE entry. Or: the mode toggle component simply never renders.
- **`cli/src/components/agent-mode-toggle.tsx`** — Return `null` when `IS_CODEBIRDS` (hide entirely).
- **`cli/src/components/build-mode-buttons.tsx`** — Return `null` when `IS_CODEBIRDS` (hides mode-switching buttons in message UI).
- **`cli/src/components/mode-divider.tsx`** — Return `null` when `IS_CODEBIRDS` (no mode transition markers).
- **`cli/src/utils/input-modes.ts`** — Set `showAgentModeToggle: false` for all input mode configs when `IS_CODEBIRDS`.
- **`cli/src/index.tsx`** — Remove `--free`, `--max`, `--plan`, `--lite` CLI flags when `IS_CODEBIRDS`; hardcode `initialMode = 'FREE'`.
- **`cli/src/state/chat-store.ts`** — Default `agentMode` to `'FREE'`; make `setAgentMode` a no-op when `IS_CODEBIRDS`.

---

## 4. Slash Commands

### Commands to REMOVE in Freebuff

| Command                                            | Reason                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/subscribe` (+ `/strong`, `/sub`, `/buy-credits`) | No subscription model                                                                          |
| `/usage` (+ `/credits`)                            | No credits display                                                                             |
| `/ads:enable`                                      | Ads always on, not toggleable                                                                  |
| `/ads:disable`                                     | Ads always on, not toggleable                                                                  |
| `/connect:claude` (+ `/claude`)                    | Claude subscription not available                                                              |
| `/refer-friends` (+ `/referral`, `/redeem`)        | Referrals earn credits, not applicable                                                         |
| `/mode:*` (all mode commands)                      | Only FREE mode                                                                                 |
| `/agent:gpt-5`                                     | Premium agent, not available in free tier                                                      |
| `/review`                                          | Uses thinker-gpt under the hood                                                                |
| `/publish`                                         | Agent publishing not available in free tier                                                    |
| `/image` (+ `/img`, `/attach`)                     | Image attachments unavailable with free models (Kimi K2.6, DeepSeek V4 Pro, DeepSeek V4 Flash) |

### Commands to KEEP

| Command                                   | Notes                          |
| ----------------------------------------- | ------------------------------ |
| `/help`                                   | Modified help content (see §6) |
| `/new` (+ `/clear`, `/reset`, `/n`, `/c`) | Clear conversation             |
| `/history` (+ `/chats`)                   | Browse past conversations      |
| `/feedback` (+ `/bug`, `/report`)         | Share feedback                 |
| `/bash` (+ `/!`)                          | Bash mode                      |
| `/theme:toggle`                           | Light/dark toggle              |
| `/logout` (+ `/signout`)                  | Sign out                       |
| `/exit` (+ `/quit`, `/q`)                 | Quit                           |
| `/login` (+ `/signin`)                    | Already-logged-in message      |
| Skill commands (`/skill:*`)               | Keep if skills are loaded      |

### Implementation

- **`cli/src/data/slash-commands.ts`** — Filter `SLASH_COMMANDS` based on `IS_CODEBIRDS`. Remove mode commands, subscription commands, credits commands, ads commands, referral, review, publish, and gpt-5 agent commands.
- **`cli/src/commands/command-registry.ts`** — Filter `COMMAND_REGISTRY` similarly. Wrap removed commands in `!IS_CODEBIRDS` guards.

---

## 5. Credits & Subscription UI

Freebuff never displays credits, usage, subscription info, or out-of-credits states.

### Components to suppress (render `null` when `IS_CODEBIRDS`)

| Component                  | File                                       | Behavior                                                                 |
| -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| `UsageBanner`              | `components/usage-banner.tsx`              | Never rendered                                                           |
| `OutOfCreditsBanner`       | `components/out-of-credits-banner.tsx`     | Never rendered                                                           |
| `SubscriptionLimitBanner`  | `components/subscription-limit-banner.tsx` | Never rendered                                                           |
| `BottomStatusLine`         | `components/bottom-status-line.tsx`        | Never rendered (Claude subscription status)                              |
| Credits in `MessageFooter` | `components/message-footer.tsx`            | Remove `CreditsOrSubscriptionIndicator` — no credits or "✓ Strong" shown |
| `ClaudeConnectBanner`      | `components/claude-connect-banner.tsx`     | Never rendered                                                           |

### Input modes to disable

When `IS_CODEBIRDS`, these input modes should be unreachable:

- `outOfCredits` — never triggered
- `subscriptionLimit` — never triggered
- `usage` — no `/usage` command
- `connect:claude` — no `/connect:claude` command
- `referral` — no `/refer-friends` command

### Hooks to disable/skip

- **`use-usage-monitor.ts`** — Return early when `IS_CODEBIRDS` (no credits to monitor).
- **`use-subscription-query.ts`** — Return empty/disabled when `IS_CODEBIRDS`.
- **`use-claude-quota-query.ts`** — Return empty/disabled when `IS_CODEBIRDS`.
- **`use-usage-query.ts`** — Still needed for server-side billing, but UI never shows it.

### Session credits tracking

- `sessionCreditsUsed` in `chat-store.ts` still accumulates (server tracks usage), but the UI never displays it.
- The `chat.tsx` ad banner continues to pass `isFreeMode={true}` (hardcoded).

---

## 6. Help Menu

The `/help` banner in Freebuff should be simplified. Remove the **Credits** section entirely.

### Freebuff Help Content

```
Shortcuts
  Ctrl+C / Esc  stop
  Ctrl+J / Opt+Enter  newline
  ↑↓  history
  Ctrl+T  collapse/expand agents

Features
  /  commands
  @files  mention
  @agents  use agent
  !bash  run command
```

No "Credits" section. No `/subscribe`, `/usage`, or `/ads:enable` references.

### File to modify

- **`cli/src/components/help-banner.tsx`** — Conditionally hide the Credits section when `IS_CODEBIRDS`.

---

## 7. Ads Behavior

In Freebuff, ads are **always enabled** and **cannot be disabled**.

- The ad banner always renders (when an ad is available).
- The "Hide ads" link in the info panel is replaced with "Ads are required in Free mode." (this already exists in `ad-banner.tsx` when `isFreeMode` is true).
- The `/ads:enable` and `/ads:disable` commands are removed (see §4).
- `getAdsEnabled()` always returns `true` when `IS_CODEBIRDS`.

### Files to modify

- **`cli/src/commands/ads.ts`** — `getAdsEnabled()` returns `true` unconditionally when `IS_CODEBIRDS`.
- **`cli/src/chat.tsx`** — Skip the `!hasSubscription` guard for ads when `IS_CODEBIRDS`; always show.

---

## 8. Build & Release

### Directory Structure

The `codebirds/` directory is organized as a product-level directory with subdirectories for each surface (CLI, web, etc.):

```
codebirds/
├── SPEC.md           # This file (product-level spec)
├── README.md         # Product-level documentation
├── cli/              # CLI build & release infrastructure
│   ├── build.ts      # Build script that sets CODEBIRDS_MODE=true
│   └── release/
│       ├── package.json  # npm package metadata (name: "codebirds")
│       ├── index.js      # Entry point (finds/runs binary)
│       ├── postinstall.js# Downloads platform binary on install
│       └── README.md     # npm package README
└── web/              # (Future) Freebuff website code
```

This structure allows `codebirds/web/` (or other surfaces) to be added alongside the CLI without restructuring.

### Build Script (`codebirds/cli/build.ts`)

Wraps `cli/scripts/build-binary.ts` with:

```bash
CODEBIRDS_MODE=true bun cli/scripts/build-binary.ts codebirds <version>
```

The existing `build-binary.ts` already supports a custom binary name argument and passes `NEXT_PUBLIC_*` env vars. We add `CODEBIRDS_MODE` to the `defineFlags` array in `build-binary.ts`.

### Release Package (`codebirds/cli/release/package.json`)

Mirrors `cli/release/package.json` but with:

- `"name": "codebirds"`
- `"description": "Free AI coding assistant"`
- `"bin": { "codebirds": "index.js" }`
- Same `postinstall.js` pattern (downloads platform-specific binary from GitHub releases)
- Binary stored at `~/.config/manicode/codebirds` (or `codebirds.exe` on Windows)

### GitHub Workflow

New file: `.github/workflows/codebirds-release.yml`

Mirrors `cli-release-prod.yml` with these changes:

- **Trigger**: `workflow_dispatch` (manual) or scheduled
- **Binary name**: `codebirds`
- **Version source**: `codebirds/cli/release/package.json`
- **Git tags**: `codebirds-v<version>`
- **npm publish**: `codebirds` package
- **Environment overrides**: `{"CODEBIRDS_MODE": "true", "NEXT_PUBLIC_CB_ENVIRONMENT": "prod"}`
- **GitHub Release**: Creates releases in `CodebirdsAI/codebirds-community` (or a separate repo)

---

## 9. Changes to `cli/scripts/build-binary.ts`

Add `CODEBIRDS_MODE` to the define flags so it's available at compile time:

```ts
const defineFlags = [
  ['process.env.NODE_ENV', '"production"'],
  ['process.env.CODEBIRDS_IS_BINARY', '"true"'],
  ['process.env.CODEBIRDS_CLI_VERSION', `"${version}"`],
  [
    'process.env.CODEBIRDS_CLI_TARGET',
    `"${targetInfo.platform}-${targetInfo.arch}"`,
  ],
  // Freebuff mode flag
  ['process.env.CODEBIRDS_MODE', `"${process.env.CODEBIRDS_MODE ?? 'false'}"`],
  ...nextPublicEnvVars,
]
```

---

## 10. Features That Stay Unchanged

These features work identically in Freebuff:

- **Authentication** — Login/logout flow, API key storage
- **Chat** — Message history, streaming, agent spawning
- **File mentions** (`@files`) — Browse and attach files
- **Agent mentions** (`@agents`) — Use available agents (free-tier agents only)
- **Bash mode** — Run terminal commands
- **Image attachments** — Attach and paste images
- **Knowledge files** — `knowledge.md`
- **Chat history** — `/history`, resume conversations
- **Feedback** — `/feedback` command
- **Theme** — Light/dark toggle
- **Skills** — Loaded from `.agents/skills`
- **Local agents** — Loaded from `.agents/` directory

---

## 11. Analytics

When `IS_CODEBIRDS`:

- `APP_LAUNCHED` event includes `isFreebuff: true`
- All existing analytics events continue to fire (helps understand free vs paid usage)
- No new analytics events needed initially

---

## 12. Server-Side Considerations

The server already handles FREE mode correctly:

- `isFreeMode(costMode)` in `common/src/constants/free-agents.ts` recognizes the `'free'` cost mode
- `AGENT_MODE_TO_COST_MODE.FREE === 'free'` is already set
- Free-mode-allowed agent+model combos cost 0 credits
- Ad impressions in FREE mode already don't grant credits

No server-side changes are needed for Freebuff, **except** the release download API (`/api/releases/download/`) must be configured to serve `codebirds-*` binary tarballs. This may require updating the download route to recognize Freebuff release tags (`codebirds-v*`).

---

## 13. Testing Strategy

### Unit Tests

- Test that `IS_CODEBIRDS` guards correctly hide/show components
- Test filtered slash commands list
- Test filtered command registry
- Test help banner content

### Integration Tests

- Build a Freebuff binary and verify:
  - Title says "Freebuff"
  - No mode toggle visible
  - `/subscribe`, `/usage` commands not found
  - Help menu has no Credits section
  - Ads always show

### E2E (tmux)

- Use `codebirds-local-cli` agent with `CODEBIRDS_MODE=true` to verify visual output

---

## 14. Implementation Phases

### Phase 1: Core Flag & Branding

1. Add `IS_CODEBIRDS` constant
2. Update `build-binary.ts` to pass through `CODEBIRDS_MODE`
3. Conditional branding (title, logo, app header, CLI name)

### Phase 2: Feature Stripping

4. Filter slash commands and command registry
5. Hide agent mode toggle
6. Suppress credits/subscription UI components
7. Disable usage monitor hook
8. Simplify help banner

### Phase 3: Ads & Cleanup

9. Always-on ads behavior
10. Disable unreachable input modes
11. Hide `BuildModeButtons` and `ModeDivider` components

### Phase 4: Build & Release Infrastructure

11. Create `codebirds/cli/release/` package files
12. Create `codebirds/cli/build.ts` script
13. Create `.github/workflows/codebirds-release.yml`

### Phase 5: Testing

14. Add unit tests for IS_CODEBIRDS guards
15. Add integration/E2E tests
16. Manual QA of built binary
