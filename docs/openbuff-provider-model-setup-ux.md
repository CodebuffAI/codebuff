# Openbuff Provider & Model Setup UX Proposal

> **Quick verdict:** Yes, this is a viable and high-impact improvement. The biggest win is not "arrow keys instead of typing numbers" — it is making routing visible, editable in one place, and offering recommended presets that auto-configure everything after connecting a provider.

## Scope: Openbuff / BYOK only

This proposal applies to **Openbuff (bring-your-own-key) mode**. Freebuff already has a dedicated model selection flow (`FreebuffModelSelector`, `/model` alias, session model choice) and does not expose provider configuration. In Freebuff mode, `/setup` should either route to the existing Freebuff model picker or explain that provider setup requires Openbuff/BYOK.

## Problem Statement

Openbuff's provider and model routing configuration is powerful but confusing for users. Current pain points:

1. **Chat-wizard UX is linear and stateful.** `/models configure` and `/provider add` are multi-step text wizards that live inside the chat input. Users must type numbers, remember model IDs, and answer sequential prompts without seeing the full picture.

2. **"Connected but not configured" is common.** After running `/provider connect codex`, the user's OAuth token is valid but no routing exists in `openbuff.json`. The user must then separately run `/models set default codex/gpt-5.5` or `/models configure` to actually route traffic to Codex.

3. **Model routing concepts are exposed raw.** The wizard asks "What do you want to route?" and offers `default`, `mode`, `agent`, `editor-proposal`, `editor-selector` — terms that aren't intuitive for new users.

4. **No search or browse.** Model IDs like `codex/gpt-5.5` or `opencode-go/kimi-k2.6` must be typed exactly. There's no fuzzy search or browsing capability.

5. **Reasoning effort is asked every time.** The model wizard always prompts for reasoning effort, even though most users want the provider default.

## Current Architecture

### Entry Points

| Command | Behavior |
|---------|----------|
| `/provider` | Status display |
| `/provider add` | Starts text wizard (provider preset, custom) |
| `/provider add <preset>` | Writes preset config directly |
| `/provider connect codex` | Starts OAuth flow |
| `/provider disconnect codex` | Clears OAuth token |
| `/models` | Status display |
| `/models configure` | Starts text wizard |
| `/models set default <model>` | Direct config write |
| `/models set mode <mode> <model>` | Direct config write |
| `/models set agent <id> <model>` | Direct config write |
| `/models set editor-proposal <1-5> <model>` | Direct config write |
| `/models set editor-selector <model>` | Direct config write |
| `/setup <preset>` | Shorthand for `/provider add <preset>` (verify exact availability in current command registry) |

### Input Modes

Two input modes handle wizard state:

- `openbuff:provider` — provider wizard steps (provider choice → custom id → base URL → API key env → models)
- `openbuff:models` — model routing wizard steps (target → model choice → reasoning effort)

Both are implemented as state machines in `cli/src/utils/openbuff-provider.ts` using `providerWizardState` and `modelsWizardState` variables.

### Existing UI Primitives

The codebase already has reusable components for interactive selection:

- **`SelectableList`** (`cli/src/components/selectable-list.tsx`) — keyboard-navigable list with hover, focus, and scroll
- **`useSearchableList`** (`cli/src/hooks/use-searchable-list.ts`) — search filtering with focus management
- **`ChatHistoryScreen`** (`cli/src/components/chat-history-screen.tsx`) — full-screen searchable list with keyboard nav
- **`FreebuffModelSelector`** (`cli/src/components/freebuff-model-selector.tsx`) — multi-section model picker with keyboard navigation
- **MultilineInput** — reusable text input with cursor support

### Config File Format (illustrative)

`openbuff.json` (or global `provider-config.json`). The example below is representative; verify against the live schema in `sdk/src/provider-config.ts`:

```json
{
  "defaultModel": "codex/gpt-5.5",
  "modes": {
    "default": "codex/gpt-5.5",
    "lite": "codex/gpt-5.4-mini",
    "max": "codex/gpt-5.5",
    "plan": "codex/gpt-5.5"
  },
  "editorMultiPrompt": {
    "proposalModels": ["codex/gpt-5.5", "codex/gpt-5.4", "codex/gpt-5.2-chat-latest"],
    "selectorModel": "codex/gpt-5.5"
  },
  "providers": {
    "codex": {
      "type": "chatgpt-oauth",
      "models": ["gpt-5.5", "gpt-5.4", "..."]
    },
    "openai": {
      "type": "openai-compatible",
      "baseURL": "https://api.openai.com/v1",
      "apiKeyEnv": "OPENAI_API_KEY",
      "models": ["gpt-5.5", "gpt-5.4-mini"]
    }
  }
}
```

## Viability Assessment

### Is this a good idea? **Yes, absolutely.**

| Factor | Assessment |
|--------|-----------|
| User confusion | High. The current text wizard is a likely source of friction for new Openbuff users who must learn routing concepts before they can send a prompt. |
| Existing primitives | Excellent. All UI components (SelectableList, useSearchableList, keyboard handling, full-screen layouts) already exist and are proven. |
| Implementation complexity | Moderate. Main work is wiring config state to interactive screens, not building new UI primitives. |
| Risk of regressions | Low. Current text commands (`/models set`, `/provider add <preset>`) remain unchanged. New screens are additive. |
| Impact on power users | Neutral-to-positive. Text commands are preserved; screens add visual discoverability. |
| Impact on new users | Very positive. Connected → routed in 1-2 interactions instead of 5-7. |

### Key insight

The biggest UX win is not "arrow keys instead of typing numbers." It's **making routing visible and editable in one place** and **offering recommended presets that auto-configure everything.**

## Recommended Implementation

### Design: Full-Screen Setup Screen (not popup)

For terminal apps, a full-screen screen is better than a popup because:

1. Provider/model configuration has multiple sections (providers, modes, editor proposals)
2. Keyboard focus management in a small popup overlaps with chat input
3. Existing full-screen patterns (`ChatHistoryScreen`, `FreebuffModelSelector`) are well-established
4. Screens have room for status, help, and actionable sections

Recommended keyboard model (consistent with existing screens):

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate items |
| `Enter` | Select / edit |
| `Esc` | Back / cancel |
| `/` | Focus search (when in a model list) |
| `s` | Save changes |
| `r` | Reset/revert to saved |
| `a` | Add provider |
| `d` | Delete provider/route override |
| `?` | Toggle help overlay (only when not focused in a text/search input) |

### Phase 1: Post-Connect Auto-Configure

**Goal:** Eliminate the "connected but not routed" trap.

**Changes (small, high-impact):**

After `/provider connect codex` succeeds:

1. Check if a `codex` provider entry exists in loaded config
2. If not (or if no routing uses `codex/*` models):
   - Display: "Your ChatGPT subscription is connected! Route Openbuff models to it?"
   - Offer quick options:
     - **Route all modes to recommended Codex models** (writes the `codex` preset)
     - **Customize routing** (open `/models configure`)
     - **Not now** (do nothing, current behavior)
3. If yes: "Codex is connected and configured. Use `/models` to adjust routing."

This requires:
- A small post-OAuth hook in the `connect:chatgpt` input mode handler (or the command that handles `/provider connect codex`)
- A `writeProviderConfigFile` call (or equivalent helper from `cli/src/utils/openbuff-provider.ts`) with the Codex preset merged into existing config
- A simple confirm screen (3 buttons) using existing `Button` / `SelectableList` patterns

**Risk:** Very low. Only adds a prompt after successful OAuth, no existing flows change.

### Phase 2: Searchable Model Route Picker

**Goal:** Replace the `/models configure` text wizard with a full-screen navigable UI.

**New components:**

```
cli/src/components/model-setup-screen.tsx   — main dashboard + route editor
cli/src/components/model-picker-screen.tsx  — searchable model list
cli/src/components/provider-picker-screen.tsx — preset provider list
cli/src/components/reasoning-effort-picker.tsx — effort selection
cli/src/hooks/use-openbuff-config.ts         — draft config state management
```

**`ModelSetupScreen`** shows:

```
╔═ Openbuff Model Routing ═══════════════════════╗
║                                                  ║
║  Providers                                       ║
║   ✓ codex        ChatGPT subscription connected  ║
║   ! openai       OPENAI_API_KEY not set           ║
║   + Add provider                                 ║
║                                                  ║
║  Model Routing                                   ║
║   default   codex/gpt-5.5                        ║
║   lite      codex/gpt-5.4-mini                   ║
║   max       codex/gpt-5.5                        ║
║   plan      codex/gpt-5.5                        ║
║                                                  ║
║  Multi-prompt Editor                             ║
║   proposal #1  codex/gpt-5.5                     ║
║   proposal #2  codex/gpt-5.4                     ║
║   proposal #3  codex/gpt-5.2-chat-latest         ║
║   selector     codex/gpt-5.5                      ║
║                                                  ║
║  Config: openbuff.json                           ║
║                                                  ║
║  ↑↓ navigate · Enter edit · a add · d delete      ║
║  s save · r revert · Esc close                   ║
╚══════════════════════════════════════════════════╝
```

**`ModelPickerScreen`** (navigated to when editing a route):

```
╔═ Choose model for Max mode ════════════════════╗
║                                                  ║
║  Search models...                                ║
║                                                  ║
║  Codex (ChatGPT subscription)                    ║
║    codex/gpt-5.5                                 ║
║    codex/gpt-5.4                                 ║
║    codex/gpt-5.4-mini                            ║
║                                                  ║
║  OpenAI (OPENAI_API_KEY ✓)                       ║
║    openai/gpt-5.5                                ║
║    openai/gpt-5.4-mini                           ║
║                                                  ║
║  Current: codex/gpt-5.5                         ║
║  ↑↓ navigate · Enter select · Esc back           ║
╚══════════════════════════════════════════════════╝
```

Key features:
- Models are grouped by provider, showing connection status
- Search filters across provider names and model IDs
- Current value highlighted
- Missing env vars shown as warnings

**Draft config management:**

```typescript
type OpenbuffSetupDraft = {
  config: ProviderConfigFileInput
  dirty: boolean
  sourceFilePaths: string[]
}
```

- Load current config into draft on mount
- Edits mutate draft in memory
- `s` writes draft to config file
- `r` reverts to loaded config
- Esc with dirty state shows confirm before discarding

**Entry points remain compatible:**

- `/models` → status display (text, unchanged)
- `/models configure` → opens `ModelSetupScreen` (new behavior)
- `/models set ...` → direct config write (unchanged)
- `/provider` → status display (unchanged)
- `/provider add` → opens `ProviderPickerScreen` (new behavior)
- `/provider add <preset>` → direct preset write (unchanged)

### Phase 3: Provider Setup Screen

**Goal:** Replace `/provider add` text wizard with a navigable provider picker.

**`ProviderPickerScreen`:**

```
╔═ Add Provider ════════════════════════════════╗
║                                                  ║
║  Search providers...                             ║
║                                                  ║
║  Subscriptions                                   ║
║    Codex / ChatGPT        Connect via OAuth       ║
║                                                  ║
║  API Providers                                   ║
║    OpenAI                 OPENAI_API_KEY          ║
║    OpenRouter             OPENROUTER_API_KEY       ║
║    OpenCode Go            OPENCODE_GO_API_KEY     ║
║    GLM / Z.ai             GLM_API_KEY              ║
║    Ollama local           No key required          ║
║                                                  ║
║  Custom                                           ║
║    Custom OpenAI-compatible provider               ║
║                                                  ║
║  ↑↓ navigate · Enter select · Esc back            ║
╚══════════════════════════════════════════════════╝
```

For Codex selection: triggers the existing OAuth flow.
For preset selection: writes preset config, offers to open model routing.
For custom: shows a form screen for provider id, base URL, API key env, and models.

### Phase 4: Unified `/setup` Dashboard

**Goal:** Single entry point that shows everything and lets users edit anything.

```
/setup           → opens OpenbuffSetupScreen (unified dashboard)
/provider setup  → opens provider section of setup screen
/models configure → opens model routing section of setup screen
```

The unified dashboard is the Phase 2 `ModelSetupScreen` with provider management added. Sections can be collapsed/expanded via keyboard.

### Phase 5: Model Discovery (Optional)

For providers that support it, add "Fetch models" to populate the model list dynamically:

- OpenAI: `GET https://api.openai.com/v1/models`
- Ollama: `GET http://localhost:11434/v1/models` or `/api/tags`
- OpenRouter: model catalog (hardcoded list or API)

This allows users to see available models without manually entering model IDs.

## Implementation Notes

### Reusable Components

Leverage existing building blocks:

| Component | Location | Reuse |
|-----------|----------|-------|
| `SelectableList` | `cli/src/components/selectable-list.tsx` | Provider list, model list, route list |
| `useSearchableList` | `cli/src/hooks/use-searchable-list.ts` | Search/filter in all pickers |
| `MultilineInput` | `cli/src/components/multiline-input.tsx` | Search input, custom provider fields |
| `Button` | `cli/src/components/button.tsx` | Action buttons (save, add, delete) |
| `FreebuffModelSelector` | `cli/src/components/freebuff-model-selector.tsx` | Pattern for multi-section picker |
| `ChatHistoryScreen` | `cli/src/components/chat-history-screen.tsx` | Pattern for full-screen with search + list |

### State Management

Use a Zustand store for the setup screen draft state:

```typescript
// cli/src/state/openbuff-setup-store.ts
interface OpenbuffSetupState {
  draft: ProviderConfigFileInput | null
  dirty: boolean
  activeSection: 'providers' | 'routing' | 'editor' | null
  editingRoute: ModelRouteTarget | null
  
  loadDraft: () => void
  updateDraft: (patch: Partial<ProviderConfigFileInput>) => void
  saveDraft: () => string  // returns config path
  revertDraft: () => void
  clearDraft: () => void
}
```

### Input Mode

Add a new input mode to `cli/src/utils/input-modes.ts`:

```typescript
| 'openbuff:setup'
```

This is additive: the new mode hosts the interactive screen, while the existing `openbuff:provider` and `openbuff:models` text wizard modes remain available as fallbacks during rollout.

### Routing

In `cli/src/commands/router.ts`, add routing for the setup screen:

```typescript
if (inputMode === 'openbuff:setup') {
  // The setup screen handles its own keyboard events
  // via useChatKeyboard, so we don't process input here
  return
}
```

This is a conceptual sketch. The actual rendering and keyboard handling likely belong in the chat component tree and `useChatKeyboard`, similar to how `ChatHistoryScreen` is mounted today.

### Config Validation

When saving the draft, reuse `providerConfigFileSchema.safeParse()` from `sdk/src/provider-config.ts` to validate before writing. Show validation errors inline.

## Rollout Plan

| Phase | Scope | Est. Effort | Impact |
|-------|-------|-------------|--------|
| **1** | Post-connect auto-configure prompt | Small (1-2 days) | Eliminates the #1 new-user confusion |
| **2** | Searchable model route picker (`ModelSetupScreen`) | Medium (3-5 days) | Major UX improvement for all model routing |
| **3** | Provider picker screen | Medium (2-3 days) | Better than text wizard for provider setup |
| **4** | Unified `/setup` dashboard | Medium (2-3 days) | Single entry point for all config |
| **5** | Model discovery (optional) | Medium (3-5 days) | Nice-to-have for dynamic model lists |

**Recommended start:** Phase 1 (post-connect auto-configure) is the highest-ROI change. It's small, safe, and eliminates the most common failure mode for new users.

## Open Questions

1. **Should `/models configure` replace the text wizard or coexist?**  
   Recommendation: Coexist during rollout, then deprecate the text wizard once the screen is stable. Keep `/models set ...` for power users.

2. **Should the setup screen show a diff before saving?**  
   Recommendation: Yes, for Phase 4. Phase 2 can save immediately (the config is small and the user navigated to it deliberately).

3. **Should provider connect be embedded in the setup screen or stay as a separate flow?**  
   Recommendation: Keep OAuth as a separate flow (browser redirect). The setup screen shows Codex connection status and offers a "Connect" button that triggers the existing `connect:chatgpt` input mode, then returns to the setup screen after completion.

4. **Should we cache provider model lists?**  
   Recommendation: Phase 5. Start with the static model lists from provider config and presets.

5. **How should recommended presets be presented?**  
   Recommendation: After connecting a provider, offer preset routing as a quick action. For example, "Use Codex for all modes" writes the preset config directly. This is the Phase 1 auto-configure behavior.