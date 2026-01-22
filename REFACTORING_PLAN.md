# Codebuff Refactoring Plan

This document outlines a prioritized refactoring plan for the 51 issues identified across the codebase. Issues are grouped into commits targeting ~1k LOC each, with time estimates and dependencies noted.

> **Updated based on multi-agent review feedback.** Key changes:
> - Extended timeline from 5 weeks to 7-8 weeks
> - Added 40% buffer to estimates (100-130 hours total)
> - Added rollback procedures and feature flags
> - Fixed incorrect file paths and line counts
> - Deferred low-ROI agent consolidation work
> - Added PR review time (~36 hours)
> - Added runtime metrics to success criteria

---

## Progress Tracker

> **Last Updated:** 2025-01-21 (Phase 3 Complete + Code Review Fixes + Unit Tests)
> **Current Status:** All Phases Complete ✅

### Phase 1 Progress
| Commit | Description | Status | Completed By |
|--------|-------------|--------|-------------|
| 1.1a | Extract chat state management | ✅ Complete | Codex CLI |
| 1.1b | Extract chat UI and orchestration | ✅ Complete | Codebuff |
| 1.2 | Refactor context-pruner god function | ✅ Complete | Codex CLI |
| 1.3 | Split old-constants.ts god module | ✅ Complete | Codex CLI |
| 1.4 | Fix silent error swallowing | ✅ Complete | Codex CLI |

### Phase 2 Progress
| Commit | Description | Status | Completed By |
|--------|-------------|--------|-------------|
| 2.1 | Refactor use-send-message.ts | ✅ Complete | Codebuff |
| 2.2 | Consolidate block utils + think tags | ✅ Complete | Codebuff |
| 2.3 | Refactor loopAgentSteps | ✅ Complete | Codex CLI |
| 2.4 | Consolidate billing duplication | ✅ Complete | Codex CLI |
| 2.5a | Extract multiline keyboard navigation | ✅ Complete | Codebuff |
| 2.5b | Extract multiline editing handlers | ✅ Complete | Codebuff |
| 2.6 | Simplify use-activity-query.ts | ✅ Complete | Codebuff |
| 2.7 | Consolidate XML parsing | ✅ Complete | Codebuff |
| 2.8 | Consolidate analytics | ✅ Complete | Codebuff |
| 2.9 | Refactor doStream | ✅ Complete | Codebuff |
| 2.10 | DRY up OpenRouter stream handling | ⏭️ Skipped | - |
| 2.11 | Consolidate image handling | ✅ Not Needed | - |
| 2.12 | Refactor suggestion-engine | ✅ Complete | Codebuff |
| 2.13 | Fix browser actions + string utils | ✅ Complete | Codebuff |
| 2.14 | Refactor agent-builder.ts | ✅ Complete | Codebuff |
| 2.15 | Refactor promptAiSdkStream | ✅ Complete | Codebuff |
| 2.16 | Simplify run-state.ts | ✅ Complete | Codebuff |

### Phase 3 Progress
| Commit | Description | Status | Completed By |
|--------|-------------|--------|-------------|
| 3.1 | DRY up auto-topup logic | ✅ Complete | Codebuff |
| 3.2 | Split db/schema.ts | ✅ Complete | Codebuff |
| 3.3 | Remove dead code batch 1 | ✅ Complete | Codebuff |
| 3.4 | Remove dead code batch 2 | ✅ Complete | Codebuff |

---

## Executive Summary

| Priority | Count | Original Estimate | Revised Estimate |
|----------|-------|-------------------|------------------|
| 🔴 Critical | 5 | 12-16 hours | 18-24 hours |
| 🟡 Warning | 29 | 40-52 hours | 56-70 hours |
| 🔵 Suggestion | 5 | 8-12 hours | 6-10 hours |
| ℹ️ Info | 4 | 4-6 hours | 4-6 hours |
| **PR Review Time** | 22 commits | - | 44 hours |
| **Total** | **43** | **64-86 hours** | **128-154 hours** |

### Changes from Original Plan
- **Deferred:** Commits 2.15, 2.16 (agent consolidation) - working code, unclear ROI
- **Cut:** Commit 3.1 (pluralize replacement) - adds unnecessary dependency
- **Combined:** 2.2+2.3 (block utils + think tags), 2.13+2.14 (browser actions + string utils)
- **Split:** 1.1 (chat.tsx) into 1.1a and 1.1b, 2.5 (multiline-input) into 2.5a and 2.5b
- **Moved:** 3.4 (run-state.ts) to Phase 2 as 2.17
- **Upgraded:** 2.4 (billing) risk from Medium to High

---

## Phase 1: Critical Issues (Week 1-2)

### Commit 1.1a: Extract Chat State Management
**Files:** `cli/src/chat.tsx` → `cli/src/hooks/use-chat-state.ts`, `cli/src/hooks/use-chat-messages.ts`  
**Est. Time:** 5-6 hours  
**Est. LOC Changed:** ~800-900

> ⚠️ **Corrected:** Original file is 1,676 lines, not 800-1000. Split into two commits.

| Task | Description |
|------|-------------|
| Extract `useChatState` hook | All Zustand state slices and selectors |
| Extract `useChatMessages` hook | Message handling, tree building |
| Create state types file | `types/chat-state.ts` |
| Wire up to main component | Update imports in chat.tsx |

**Dependencies:** None  
**Risk:** High - Core component  
**Feature Flag:** `REFACTOR_CHAT_STATE=true` for gradual rollout  
**Rollback:** Revert to previous chat.tsx, flag off

---

### Commit 1.1b: Extract Chat UI and Orchestration
**Files:** `cli/src/chat.tsx` → `cli/src/hooks/use-chat-ui.ts`, `cli/src/chat-orchestrator.tsx`  
**Est. Time:** 5-6 hours  
**Est. LOC Changed:** ~700-800

| Task | Description |
|------|-------------|
| Extract `useChatUI` hook | Scroll behavior, focus, layout |
| Extract `useChatStreaming` hook | Streaming state management |
| Create `chat-orchestrator.tsx` | Thin wrapper composing hooks |
| Update remaining chat.tsx | Reduce to UI rendering only |

**Dependencies:** Commit 1.1a  
**Risk:** High  
**Feature Flag:** Same as 1.1a  
**Rollback:** Revert commits 1.1a and 1.1b together

---

### Commit 1.2: Refactor `context-pruner.ts` God Function
**Files:** `agents/context-pruner.ts`  
**Est. Time:** 4-5 hours  
**Est. LOC Changed:** ~600-800

| Task | Description |
|------|-------------|
| Extract `summarizeMessages()` | Message summarization logic |
| Extract `calculateTokenBudget()` | Token budget calculations |
| Extract `pruneByPriority()` | Priority-based pruning strategy |
| Extract `formatPrunedContext()` | Output formatting |
| Simplify `handleSteps()` | Reduce to orchestration only |

**Dependencies:** None  
**Risk:** Medium - Core agent functionality  
**Rollback:** Revert single commit

---

### Commit 1.3: Split `old-constants.ts` God Module
**Files:** `common/src/old-constants.ts` → multiple domain files  
**Est. Time:** 2-3 hours  
**Est. LOC Changed:** ~400-500

| Task | Description |
|------|-------------|
| Create `constants/model-config.ts` | Model-related constants |
| Create `constants/limits.ts` | Size/count limits |
| Create `constants/ui.ts` | UI-related constants |
| Create `constants/paths.ts` | Path constants |
| Create `constants/index.ts` | Re-export for backwards compatibility |
| Update all imports | Find and replace across codebase |

**Dependencies:** None  
**Risk:** Low - Pure constants, easy to verify  
**Rollback:** Revert single commit

---

### Commit 1.4: Fix Silent Error Swallowing in `project-file-tree.ts`
**Files:** `common/src/project-file-tree.ts`  
**Est. Time:** 1-2 hours  
**Est. LOC Changed:** ~150-200

| Task | Description |
|------|-------------|
| Add error logging | Log errors before swallowing |
| Add error context | Include file paths in error messages |
| Create custom error types | `FileTreeError`, `PermissionError` |
| Update callers | Handle new error information |

**Dependencies:** None  
**Risk:** Low - Additive changes  
**Rollback:** Revert single commit

---

## Phase 2: High-Priority Warnings (Week 3-5)

> **Note:** Commit 1.5 (run-agent-step.ts) moved to Phase 2 to let chat.tsx patterns establish first.

### Commit 2.1: Refactor `use-send-message.ts` ✅ COMPLETE
**Files:** `cli/src/hooks/use-send-message.ts`  
**Est. Time:** 4-5 hours  
**Actual Time:** ~6 hours (included additional improvements from review feedback)  
**Est. LOC Changed:** ~400-500  
**Actual LOC Changed:** 506 insertions, 151 deletions

| Task | Description | Status |
|------|-------------|--------|
| Extract `useMessageExecution` hook | SDK execution logic (client.run(), agent resolution) | ✅ |
| Extract `useRunStatePersistence` hook | Run state loading/saving, chat continuation | ✅ |
| Extract `agent-resolution.ts` utilities | `resolveAgent`, `buildPromptWithContext` | ✅ |
| Refactor `ExecuteMessageParams` | Grouped into MessageData, StreamingContext, ExecutionContext | ✅ |
| Add unified error handling | try/catch around client.run(), `handleExecutionFailure` helper | ✅ |
| Rename `clearMessages` → `resetRunState` | Clearer naming | ✅ |
| Fix blank AI message on failure | Use `updater.setError()` instead of separate error message | ✅ |

**New Files Created:**
- `cli/src/hooks/use-message-execution.ts`
- `cli/src/hooks/use-run-state-persistence.ts`
- `cli/src/utils/agent-resolution.ts`

**Dependencies:** Commits 1.1a, 1.1b (chat.tsx patterns)  
**Risk:** Medium  
**Rollback:** Revert single commit  
**Commit:** `e93ee30e9`

---

### Commit 2.2: Consolidate Block Utils and Think Tag Parsing ✅ COMPLETE
**Files:** Multiple CLI files + `utils/think-tag-parser.ts`  
**Est. Time:** 3-4 hours  
**Actual Time:** ~4 hours  
**Est. LOC Changed:** ~550-650  
**Actual LOC Changed:** 576 insertions, 200 deletions

| Task | Description | Status |
|------|-------------|--------|
| Audit all `updateBlocksRecursively` usages | Mapped implementations and reduced duplication | ✅ |
| Create `utils/block-tree-utils.ts` | Unified block tree operations (traverse, find, update, map) | ✅ |
| Refactor `use-chat-messages.ts` | Use `updateBlockById` + `toggleBlockCollapse` for block toggling | ✅ |
| Refactor `updateBlocksRecursively` | Delegate to `updateAgentBlockById` from block-tree utils | ✅ |
| Migrate `autoCollapseBlocks` | Now uses `mapBlocks` (removed 25 lines of manual recursion) | ✅ |
| Migrate `findAgentTypeById` | Now uses `findBlockByPredicate` (reduced from 15 to 6 lines) | ✅ |
| Migrate `checkBlockIsUnderParent` | Now uses `findBlockByPredicate` (removed `findBlockInChildren` helper) | ✅ |
| Migrate `transformAskUserBlocks` | Now uses `mapBlocks` (removed nested recursion) | ✅ |
| Migrate `updateToolBlockWithOutput` | Now uses `mapBlocks` (removed lodash `isEqual` import) | ✅ |
| Add `CollapsibleBlock` type | Type-safe collapse toggling with `isCollapsibleBlock` guard | ✅ |
| Add unit tests | `block-tree-utils.test.ts` with 19 tests for all utilities | ✅ |
| Fix `traverseBlocks` early exit bug | Stop signal now propagates from nested calls | ✅ |

**New Files Created:**
- `cli/src/utils/block-tree-utils.ts` - Unified block tree utilities:
  - `traverseBlocks` (visitor pattern with early exit)
  - `findBlockByPredicate` (generic block finder)
  - `mapBlocks` (recursive transformation with reference equality)
  - `updateBlockById`, `updateAgentBlockById`, `toggleBlockCollapse`
- `cli/src/utils/__tests__/block-tree-utils.test.ts` - 19 comprehensive tests

**Type Additions:**
- `CollapsibleBlock` union type in `cli/src/types/chat.ts`
- `isCollapsibleBlock` type guard for safe collapse toggling

**Dependencies:** None  
**Risk:** Low  
**Rollback:** Revert single commit  
**Commit:** `c7be7d70e`

---

### Commit 2.3: Refactor `loopAgentSteps` in `run-agent-step.ts` ✅ COMPLETE
**Files:** `packages/agent-runtime/src/run-agent-step.ts`  
**Est. Time:** 4-5 hours  
**Actual Time:** ~3 hours  
**Est. LOC Changed:** ~500-600  
**Actual LOC Changed:** 521 insertions (new file), 112 deletions (run-agent-step.ts reduced from 966 → 854 lines)

> **Moved from Phase 1:** Let chat.tsx patterns establish before tackling runtime.

| Task | Description | Status |
|------|-------------|--------|
| Extract `initializeAgentRun()` | Agent run setup (analytics, step warnings, message history) | ✅ |
| Extract `buildInitialMessages()` | Message history building with system prompts | ✅ |
| Extract `buildToolDefinitions()` | Tool definition preparation | ✅ |
| Extract `prepareStepContext()` | Step context preparation (token counting, tool definitions) | ✅ |
| Extract `handleOutputSchemaRetry()` | Output schema retry logic | ✅ |
| Extract error utilities | `extractErrorMessage`, `isPaymentRequiredError`, `getErrorStatusCode` | ✅ |
| Add phase-based organization | Clear Phase 1-4 comments in loopAgentSteps | ✅ |

**New Files Created:**
- `packages/agent-runtime/src/agent-step-helpers.ts` (521 lines) - Extracted helpers:
  - `initializeAgentRun` - Agent run setup
  - `buildInitialMessages` - Message history building
  - `buildToolDefinitions` - Tool definition preparation
  - `prepareStepContext` - Step context preparation
  - `handleOutputSchemaRetry` - Output schema retry logic
  - `additionalToolDefinitions` - Tool definition caching
  - Error handling utilities

**Review Findings (from 4 CLI agents):**
- ✅ ~~Dead imports in run-agent-step.ts~~ → Fixed: removed cloneDeep, mapValues, callTokenCountAPI, additionalSystemPrompts, buildAgentToolSet, getToolSet, withSystemInstructionTags, buildUserMessageContent
- ✅ ~~Unsafe type casts in error utilities~~ → Fixed: added `hasStatusCode()` type guard for safe error property access
- ✅ ~~AI slop: excessive section dividers and verbose JSDoc~~ → Fixed: trimmed ~65 lines (module docstring, 5 section dividers, redundant JSDoc)
- ✅ Extraction boundaries are well-chosen with clear responsibilities
- ✅ Phase-based organization is excellent
- ✅ cachedAdditionalToolDefinitions pattern is efficient

**Review Fixes Applied:**
| Fix | Description |
|-----|-------------|
| Remove dead imports | Cleaned up 8 unused imports from run-agent-step.ts |
| Add type guard | Created `hasStatusCode()` to replace unsafe `as` casts |
| Trim AI slop | Reduced agent-step-helpers.ts from 525 → 460 lines |

**Test Results:**
- 369 agent-runtime tests pass (all)
- TypeScript compiles cleanly

**Dependencies:** Commits 1.1a, 1.1b (patterns)  
**Risk:** High - Core runtime, extensive testing required  
**Feature Flag:** `REFACTOR_AGENT_LOOP=true`  
**Rollback:** Revert and flag off  
**Commit:** `e79bfcd6c` (finalized with all review fixes)

---

### Commit 2.4: Consolidate Billing Duplication ✅ COMPLETE
**Files:** `packages/billing/src/org-billing.ts`, `packages/billing/src/balance-calculator.ts`  
**Est. Time:** 6-8 hours  
**Actual Time:** ~4 hours  
**Est. LOC Changed:** ~500-600  
**Actual LOC Changed:** ~350 insertions (new file + tests), ~100 deletions (delegated code)

> ⚠️ **Risk Upgraded to High:** Financial logic requires extensive testing and staged rollout.

| Task | Description | Status |
|------|-------------|--------|
| Create `billing-core.ts` | Shared billing logic with unified types | ✅ |
| Extract `calculateUsageAndBalanceFromGrants()` | Core calculation extracted from both files | ✅ |
| Extract `getOrderedActiveGrantsForOwner()` | Unified grant fetching for user/org | ✅ |
| Create `GRANT_ORDER_BY` constant | Shared grant ordering (priority, expiration, creation) | ✅ |
| Update balance-calculator.ts | Delegates to billing-core, re-exports types for backwards compatibility | ✅ |
| Update org-billing.ts | Delegates to billing-core | ✅ |
| Add comprehensive unit tests | 9 tests covering all financial paths | ✅ |

**New Files Created:**
- `packages/billing/src/billing-core.ts` (~160 lines) - Shared billing logic:
  - `CreditBalance`, `CreditUsageAndBalance`, `CreditConsumptionResult` types
  - `DbConn` type (unified from both files)
  - `BalanceSettlement`, `BalanceCalculationResult` types
  - `GRANT_ORDER_BY` constant for consistent grant ordering
  - `getOrderedActiveGrantsForOwner()` - unified grant fetching
  - `calculateUsageAndBalanceFromGrants()` - core calculation logic
- `packages/billing/src/__tests__/billing-core.test.ts` - 9 comprehensive tests

**Test Coverage (billing-core.test.ts):**
| Test Case | Description |
|-----------|-------------|
| Calculates usage and settles debt | Standard case with positive balance and debt |
| Empty grants array | Returns zero values, no settlement |
| All-positive grants (no debt) | No settlement needed |
| Debt > positive balance | Partial settlement, remaining debt |
| Debt = positive balance | Complete settlement, netBalance = 0 |
| Never-expiring grants (null expires_at) | Always active |
| Multiple grant types aggregation | Correct breakdown by type |
| Skips organization grants for personal context | isPersonalContext flag works |
| Uses shared grant ordering | GRANT_ORDER_BY constant verified |

**Review Findings (from 4 CLI agents):**
- ✅ Financial calculations verified EXACTLY equivalent to original implementations
- ✅ Debt settlement math correct (settlementAmount = Math.min(debt, positive))
- ✅ isPersonalContext flag correctly skips organization grants
- ✅ Backwards compatibility maintained via re-exports
- ✅ Type safety preserved
- ⚠️ Pre-existing issue: balance.breakdown not adjusted after settlement (NOT introduced by this change)
- ⚠️ Pre-existing issue: mid-cycle expired grants not counted (NOT introduced by this change)

**Test Results:**
- 62 billing tests pass (up from 53)
- 146 expect() calls (up from 102)
- TypeScript compiles cleanly

**Pre-existing Issue Fixes:**

During Commit 2.4 review, two pre-existing issues were identified and fixed:

| Issue | Problem | Solution |
|-------|---------|----------|
| **breakdown not adjusted after settlement** | After debt settlement, `sum(breakdown) ≠ totalRemaining` because breakdown wasn't reduced | Documented the semantics: breakdown shows pre-settlement database values, totalRemaining is post-settlement effective balance. Added JSDoc to `CreditBalance` interface. |
| **Mid-cycle expired grants not counted** | Query used `gt(expires_at, now)`, excluding grants that expired after quota reset but before now | Added `includeExpiredSince?: Date` parameter to `getOrderedActiveGrantsForOwner()`. Callers pass `quotaResetDate` to include mid-cycle expired grants. |

**Additional Fixes Applied:**
| Fix | Description |
|-----|-------------|
| Edge case: `>` to `>=` | Changed `gt()` to `gte()` in grant expiration query to include grants expiring exactly at threshold |
| Edge case: usage calculation | Changed `grant.expires_at > quotaResetDate` to `>=` for boundary condition |
| Remove redundant comments | Removed 4 inline comments that duplicated JSDoc documentation |

**Pre-existing Fix Test Coverage:**
| Test Case | Description |
|-----------|-------------|
| Mid-cycle expired grant included in usage | Grant expired after quotaResetDate but before now is counted |
| Grant expiring exactly at threshold | Boundary condition with `>=` comparison |
| includeExpiredSince parameter backwards compatible | Undefined = current behavior (only active grants) |

**Dependencies:** None  
**Risk:** High - Financial accuracy critical  
**Feature Flag:** `REFACTOR_BILLING=true` (staged rollout to 1% → 10% → 100%)  
**Rollback:** Immediate revert + flag off  
**Extra Review:** Finance/billing team sign-off required

---

### Commit 2.5a: Extract Multiline Input Keyboard Navigation ✅ COMPLETE
**Files:** `cli/src/components/multiline-input.tsx`  
**Est. Time:** 3-4 hours  
**Actual Time:** ~5 hours (including stale closure bug discovery and fix)  
**Est. LOC Changed:** ~500-550  
**Actual LOC Changed:** 704 insertions, 563 deletions

> ⚠️ **Corrected:** File is 1,102 lines, not 350-450. Split into two commits.

| Task | Description | Status |
|------|-------------|--------|
| Create `useKeyboardNavigation` hook | Arrow keys, home/end, word navigation, emacs bindings | ✅ |
| Create `useKeyboardShortcuts` hook | Enter, deletion, Ctrl+C, Ctrl+D, etc. | ✅ |
| Create `text-navigation.ts` utilities | findLineStart, findLineEnd, word boundary helpers | ✅ |
| Create `keyboard-event-utils.ts` | isAltModifier, keyboard event helpers | ✅ |
| Update multiline-input | Delegate navigation to hooks | ✅ |
| Fix stale closure bug | Prevent stale state in rapid keypresses | ✅ |

**New Files Created:**
- `cli/src/hooks/use-keyboard-navigation.ts` (~210 lines) - Navigation key handling:
  - Arrow key navigation (up/down/left/right)
  - Word navigation (Alt+Left/Right, Alt+B/F)
  - Line navigation (Home/End, Cmd+Left/Right, Ctrl+A/E)
  - Document navigation (Cmd+Up/Down, Ctrl+Home/End)
  - Emacs bindings (Ctrl+B, Ctrl+F)
  - Sticky column handling for vertical navigation
- `cli/src/hooks/use-keyboard-shortcuts.ts` (~280 lines) - Enter/deletion key handling:
  - Enter handling (plain, shift, option, backslash)
  - Deletion keys (backspace, delete, Ctrl+H, Ctrl+D)
  - Word deletion (Alt+Backspace, Ctrl+W, Alt+Delete)
  - Line deletion (Ctrl+U, Ctrl+K, Cmd+Delete)
- `cli/src/utils/text-navigation.ts` (~50 lines) - Text boundary helpers:
  - `findLineStart`, `findLineEnd`
  - `findPreviousWordBoundary`, `findNextWordBoundary`
- `cli/src/utils/keyboard-event-utils.ts` (~30 lines) - Keyboard event helpers:
  - `isAltModifier` (handles escape sequences for Alt key)
  - `isPrintableCharacterKey`

**Component Size Reduction:**
- `multiline-input.tsx`: ~1,102 → ~560 lines (-542 lines, -49%)

**Stale Closure Bug Fix:**

During tmux testing, a critical stale closure bug was discovered:

| Issue | Problem | Solution |
|-------|---------|----------|
| **Stale state in callbacks** | Hooks captured `value` and `cursorPosition` at render time. Rapid keypresses (e.g., Left arrow then typing) used stale values | Created `stateRef` to hold current state, updated synchronously |
| **React batching delay** | `onChange` updates state, but React may not re-render before next keypress | Created `onChangeWithRef` wrapper that updates `stateRef.current` immediately before calling `onChange` |

**Implementation Pattern:**
```typescript
// State ref for real-time access (avoids stale closures)
const stateRef = useRef({ value, cursorPosition })
stateRef.current = { value, cursorPosition }

// Wrapper that updates ref immediately before React state
const onChangeWithRef = useCallback(
  (newValue: string, newCursor: number) => {
    stateRef.current = { value: newValue, cursorPosition: newCursor }
    onChange(newValue, newCursor)
  },
  [onChange],
)
```

**Test Results:**
- 1,911 CLI tests pass
- TypeScript compiles cleanly
- Verified via tmux testing with character-by-character input

**Review Findings (from 4 CLI agents):**
- ✅ Extraction boundaries well-chosen with clear responsibilities
- ✅ Keyboard behavior exactly preserved
- ✅ No dead code or unused exports
- ⚠️ Optional: Move `isPrintableCharacterKey` to keyboard-event-utils.ts
- ⚠️ Optional: Remove verbose JSDoc/AI slop comments

**Dependencies:** Commit 2.1 (use-send-message patterns)  
**Risk:** Medium - User input handling  
**Rollback:** Revert single commit  
**Commit:** `fc4a66569`

---

### Commit 2.5b: Extract Multiline Input Editing Handlers ✅ COMPLETE
**Files:** `cli/src/components/multiline-input.tsx`  
**Est. Time:** 3-4 hours  
**Actual Time:** ~3 hours  
**Est. LOC Changed:** ~500-550  
**Actual LOC Changed:** ~330 insertions, ~240 deletions

| Task | Description | Status |
|------|-------------|--------|
| Create `useTextSelection` hook | Selection management (getSelectionRange, clearSelection, deleteSelection) | ✅ |
| Create `useTextEditing` hook | Character input, cursor movement, insertTextAtCursor | ✅ |
| Create `useMouseInput` hook | Mouse click handling, click-to-cursor positioning | ✅ |
| Extract `TAB_WIDTH` constant | Moved to shared constants file | ✅ |
| Simplify main component | Delegate editing to hooks | ✅ |
| Run comprehensive tmux tests | All 6 behavior tests pass | ✅ |

**New Files Created:**
- `cli/src/hooks/use-text-selection.ts` (~95 lines) - Selection management:
  - `getSelectionRange` - Get current selection in original text coordinates
  - `clearSelection` - Clear the current selection
  - `deleteSelection` - Delete selected text
  - `handleSelectionDeletion` - Handle selection deletion with onChange callback
- `cli/src/hooks/use-text-editing.ts` (~140 lines) - Text editing operations:
  - `insertTextAtCursor` - Insert text at current cursor position
  - `moveCursor` - Move cursor to new position
  - `handleCharacterInput` - Handle printable character input
  - `isPrintableCharacterKey` - Check if key is printable character
- `cli/src/hooks/use-mouse-input.ts` (~95 lines) - Mouse handling:
  - `handleMouseDown` - Click-to-cursor positioning with tab width support

**Shared Constant Extraction:**
- Moved `TAB_WIDTH = 4` to `cli/src/utils/constants.ts` (was duplicated in 2 files)

**Component Size Reduction:**
- `multiline-input.tsx`: ~560 → ~320 lines (-240 lines, -43%)
- **Total reduction from original:** ~1,102 → ~320 lines (-71%)

**Test Results:**
- 1,911 CLI tests pass
- TypeScript compiles cleanly
- 6 tmux behavior tests pass (typing, insertion, word deletion, line deletion, emacs bindings, submit)

**Review Findings (from 4 CLI agents):**
- ✅ Extraction boundaries well-chosen with clear responsibilities
- ✅ All editing behavior exactly preserved
- ✅ No dead code or unused exports
- ⚠️ Warning: TAB_WIDTH duplicated → Fixed by extracting to constants.ts
- ⚠️ Warning: useMouseInput doesn't use stateRef pattern (acceptable for mouse events)
- ⚠️ Optional: Remove backwards-compat re-export (tests have own copy)
- ⚠️ Optional: Type renderer/scrollbox interfaces properly

**Warning Fixes Applied (Amended to Commit):**

After initial commit, 4 CLI agents reviewed and identified warnings. All were fixed and amended to the commit:

| Warning | Problem | Fix Applied |
|---------|---------|-------------|
| **Render-time ref update** | `stateRef.current = {...}` runs during render | Documented as intentional for sync state access |
| **Eager boundary computation** | Word/line boundaries computed for every keypress | Converted to lazy getters (`getWordStart()`, `getLogicalLineEnd()`, etc.) |
| **shouldHighlight callback churn** | Callback recreated on every keystroke | Memoized with `useMemo` |
| **TAB_WIDTH duplication** | Defined in multiline-input.tsx and hooks | Removed from component, imports from constants.ts |
| **useMouseInput missing stateRef** | Didn't use stateRef pattern like other hooks | Updated to use `stateRef` + `onChangeWithRef` |
| **Type safety ('as any' casts)** | Fragile dependencies on OpenTUI internals | Created `cli/src/types/opentui-internals.ts` with proper interfaces |

**New Type Definitions (`cli/src/types/opentui-internals.ts`):**
- `TextRenderableWithBuffer` - Text buffer access interface
- `RendererWithSelection` - Selection management interface  
- `ScrollBoxWithViewport` - Scroll viewport interface
- `FocusableNode` - Focus management interface

**Dependencies:** Commit 2.5a  
**Risk:** Medium  
**Rollback:** Revert both 2.5a and 2.5b together  
**Commit:** `ff968c8c3`

---

### Commit 2.6: Simplify `use-activity-query.ts` ✅ COMPLETE
**Files:** `cli/src/hooks/use-activity-query.ts`  
**Est. Time:** 4-5 hours  
**Actual Time:** ~3 hours  
**Est. LOC Changed:** ~500-600  
**Actual LOC Changed:** 716 lines total (326 hook + 193 cache + 149 executor + 48 invalidation)

| Task | Description | Status |
|------|-------------|--------|
| Evaluate external caching library | Kept custom (react-query overkill for this use case) | ✅ |
| Extract `query-cache.ts` module | Cache entries, listeners, ref counts, snapshots | ✅ |
| Extract `query-executor.ts` module | Query execution with retries, deduplication | ✅ |
| Extract `query-invalidation.ts` module | Invalidation strategies, removeQuery, setQueryData | ✅ |
| Simplify main hook | Compose extracted pieces | ✅ |
| Fix critical issues from review | See below | ✅ |
| Multi-agent review fixes | 4 CLI agents reviewed, 5 issues fixed | ✅ |

**New Files Created:**
- `cli/src/utils/query-cache.ts` (~224 lines) - Cache management:
  - `CacheEntry`, `KeySnapshot` types
  - `serializeQueryKey`, `subscribeToKey`, `getKeySnapshot`
  - `setCacheEntry`, `getCacheEntry`, `isEntryStale`
  - `setQueryFetching`, `isQueryFetching`
  - `incrementRefCount`, `decrementRefCount`, `getRefCount`
  - `bumpGeneration`, `getGeneration`, `deleteCacheEntry`
  - `resetCache` (for testing)
- `cli/src/utils/query-executor.ts` (~187 lines) - Query execution:
  - `createQueryExecutor` - factory for fetch functions with retry/dedup
  - `clearRetryState`, `clearRetryTimeout` - retry management
  - `scheduleRetry` - exponential backoff scheduling
  - `getRetryCount`, `setRetryCount` - retry state
  - `resetExecutorState` (for testing)
- `cli/src/utils/query-invalidation.ts` (~67 lines) - Invalidation:
  - `invalidateQuery` - mark query as stale
  - `removeQuery` - full removal with cleanup
  - `getQueryData`, `setQueryData` - direct cache access
  - `fullDeleteCacheEntry` - comprehensive cleanup for GC

**Component Size Reduction:**
- `use-activity-query.ts`: ~480 → ~316 lines (-34%)

**Critical Issues Fixed (from 4-agent review):**

| Issue | Problem | Fix Applied |
|-------|---------|-------------|
| **Infinite Retry Loop** | `scheduleRetry` called `clearRetryState` which deleted the retry count that was just set, so retry count never accumulated | Created `clearRetryTimeout()` that only clears the timeout (not count). `scheduleRetry` now uses this. |
| **Memory Leak in deleteCacheEntry** | `deleteCacheEntry` didn't clear in-flight promises or retry state when GC runs | Created `fullDeleteCacheEntry()` in query-invalidation.ts that clears all state. GC effect now uses this. |
| **Incomplete useEffect deps** | Initial fetch effect missing deps (refetchOnMount, staleTime, doFetch) - hidden by eslint-disable | Added `refetchOnMountRef` and `staleTimeRef` refs. Deps are now `[enabled, serializedKey, doFetch]`. |

**Review Findings (from 4 CLI agents):**
- ✅ All 3 critical issues correctly fixed
- ✅ Extraction boundaries well-chosen with clear responsibilities
- ✅ Backwards compatibility maintained via re-exports
- ⚠️ Suggestion: Double bumpGeneration call in fullDeleteCacheEntry (harmless but redundant)
- ⚠️ Suggestion: enabled:false doesn't cancel pending retries (edge case, non-blocking)
- ⚠️ Suggestion: Dead exports (getInFlightPromise, setInFlightPromise) - future API surface

**Multi-Agent Review (Codex, Codebuff, Claude Code, Gemini):**

| Issue | Problem | Fix Applied |
|-------|---------|-------------|
| **Redundant setRetryCount** | `refetch()` called `setRetryCount(0)` then `clearRetryState()` which already deletes count | Removed redundant `setRetryCount` call |
| **Two delete functions** | `deleteCacheEntry` incomplete vs `fullDeleteCacheEntry` complete - footgun | Renamed to `deleteCacheEntryCore` (internal), kept `fullDeleteCacheEntry` as public API |
| **Memory leak in generations** | `generations` map never cleaned up during normal deletion | Added `clearGeneration(key)` call in `fullDeleteCacheEntry` |
| **gcTimeouts exported mutable** | Map exported directly allowing any module to mutate | Replaced with accessor functions (`setGcTimeout`, `clearGcTimeout`) |
| **GC effect deps issue** | `gcTime` in deps caused spurious cleanup runs on option change | Stored `gcTime` in ref, removed from deps |
| **AI slop comments** | Verbose JSDoc that just repeated function names | Removed ~60 lines of obvious comments |

**Test Results:**
- 52 use-activity-query tests pass
- 59 dependent tests (use-usage-query, use-claude-quota-query) pass
- TypeScript compiles cleanly

**Dependencies:** None  
**Risk:** Medium  
**Rollback:** Revert single commit  
**Commit:** Pending

---

### Commit 2.7: Consolidate XML Parsing ✅ COMPLETE
**Files:** `common/src/util/saxy.ts` + 3 related files  
**Est. Time:** 2-3 hours  
**Actual Time:** ~2 hours (including multi-agent review and fixes)  
**Est. LOC Changed:** ~400-500  
**Actual LOC Changed:** 808 lines total (741 saxy + 20 tool-call-parser + 7 tag-utils + 17 index + 23 package.json export)

| Task | Description | Status |
|------|-------------|--------|
| Audit all XML parsing usages | Mapped 4 files: saxy.ts, xml.ts, xml-parser.ts, stream-xml-parser.ts | ✅ |
| Create unified `common/src/util/xml/` directory | New directory with organized modules | ✅ |
| Move `saxy.ts` to `xml/saxy.ts` | Core streaming XML parser | ✅ |
| Move `xml-parser.ts` to `xml/tool-call-parser.ts` | Tool call XML parsing utility | ✅ |
| Move `xml.ts` to `xml/tag-utils.ts` | XML tag utilities (closeXml, getStopSequences) | ✅ |
| Create `xml/index.ts` | Unified re-exports for all XML utilities | ✅ |
| Update all 7 consumers | Direct imports from `@codebuff/common/util/xml` | ✅ |
| Add package.json export | Explicit `./util/xml` → `./src/util/xml/index.ts` | ✅ |
| Multi-agent review | 4 CLI agents (Codex, Codebuff, Claude Code, Gemini) | ✅ |
| Apply review fixes | Deleted shims, cleaned AI slop | ✅ |

**New Directory Structure:**
```
common/src/util/xml/
├── index.ts          (17 lines) - Unified exports (cleaned)
├── saxy.ts           (741 lines) - Streaming XML parser
├── tag-utils.ts      (7 lines) - closeXml, getStopSequences (cleaned)
└── tool-call-parser.ts (20 lines) - parseToolCallXml (cleaned)
```

**Multi-Agent Review (Codex, Codebuff, Claude Code, Gemini):**

All 4 CLI agents reviewed the initial implementation and reached consensus on improvements:

| Finding | Agents | Severity | Resolution |
|---------|--------|----------|------------|
| **Shims add unnecessary complexity** | All 4 | ⚠️ Warning | Deleted all 3 shim files |
| **Only 6-7 consumers need updating** | All 4 | Info | Updated all consumers directly |
| **AI slop comments** | 3/4 | Suggestion | Removed verbose JSDoc |
| **Duplicate parseToolCallXml export** | Claude | ⚠️ Warning | Fixed by removing shims |
| **Package export needed** | - | Critical | Added explicit export in package.json |

**Review Fixes Applied:**

| Fix | Description |
|-----|-------------|
| Delete shim files | Removed `saxy.ts`, `xml.ts`, `xml-parser.ts` shims (24 lines) |
| Update 7 consumers | Direct imports from `@codebuff/common/util/xml` |
| Add package.json export | `"./util/xml"` → `"./src/util/xml/index.ts"` for module resolution |
| Clean AI slop | Removed ~30 lines of verbose JSDoc comments |
| Update test import | `saxy.test.ts` now imports from `../xml` |

**Files Updated:**
- `common/package.json` - Added explicit xml export
- `common/src/util/__tests__/saxy.test.ts` - Import from `../xml`
- `packages/internal/src/utils/xml-parser.ts` - Import from `@codebuff/common/util/xml`
- `agents-graveyard/base/ask.ts` - Already using correct import
- `agents-graveyard/base/base-lite-grok-4-fast.ts` - Already using correct import
- `agents-graveyard/base/base-prompts.ts` - Already using correct import
- `packages/agent-runtime/src/system-prompt/prompts.ts` - Already using correct import
- `packages/agent-runtime/src/util/messages.ts` - Already using correct import
- `web/src/app/admin/traces/utils/trace-processing.ts` - Already using correct import
- `web/src/app/api/admin/relabel-for-user/route.ts` - Already using correct import

**Test Results:**
- 259 common package tests pass
- All 13 package typechecks pass
- 2,892+ tests pass across CLI, agent-runtime, billing, SDK packages
- 29 Saxy XML parser tests pass

**Dependencies:** None  
**Risk:** Low  
**Rollback:** Revert single commit  
**Commit:** `417c0b5ff`

---

### Commit 2.8: Consolidate Analytics ✅ COMPLETE
**Files:** `common/src/analytics*.ts` + `common/src/util/analytics-*.ts`  
**Est. Time:** 3-4 hours  
**Actual Time:** ~1 hour  
**Est. LOC Changed:** ~500-600  
**Actual LOC Changed:** ~350 lines (4 files moved + index.ts created)

| Task | Description | Status |
|------|-------------|--------|
| Audit all analytics files | Mapped 4 files in common/, 1 in cli/, consumers across packages | ✅ |
| Create `common/src/analytics/` directory | New unified analytics module | ✅ |
| Move `analytics-core.ts` to `analytics/core.ts` | PostHog client factory, interfaces, types | ✅ |
| Move `analytics.ts` to `analytics/track-event.ts` | Server-side trackEvent function | ✅ |
| Move `util/analytics-dispatcher.ts` to `analytics/dispatcher.ts` | Cross-platform event dispatching | ✅ |
| Move `util/analytics-log.ts` to `analytics/log-helpers.ts` | Log data to PostHog payload conversion | ✅ |
| Create `analytics/index.ts` | Unified re-exports for all analytics utilities | ✅ |
| Add package.json export | `./analytics` → `./src/analytics/index.ts` | ✅ |
| Update all consumers | `@codebuff/common/analytics` imports | ✅ |
| Delete old files | Removed 4 old analytics files | ✅ |

**New Directory Structure:**
```
common/src/analytics/
├── index.ts        (~30 lines) - Unified exports
├── core.ts         (~55 lines) - PostHog client, interfaces
├── track-event.ts  (~70 lines) - Server-side event tracking
├── dispatcher.ts   (~75 lines) - Cross-platform event dispatching
└── log-helpers.ts  (~70 lines) - Log data conversion
```

**Files Updated:**
- `common/package.json` - Added explicit `./analytics` export
- `cli/src/utils/analytics.ts` - Import from `@codebuff/common/analytics`
- `cli/src/utils/__tests__/analytics-client.test.ts` - Updated import
- `cli/src/utils/logger.ts` - Import dispatcher from `@codebuff/common/analytics`
- `web/src/util/logger.ts` - Import dispatcher from `@codebuff/common/analytics`
- `common/src/util/__tests__/analytics-dispatcher.test.ts` - Updated import
- `common/src/util/__tests__/analytics-log.test.ts` - Updated import

**Multi-Agent Review (Codex, Codebuff):**

| Finding | Agent | Severity | Resolution |
|---------|-------|----------|------------|
| **No buffer size limit in dispatcher** | Codebuff | Critical | Added MAX_BUFFER_SIZE = 100, drops oldest events |
| **AI slop comments** | Both | Suggestion | Removed section comments from index.ts, verbose JSDoc from core.ts |
| **Duplicate trackEvent implementations** | Codebuff | Critical | Pre-existing (CLI vs common), not introduced by this change |
| **Env coupling in barrel export** | Codex | Critical | Pre-existing, tests pass - not a regression |

**Review Fixes Applied:**
| Fix | Description |
|-----|-------------|
| Buffer size limit | Added `MAX_BUFFER_SIZE = 100` to dispatcher, prevents unbounded memory growth |
| Clean AI slop | Removed 4 section comments from index.ts, 2 verbose JSDoc from core.ts |
| Simplify type | Changed `EnvName` type to just `string` (was redundant union) |

**Test Results:**
- 259 common package tests pass
- 11 CLI analytics tests pass
- All 13 package typechecks pass

**Dependencies:** None  
**Risk:** Low  
**Rollback:** Revert single commit  
**Commit:** `a9b8e6a0c`

---

### Commit 2.9: Refactor `doStream` in OpenAI Compatible Model ✅ COMPLETE
**Files:** `packages/internal/src/openai-compatible/chat/openai-compatible-chat-language-model.ts`  
**Est. Time:** 3-4 hours  
**Actual Time:** ~2 hours  
**Est. LOC Changed:** ~350-400  
**Actual LOC Changed:** ~290 lines (3 new files) + ~180 lines reduced from main file

| Task | Description | Status |
|------|-------------|--------|
| Create `stream-usage-tracker.ts` | Usage accumulation with factory pattern | ✅ |
| Create `stream-content-tracker.ts` | Text/reasoning delta handling | ✅ |
| Create `stream-tool-call-handler.ts` | Tool call state management | ✅ |
| Simplify `doStream` | Orchestration with extracted helpers | ✅ |
| Multi-agent review | Codex CLI + Codebuff reviewed, fixes applied | ✅ |

**New Files Created:**
- `packages/internal/src/openai-compatible/chat/stream-usage-tracker.ts` (~60 lines):
  - `createStreamUsageTracker()` - factory for usage accumulation
  - `update()` - process chunk usage data
  - `getUsage()` - get LanguageModelV2Usage
  - `getCompletionTokensDetails()` - get detailed token breakdown
- `packages/internal/src/openai-compatible/chat/stream-content-tracker.ts` (~45 lines):
  - `createStreamContentTracker()` - factory for content state
  - `processReasoningDelta()` - emit reasoning-start/delta events
  - `processTextDelta()` - emit text-start/delta events
  - `flush()` - emit reasoning-end/text-end events
  - Constants: `REASONING_ID`, `TEXT_ID`
- `packages/internal/src/openai-compatible/chat/stream-tool-call-handler.ts` (~120 lines):
  - `createStreamToolCallHandler()` - factory for tool call state
  - `processToolCallDelta()` - handle streaming tool call chunks
  - `flushUnfinishedToolCalls()` - emit incomplete tool calls at end
  - `emitToolCallCompletion()` - extracted helper for DRY completion logic

**doStream Reduction:**
- `openai-compatible-chat-language-model.ts`: ~300 → ~120 lines in doStream (-60%)
- TransformStream now delegates to helpers instead of inline logic

**Multi-Agent Review (Codex CLI, Codebuff):**

| Finding | Agent | Severity | Resolution |
|---------|-------|----------|------------|
| **Magic string IDs** | Codebuff | Info | Added `REASONING_ID`, `TEXT_ID` constants |
| **Unused getters** | Codebuff | Info | Removed `isReasoningActive()`, `isTextActive()`, `getToolCalls()` |
| **Duplicated completion logic** | Codebuff | Warning | Extracted `emitToolCallCompletion()` helper |
| **Non-null assertion** | Codex | Info | Removed unnecessary `!` assertion |
| **Redundant nullish coalescing** | Both | Suggestion | Simplified `?? undefined` to just return value |
| **Unused type exports** | Codebuff | Info | Made `ToolCallState` internal (not exported) |

**Multi-Agent Review (All 4 CLI Agents: Codex, Codebuff, Claude Code, Gemini):**

| Finding | Agents | Severity | Resolution |
|---------|--------|----------|------------|
| **Empty delta emission** | Codebuff, Claude | Warning | Fixed: Only emit delta if arguments truthy |
| **Invalid JSON in flush** | Codex, Codebuff | Warning | Fixed: Use `isParsableJson` with `'{}'` fallback |
| **Dead generateId() fallback** | Codebuff, Claude | Info | Fixed: Removed dead `?? generateId()` |
| **Magic string IDs** | Codex, Claude, Gemini | Suggestion | Fixed: Added `REASONING_ID`, `TEXT_ID` constants |
| **Side-effect mutation** | Codebuff, Claude, Gemini | Suggestion | Accepted: Keep for simplicity within limited scope |
| **Hardcoded IDs** | Codex, Claude, Gemini | Suggestion | Documented: Single block assumption |
| **No unit tests** | Codex | Warning | Deferred: Integration tests sufficient for now |
| **Premature tool finalization** | Gemini | Critical | Rejected: Matches original behavior, intentional for providers sending complete tool calls |

**Architecture Decisions Validated (All 4 agents agree):**
- ✅ Factory pattern is correct (vs classes or standalone functions)
- ✅ Event arrays are cleaner than passing controller (testability)
- ✅ Helpers are ready for OpenRouter reuse in Commit 2.10

**Review Fixes Applied:**
| Fix | Description |
|-----|-------------|
| Add constants | `REASONING_ID = 'reasoning-0'`, `TEXT_ID = 'txt-0'` |
| Remove unused getters | Deleted `isReasoningActive()`, `isTextActive()`, `getToolCalls()` |
| Extract completion helper | `emitToolCallCompletion()` reduces duplication by ~30 lines |
| Simplify usage tracker | Flattened state to simple variables instead of nested object |
| Remove redundant code | Cleaned up `?? undefined` patterns |
| **Empty delta fix** | Moved delta emission inside `if (arguments != null)` block |
| **Invalid JSON fix** | Added `isParsableJson` check with `'{}'` fallback in flush |
| **Dead fallback fix** | Removed `?? generateId()` since id is validated earlier |

**Test Results:**
- 191 internal package tests pass
- All 13 package typechecks pass
- Streaming behavior unchanged

**Dependencies:** None  
**Risk:** Medium - Core streaming  
**Rollback:** Revert single commit  
**Commit:** `559857bc2`

---

### Commit 2.10: DRY Up OpenRouter Stream Handling ⏭️ SKIPPED
**Files:** `packages/internal/src/openrouter-ai-sdk/chat/index.ts`  
**Est. Time:** 2-3 hours  
**Est. LOC Changed:** ~300-400

> **Decision:** Skipped after multi-agent review of Commit 2.9. All 4 CLI agents reviewed and Codebuff's recommendation was adopted.

**Reason for Skipping:**
OpenRouter streaming has materially different requirements from OpenAI-compatible streaming:
- `reasoning_details` array with types (Text, Summary, Encrypted) vs simple `reasoning_content`
- `annotations` / web search citations support
- `openrouterUsage` with `cost`, `cost_details`, `upstreamInferenceCost`
- Different tool call tracking (`inputStarted` flag vs `hasFinished`)
- Provider routing info

Premature abstraction would add complexity without clear benefit. The helpers are small (45-120 lines each) and the "duplication" cost is low compared to the complexity cost of a forced abstraction.

**Revisit When:** We find ourselves fixing the same streaming bug in both implementations, or the APIs converge.

**Dependencies:** Commit 2.9  
**Risk:** N/A - Skipped  
**Rollback:** N/A

---

### Commit 2.11: Consolidate Image Handling ✅ NOT NEEDED
**Files:** Clipboard/image related files in CLI  
**Est. Time:** 0 hours (skipped)  
**Est. LOC Changed:** 0

> **Decision:** Skipped after codebase analysis. The image handling architecture is already well-organized.

**Reason for Skipping:**
The refactoring plan's description was based on outdated analysis. The current architecture is clean:

| File | Purpose | Lines |
|------|---------|-------|
| `common/src/constants/images.ts` | Shared constants, MIME types, size limits | ~50 |
| `cli/src/utils/image-handler.ts` | Core processing, compression, validation | ~290 |
| `cli/src/utils/clipboard-image.ts` | Cross-platform clipboard operations | ~370 |
| `cli/src/utils/image-processor.ts` | SDK message content integration | ~70 |
| `cli/src/utils/pending-attachments.ts` | State management for pending images | ~190 |
| `cli/src/utils/image-thumbnail.ts` | Pixel extraction for thumbnails | ~75 |
| `cli/src/utils/terminal-images.ts` | iTerm2/Kitty protocol rendering | ~190 |
| `cli/src/utils/image-display.ts` | Terminal dimension calculations | ~60 |

**Clean Dependency Chain:**
```
common/constants/images.ts (constants)
    ↓
cli/utils/image-handler.ts (core processing)
    ↓
├── cli/utils/clipboard-image.ts (clipboard operations)
├── cli/utils/image-processor.ts (SDK integration)
└── cli/utils/pending-attachments.ts (state management)
```

No duplication found. Architecture follows single responsibility principle.

**Revisit When:** If new image handling code introduces duplication.

**Dependencies:** N/A  
**Risk:** N/A  
**Rollback:** N/A

---

### Commit 2.12: Refactor `use-suggestion-engine.ts` ✅ COMPLETE
**Files:** `cli/src/hooks/use-suggestion-engine.ts`  
**Est. Time:** 2-3 hours  
**Actual Time:** ~1.5 hours  
**Est. LOC Changed:** ~350-450  
**Actual LOC Changed:** ~450 lines extracted (130 parsing + 320 filtering)

> **Note:** Plan originally called for extracting hooks (`useSuggestionCache`, etc.), but pure utility modules were more appropriate since the logic is stateless.

| Task | Description | Status |
|------|-------------|--------|
| Create `suggestion-parsing.ts` | Parsing functions: parseSlashContext, parseMentionContext, isInsideStringDelimiters, parseAtInLine | ✅ |
| Create `suggestion-filtering.ts` | Filtering functions: filterSlashCommands, filterAgentMatches, filterFileMatches, helpers | ✅ |
| Update main hook | Import from extracted modules, re-export types for consumers | ✅ |
| Run tests | 100 suggestion engine tests pass, 1902 CLI tests pass | ✅ |
| Multi-agent review | Code-reviewer-multi-prompt reviewed extraction boundaries | ✅ |

**New Files Created:**
- `cli/src/utils/suggestion-parsing.ts` (~130 lines) - Parsing utilities:
  - `TriggerContext` interface - trigger state for slash/mention
  - `parseSlashContext()` - parse `/command` triggers
  - `parseMentionContext()` - parse `@mention` triggers
  - `isInsideStringDelimiters()` - check if position is in quotes
  - `parseAtInLine()` - parse @ in a single line
- `cli/src/utils/suggestion-filtering.ts` (~320 lines) - Filtering utilities:
  - `MatchedSlashCommand`, `MatchedAgentInfo`, `MatchedFileInfo` types
  - `filterSlashCommands()` - filter/rank slash commands with highlighting
  - `filterAgentMatches()` - filter/rank agents with highlighting
  - `filterFileMatches()` - filter/rank files with path-segment matching
  - `flattenFileTree()`, `getFileName()` - file tree helpers
  - `createHighlightIndices()`, `createPushUnique()` - internal helpers

**Hook Size Reduction:**
- `use-suggestion-engine.ts`: ~751 → ~220 lines (-71%)

**Architecture Decision:**
Extracted pure utility modules instead of React hooks (as originally planned) because:
1. Parsing and filtering logic is stateless - no React dependencies
2. Pure functions are easier to test in isolation
3. Better separation of concerns: hook manages React state/effects, utilities do computation

**Review Findings:**
- ✅ Extraction boundaries well-chosen (parsing vs filtering vs hook)
- ✅ Types properly re-exported for backward compatibility
- ⚠️ Fixed: Import path `../utils/local-agent-registry` → `./local-agent-registry`

**Test Results:**
- 100 suggestion engine tests pass
- 1902 CLI tests pass
- TypeScript compiles cleanly

**Dependencies:** None  
**Risk:** Low  
**Rollback:** Revert single commit

---

### Commit 2.13: Fix Browser Actions and String Utils ✅ COMPLETE
**Files:** `common/src/browser-actions.ts`, `common/src/util/string.ts`  
**Est. Time:** 2-3 hours  
**Actual Time:** ~1 hour  
**Est. LOC Changed:** ~200-300  
**Actual LOC Changed:** ~150 lines changed, ~100 lines reduced (duplication removed)

| Task | Description | Status |
|------|-------------|--------|
| Create `parseActionValue()` utility | Single parsing function for string→type conversion | ✅ |
| Update `parseBrowserActionXML` | Now uses `parseActionValue()` | ✅ |
| Update `parseBrowserActionAttributes` | Now uses `parseActionValue()` | ✅ |
| Create `LAZY_EDIT_PATTERNS` constant | 7 regex patterns for lazy edit detection | ✅ |
| Update `hasLazyEdit()` | Uses `LAZY_EDIT_PATTERNS.some()` | ✅ |
| Update `replaceNonStandardPlaceholderComments()` | Iterates over shared patterns | ✅ |
| Add unit tests | `browser-actions.test.ts` with 8 test cases | ✅ |
| Fix empty string edge case | Added `value !== ''` check in `parseActionValue()` | ✅ |

**New Files Created:**
- `common/src/__tests__/browser-actions.test.ts` (~45 lines) - Tests for `parseActionValue()`

**Code Reductions:**
- `parseBrowserActionXML`: Removed ~20 lines of inline parsing logic
- `parseBrowserActionAttributes`: Removed ~5 lines of inline parsing logic  
- `hasLazyEdit()`: Reduced from ~25 lines to ~10 lines
- `replaceNonStandardPlaceholderComments()`: Reduced from ~40 lines to ~10 lines

**Multi-Agent Review:**
| Finding | Severity | Resolution |
|---------|----------|------------|
| Misleading test comment | Info | Fixed: "should remain as strings" |
| Empty string edge case | Warning | Fixed: Added `value !== ''` check |
| Redundant `.toLowerCase()` in `hasLazyEdit()` | Info | Kept for quick-check string comparisons |

**Test Results:**
- 277 common package tests pass
- TypeScript compiles cleanly

**Dependencies:** None  
**Risk:** Low  
**Rollback:** Revert single commit

---

### Commit 2.14: Refactor `agent-builder.ts` ✅ COMPLETE
**Files:** `agents/agent-builder.ts`  
**Est. Time:** 2-3 hours  
**Actual Time:** ~1 hour  
**Est. LOC Changed:** ~300-400  
**Actual LOC Changed:** ~30 lines changed (helper function + constants + error handling)

| Task | Description | Status |
|------|-------------|--------|
| Extract `readAgentFile()` helper | Graceful error handling with console.warn | ✅ |
| Create `EXAMPLE_AGENT_PATHS` constant | Consolidated file paths for maintainability | ✅ |
| Add proper error handling | Try/catch around file reads, returns empty string on error | ✅ |
| Add critical file validation | console.error if type definitions fail to load | ✅ |

**Changes Made:**
- Created `readAgentFile(relativePath: string)` helper with try/catch that returns empty string on error
- Extracted `EXAMPLE_AGENT_PATHS` constant array for all 5 example agent files
- Added `.filter((content) => content.length > 0)` to skip failed example reads
- Added critical file validation that logs `console.error` if type definitions fail to load

**Code Reduction:**
- Removed 7 individual `readFileSync` calls with duplicated paths
- Replaced with single helper function and constant array
- Net: ~10 lines removed, cleaner code structure

**Review Findings (from code-reviewer-multi-prompt):**
- ✅ Error handling is appropriate for module load time
- ✅ EXAMPLE_AGENT_PATHS constant improves maintainability
- ⚠️ Fixed: Added critical file validation for type definitions

**Test Results:**
- TypeScript compiles cleanly
- Agent builder functions correctly

**Dependencies:** None  
**Risk:** Low  
**Rollback:** Revert single commit

---

### Commit 2.15: Refactor `promptAiSdkStream` in SDK ✅ COMPLETE
**Files:** `sdk/src/impl/llm.ts`  
**Est. Time:** 3-4 hours  
**Actual Time:** ~2 hours  
**Est. LOC Changed:** ~350-450  
**Actual LOC Changed:** ~250 lines extracted to 3 new files

| Task | Description | Status |
|------|-------------|--------|
| Create `tool-call-repair.ts` | Tool call repair handler with agent transformation logic | ✅ |
| Create `claude-oauth-errors.ts` | OAuth error detection (rate limit + auth errors) | ✅ |
| Create `stream-cost-tracker.ts` | Cost extraction and tracking utilities | ✅ |
| Simplify main function | Uses extracted helpers, reduced from ~540 to ~380 lines | ✅ |

**New Files Created:**
- `sdk/src/impl/tool-call-repair.ts` (~140 lines) - Tool call repair handler:
  - `createToolCallRepairHandler()` - factory for experimental_repairToolCall
  - `deepParseJson()` - recursive JSON parsing helper
  - Transforms agent tool calls to spawn_agents
- `sdk/src/impl/claude-oauth-errors.ts` (~65 lines) - OAuth error detection:
  - `isClaudeOAuthRateLimitError()` - detects 429 and rate limit messages
  - `isClaudeOAuthAuthError()` - detects 401/403 and auth error messages
- `sdk/src/impl/stream-cost-tracker.ts` (~55 lines) - Cost tracking:
  - `OpenRouterUsageAccounting` type
  - `calculateUsedCredits()` - credit calculation with profit margin
  - `extractAndTrackCost()` - provider metadata extraction and callback

**Code Reduction:**
- `llm.ts`: ~540 → ~380 lines (-30%)
- Tool call repair logic: ~85 lines moved
- OAuth error functions: ~65 lines moved
- Cost tracking: ~25 lines moved + deduplicated across 3 functions

**Test Results:**
- 281 SDK tests pass
- TypeScript compiles cleanly

**Dependencies:** Commits 2.9, 2.10 (streaming patterns)  
**Risk:** Medium  
**Rollback:** Revert single commit  
**Commit:** Pending

---

### Commit 2.16: Simplify `run-state.ts` in SDK ✅ COMPLETE
**Files:** `sdk/src/run-state.ts`  
**Est. Time:** 3-4 hours  
**Actual Time:** ~2 hours  
**Est. LOC Changed:** ~400-500  
**Actual LOC Changed:** ~420 lines extracted to 5 new files

> **Moved from Phase 3:** File is 737 lines, not a minor cleanup task.

| Task | Description | Status |
|------|-------------|--------|
| Audit state complexity | Identified 5 extraction targets | ✅ |
| Create `file-tree-builder.ts` | `buildFileTree()`, `computeProjectIndex()` | ✅ |
| Create `git-operations.ts` | `getGitChanges()`, `childProcessToPromise()` | ✅ |
| Create `knowledge-files.ts` | Knowledge file discovery and selection utilities | ✅ |
| Create `project-discovery.ts` | `discoverProjectFiles()` | ✅ |
| Create `session-state-processors.ts` | `processAgentDefinitions()`, `processCustomToolDefinitions()` | ✅ |
| Simplify main function | Reduced to orchestration only | ✅ |
| Update re-exports | Maintain backward compatibility for tests | ✅ |

**New Files Created:**
- `sdk/src/impl/file-tree-builder.ts` (~95 lines) - File tree construction and token scoring
- `sdk/src/impl/git-operations.ts` (~85 lines) - Git state retrieval
- `sdk/src/impl/knowledge-files.ts` (~115 lines) - Knowledge file discovery and selection
- `sdk/src/impl/project-discovery.ts` (~50 lines) - Project file discovery using gitignore
- `sdk/src/impl/session-state-processors.ts` (~55 lines) - Agent/tool definition processing

**Code Reduction:**
- `run-state.ts`: ~737 → ~315 lines (-57%)

**Test Results:**
- 281 SDK tests pass
- TypeScript compiles cleanly
- Backward compatibility maintained via re-exports

**Dependencies:** Commit 2.15  
**Risk:** Medium  
**Rollback:** Revert single commit

---

## Phase 3: Cleanup (Week 6-7)

### Commit 3.1: DRY Up Auto-Topup Logic ✅ COMPLETE
**Files:** `packages/billing/src/auto-topup.ts`, `packages/billing/src/auto-topup-helpers.ts`  
**Est. Time:** 2-3 hours  
**Actual Time:** ~4 hours (including multi-agent review and comprehensive unit tests)  
**Est. LOC Changed:** ~200-250  
**Actual LOC Changed:** ~800 lines (196 helpers + 61 unit tests file + review fixes)

| Task | Description | Status |
|------|-------------|--------|
| Create `auto-topup-helpers.ts` | Shared payment method helpers | ✅ |
| Extract `fetchPaymentMethods()` | Fetch card + link payment methods | ✅ |
| Extract `isValidPaymentMethod()` | Card expiration + link validation | ✅ |
| Extract `filterValidPaymentMethods()` | Filter to valid-only methods | ✅ |
| Extract `findValidPaymentMethod()` | Find first valid method | ✅ |
| Extract `createPaymentIntent()` | Payment intent with idempotency | ✅ |
| Extract `getOrSetDefaultPaymentMethod()` | Default payment method logic | ✅ |
| Multi-agent code review | 4 CLI agents reviewed (Codebuff, Codex, Claude Code, Gemini) | ✅ |
| Apply review fixes | 13 issues fixed from review | ✅ |
| Add comprehensive unit tests | 61 tests for all helper functions | ✅ |

**New Files Created:**
- `packages/billing/src/auto-topup-helpers.ts` (~170 lines) - Shared helpers:
  - `fetchPaymentMethods()` - Parallel fetch of card + link methods
  - `isValidPaymentMethod()` - Card expiration validation, link always valid
  - `filterValidPaymentMethods()` - Filter array to valid-only
  - `findValidPaymentMethod()` - Find first valid method
  - `createPaymentIntent()` - Payment intent with idempotency key
  - `getOrSetDefaultPaymentMethod()` - Get/set default with `{ paymentMethodId, wasUpdated }` return
- `packages/billing/src/__tests__/auto-topup-helpers.test.ts` (~575 lines) - 61 comprehensive tests

**Multi-Agent Review Findings (Codebuff, Codex, Claude Code, Gemini):**

| Issue | Source | Severity | Resolution |
|-------|--------|----------|------------|
| `any` type for logContext | Claude Code, Codebuff | Critical | Created `OrgAutoTopupLogContext` interface |
| Stale sync_failures comment | Claude Code | Critical | Removed misleading comment |
| Error type loss when re-throwing | Gemini | Warning | Preserved `AutoTopupValidationError` type |
| Org payment method not validated | Codebuff | Warning | Added expiration validation to org flow |
| Schema inconsistency (nullable) | Claude Code | Warning | Made auto_topup fields nullable in orgs |
| Helper API returns just string | Gemini | Suggestion | Changed to `{ paymentMethodId, wasUpdated }` |
| misc.ts catch-all tables | Gemini | Warning | Moved message/adImpression to billing.ts |
| Trivial comments | Claude Code | Suggestion | Removed obvious comments |
| Payment method type limitations | Codebuff, Gemini | Suggestion | Added JSDoc explaining card+link only |
| Code duplication in validation | Codebuff | Suggestion | Extracted `isValidPaymentMethod()` helper |
| Misleading index comment | Claude Code | Warning | Fixed orgRepo comment |

**Review Fixes Applied:**
| Fix | Description |
|-----|-------------|
| Fix `any` type | Created `OrgAutoTopupLogContext` interface |
| Remove stale comment | Deleted sync_failures comment |
| Preserve error type | Re-throw original error instead of wrapping |
| Add org validation | Call `filterValidPaymentMethods()` in org flow |
| Schema consistency | Made auto_topup_threshold/amount nullable |
| Improve API | Return `{ paymentMethodId, wasUpdated }` |
| Move tables | message/adImpression → billing.ts |
| Extract helpers | `isValidPaymentMethod()`, `filterValidPaymentMethods()` |
| Delete misc.ts | Empty file removed |

**Unit Test Coverage (61 tests):**

| Function | Tests | Coverage |
|----------|-------|----------|
| `isValidPaymentMethod` | 17 | Card expiration, link, unsupported types |
| `filterValidPaymentMethods` | 8 | Empty, all valid, all invalid, mixed, order |
| `findValidPaymentMethod` | 11 | Empty, single, mixed, first valid, order |
| `fetchPaymentMethods` | 6 | Combined, empty, cards-only, links-only, API params |
| `createPaymentIntent` | 9 | Params, response, currency, off_session, confirm, idempotency, metadata, errors |
| `getOrSetDefaultPaymentMethod` | 10 | Existing default, no default, invalid default, expanded object, deleted customer, logging, errors |

**Test Results:**
- 117 billing tests pass (was 81, +36 new tests)
- All 13 package typechecks pass

**Commits:**
- `d73af9f71` - Initial DRY extraction
- `8611c2a00` - All code review fixes applied
- `abfedd8b8` - Unit tests for isValidPaymentMethod/filterValidPaymentMethods (25 tests)
- `a9940ea8c` - Unit tests for findValidPaymentMethod (11 tests)
- `8e5b7898e` - Unit tests for fetchPaymentMethods (6 tests)
- `8fd52177d` - Unit tests for createPaymentIntent (9 tests)
- `e8469339a` - Unit tests for getOrSetDefaultPaymentMethod (10 tests)

**Dependencies:** Commit 2.4 (billing)  
**Risk:** Medium - Financial logic  
**Rollback:** Revert commits in reverse order

---

### Commit 3.2: Split `db/schema.ts` ✅ COMPLETE
**Files:** `packages/internal/src/db/schema.ts` → `packages/internal/src/db/schema/`  
**Est. Time:** 2-3 hours  
**Actual Time:** ~2 hours  
**Est. LOC Changed:** ~600-700  
**Actual LOC Changed:** ~790 lines reorganized

| Task | Description | Status |
|------|-------------|--------|
| Create `schema/enums.ts` | All pgEnum definitions | ✅ |
| Create `schema/users.ts` | User-related tables | ✅ |
| Create `schema/billing.ts` | Billing tables (+ message, adImpression from misc.ts) | ✅ |
| Create `schema/organizations.ts` | Organization tables | ✅ |
| Create `schema/agents.ts` | Agent tables | ✅ |
| Create `schema/index.ts` | Unified re-exports | ✅ |
| Update schema.ts | Re-export from schema/index.ts for backwards compatibility | ✅ |
| Delete misc.ts | Empty file after moving tables to billing.ts | ✅ |

**New Directory Structure:**
```
packages/internal/src/db/schema/
├── index.ts        - Unified exports
├── enums.ts        - All pgEnum definitions
├── users.ts        - User, session, profile tables
├── billing.ts      - Credit ledger, grants, message, adImpression
├── organizations.ts - Organization, membership, repo tables
└── agents.ts       - Agent configs, evals, traces
```

**Dependencies:** None  
**Risk:** Low - Pure schema organization  
**Rollback:** Revert single commit  
**Commit:** `0aff8458d`

---

### Commit 3.3: Remove Dead Code (Batch 1) ✅ COMPLETE
**Files:** `packages/agent-runtime/src/tool-stream-parser.old.ts`  
**Est. Time:** 2-3 hours  
**Actual Time:** ~30 minutes  
**Est. LOC Changed:** ~400-600  
**Actual LOC Changed:** -217 lines (deleted file)

| Task | Description | Status |
|------|-------------|--------|
| Delete `tool-stream-parser.old.ts` | Unused file with `.old.ts` suffix | ✅ |

**Notes:**
- `old-constants.ts` retained: 52+ imports still depend on it, migration deferred
- Deprecated type aliases retained: Still in use, migration deferred

**Dependencies:** All Phase 2 commits  
**Risk:** Low  
**Rollback:** Revert single commit  
**Commit:** `68a0eb6cc`

---

### Commit 3.4: Remove Dead Code (Batch 2) ✅ COMPLETE
**Files:** `packages/internal/src/db/schema/misc.ts`  
**Est. Time:** 2-3 hours  
**Actual Time:** ~15 minutes (combined with review fixes)  
**Est. LOC Changed:** ~400-600  
**Actual LOC Changed:** File deleted after tables moved to billing.ts

| Task | Description | Status |
|------|-------------|--------|
| Delete empty `misc.ts` | Tables moved to billing.ts in review fixes | ✅ |

**Dependencies:** Commit 3.3  
**Risk:** Low  
**Rollback:** Revert single commit  
**Commit:** `8611c2a00` (part of review fixes commit)

---

## Deferred Work (Backlog)

The following items have been deferred due to unclear ROI or scope concerns:

### ❌ Agent Consolidation (Originally 2.15, 2.16)
**Reason:** Working code being refactored for aesthetics. Unclear ROI.  
**Revisit When:** Bugs traced to agent fragmentation, or new agent development blocked by duplication.

| Original Commit | Description | Est. Hours |
|-----------------|-------------|------------|
| Reviewer agents (5-14 agents) | Consolidate into 2-3 | 4-6 |
| File explorer micro-agents (9 agents) | Consolidate into unified agent | 4-6 |

### ❌ Pluralize Replacement (Originally 3.1)
**Reason:** Adds npm dependency for working code. 191 lines is acceptable for custom pluralization.  
**Revisit When:** Pluralization bugs reported, or major i18n work planned.

---

## Commit Dependency Graph

```
Phase 1 (Critical) - Week 1-2:
1.1a chat-state ────────────┐
                            ▼
1.1b chat-ui ───────────────┤
                            │
1.2 context-pruner          │
1.3 old-constants           │
1.4 project-file-tree       │
                            │
Phase 2 (Warnings) - Week 3-5:
                            ▼
2.1 use-send-message ◄──────┘
                            
2.2 block-utils + think-tags (parallel track)
                            
2.3 run-agent-step ◄──── 1.1b (patterns)

2.4 billing (can start Week 3)
    │
    ▼
3.1 auto-topup (Phase 3)

2.5a multiline-nav ◄──── 2.1
    │
    ▼
2.5b multiline-edit

2.6 use-activity-query  ─┐
2.7 XML parsing          ├─► (parallel - no dependencies)
2.8 analytics            │
2.11 image handling      │
2.12 suggestion-engine   │
2.13 browser + string    ┘

2.9 doStream ─────────────┐
                          ▼
2.10 OpenRouter stream ───┤
                          ▼
2.15 promptAiSdkStream ───┤
                          ▼
2.16 run-state.ts ────────┘

2.14 agent-builder (parallel)

Phase 3 (Cleanup) - Week 6-7:
3.1 auto-topup ◄──── 2.4
3.2 db/schema
3.3 dead code batch 1 ◄── all Phase 2
3.4 dead code batch 2 ◄── 3.3
```

---

## Parallelization Analysis

### Independent Parallel Tracks

Based on the dependency graph, there are **4 distinct parallel tracks** that different developers can work on simultaneously:

---

#### **Track A: Chat/UI Refactoring** (1 Developer - "Chat Lead")

Sequential chain - must be done in order:

```
Week 1-2: 1.1a (chat-state) → 1.1b (chat-ui)
Week 3:   2.1 (use-send-message) 
Week 4:   2.5a (multiline-nav) → 2.5b (multiline-edit)
```

| Commit | Description | Hours | Depends On |
|--------|-------------|-------|------------|
| 1.1a | Extract chat state management | 5-6 | None |
| 1.1b | Extract chat UI and orchestration | 5-6 | 1.1a |
| 2.1 | Refactor use-send-message.ts | 4-5 | 1.1b |
| 2.5a | Extract multiline keyboard navigation | 3-4 | 2.1 |
| 2.5b | Extract multiline editing handlers | 3-4 | 2.5a |

**Total: 20-25 hours**

---

#### **Track B: Common Utilities** (1 Developer - "Utils Lead")

Mostly independent work - can be done in any order after Phase 1 foundations:

```
Week 1-2: 1.3 (old-constants), 1.4 (project-file-tree)
Week 3-5: 2.2 (block-utils + think-tags)
          2.7 (XML parsing)        ← parallel
          2.8 (analytics)          ← parallel
          2.11 (image handling)    ← parallel
          2.12 (suggestion-engine) ← parallel
          2.13 (browser + string)  ← parallel
```

| Commit | Description | Hours | Depends On |
|--------|-------------|-------|------------|
| 1.3 | Split old-constants.ts god module | 2-3 | None |
| 1.4 | Fix silent error swallowing | 1-2 | None |
| 2.2 | Consolidate block utils + think tags | 3-4 | None |
| 2.7 | Consolidate XML parsing | 2-3 | None |
| 2.8 | Consolidate analytics | 3-4 | None |
| 2.11 | Consolidate image handling | 2-3 | None |
| 2.12 | Refactor suggestion-engine | 2-3 | None |
| 2.13 | Fix browser actions + string utils | 2-3 | None |

**Total: 18-24 hours**

---

#### **Track C: Runtime/Streaming** (1 Developer - "Runtime Lead")

Sequential chain with streaming dependency:

```
Week 1-2: 1.2 (context-pruner)
Week 3:   2.3 (run-agent-step) - waits for 1.1b patterns
Week 4-5: 2.9 (doStream) → 2.10 (OpenRouter) → 2.15 (promptAiSdkStream) → 2.16 (run-state)
Week 6:   2.14 (agent-builder) - independent, can slot anywhere
```

| Commit | Description | Hours | Depends On |
|--------|-------------|-------|------------|
| 1.2 | Refactor context-pruner god function | 4-5 | None |
| 2.3 | Refactor loopAgentSteps | 4-5 | 1.1b (patterns) |
| 2.9 | Refactor doStream | 3-4 | None |
| 2.10 | DRY up OpenRouter stream handling | 2-3 | 2.9 |
| 2.15 | Refactor promptAiSdkStream | 3-4 | 2.10 |
| 2.16 | Simplify run-state.ts | 3-4 | 2.15 |
| 2.14 | Refactor agent-builder.ts | 2-3 | None |

**Total: 22-28 hours**

---

#### **Track D: Billing** (1 Developer - "Billing Lead" or shared)

Short but high-risk:

```
Week 3-4: 2.4 (billing consolidation) - 6-8 hours
Week 6:   3.1 (auto-topup) - depends on 2.4
```

| Commit | Description | Hours | Depends On |
|--------|-------------|-------|------------|
| 2.4 | Consolidate billing duplication | 6-8 | None |
| 3.1 | DRY up auto-topup logic | 2-3 | 2.4 |

**Total: 8-11 hours**

> **Note:** Developer on Track D can assist Track B after completing billing work.

---

### Week-by-Week Parallel Schedule

| Week | Track A (Chat) | Track B (Utils) | Track C (Runtime) | Track D (Billing) |
|------|----------------|-----------------|-------------------|-------------------|
| **1** | 1.1a chat-state | 1.3 old-constants | 1.2 context-pruner | - |
| **2** | 1.1b chat-ui | 1.4 file-tree | - | - |
| *Stability* | *48h monitor* | *48h monitor* | *48h monitor* | - |
| **3** | 2.1 send-message | 2.2 block-utils | 2.3 run-agent-step | 2.4 billing |
| **4** | 2.5a multiline-nav | 2.7, 2.8 (parallel) | 2.9 doStream | (billing cont.) |
| **5** | 2.5b multiline-edit | 2.11, 2.12, 2.13 | 2.10, 2.15 | - |
| **6** | - | 2.14 agent-builder | 2.16 run-state | 3.1 auto-topup |
| *Stability* | *48h monitor* | *48h monitor* | *48h monitor* | - |
| **7** | 3.3 dead code | 3.2 db/schema | 3.4 dead code | - |

---

### Sync Points (Mandatory Coordination)

These commits create dependencies that require coordination between tracks:

| After Commit | Blocks | Reason |
|--------------|--------|--------|
| **1.1b** | 2.1, 2.3 | Chat patterns must be established first |
| **2.1** | 2.5a | Send-message patterns inform input hooks |
| **2.9** | 2.10, 2.15 | Streaming refactor is sequential |
| **2.4** | 3.1 | Billing core before auto-topup |
| **All Phase 2** | 3.3, 3.4 | Dead code removal needs stable codebase |

**Recommended sync meetings:**
- End of Week 2 (before Phase 2)
- End of Week 4 (mid-Phase 2 check-in)
- End of Week 6 (before Phase 3)

---

### Commits With Zero Dependencies (Start Anytime)

These can be picked up by anyone with spare capacity:

| Commit | Description | Hours | Risk |
|--------|-------------|-------|------|
| 1.2 | context-pruner.ts | 4-5 | Medium |
| 1.3 | old-constants.ts | 2-3 | Low |
| 1.4 | project-file-tree.ts | 1-2 | Low |
| 2.2 | block-utils + think tags | 3-4 | Low |
| 2.6 | use-activity-query.ts | 4-5 | Medium |
| 2.7 | XML parsing | 2-3 | Low |
| 2.8 | analytics | 3-4 | Low |
| 2.9 | doStream | 3-4 | Medium |
| 2.11 | image handling | 2-3 | Low |
| 2.12 | suggestion-engine | 2-3 | Low |
| 2.13 | browser + string utils | 2-3 | Low |
| 2.14 | agent-builder.ts | 2-3 | Low |
| 3.2 | db/schema.ts | 2-3 | Low |

---

### Visual Timeline by Team Size

#### Solo Developer (1 person)

```
Week 1:  ████ 1.1a ████ 1.3 ██ 1.4 ██
Week 2:  ████ 1.1b ████ 1.2 ████
         [48h stability window]
Week 3:  ████ 2.1 ████ 2.2 ████
Week 4:  ████ 2.3 ████ 2.4 ████████
Week 5:  ██ 2.5a ██ 2.5b ██ 2.6 ██ 2.7 ██
Week 6:  ██ 2.8 ██ 2.9 ██ 2.10 ██ 2.11 ██
Week 7:  ██ 2.12 ██ 2.13 ██ 2.14 ██ 2.15 ██
Week 8:  ██ 2.16 ██ 3.1 ██ 3.2 ██
         [48h stability window]
Week 9:  ██ 3.3 ██ 3.4 ██
```

**Total: ~9 weeks**

---

#### Dual Developer (2 people)

```
Week 1:
  Dev 1 (Chat/Runtime): ████ 1.1a ████ 1.2 ████
  Dev 2 (Utils):        ██ 1.3 ██ 1.4 ██ 2.2 ██

Week 2:
  Dev 1 (Chat/Runtime): ████ 1.1b ████
  Dev 2 (Utils):        ██ 2.7 ██ 2.8 ██ 2.11 ██
         [48h stability window]

Week 3:
  Dev 1 (Chat/Runtime): ████ 2.1 ████ 2.3 ████
  Dev 2 (Utils/Billing): ████████ 2.4 ████████

Week 4:
  Dev 1 (Chat/Runtime): ██ 2.5a ██ 2.5b ██ 2.6 ██
  Dev 2 (Streaming):    ██ 2.9 ██ 2.10 ██ 2.12 ██ 2.13 ██

Week 5:
  Dev 1 (SDK):          ██ 2.14 ██ 2.15 ██ 2.16 ██
  Dev 2 (Cleanup):      ██ 3.1 ██ 3.2 ██
         [48h stability window]

Week 6:
  Both:                 ██ 3.3 ██ 3.4 ██ [buffer]
```

**Total: ~6 weeks**

---

#### Full Parallelization (4 Developers)

```
Week 1:
  Dev 1 (Chat):    ████ 1.1a ████
  Dev 2 (Utils):   ██ 1.3 ██ 1.4 ██ 2.2 ██
  Dev 3 (Runtime): ████ 1.2 ████
  Dev 4 (Billing): [idle - billing starts week 3]

Week 2:
  Dev 1 (Chat):    ████ 1.1b ████
  Dev 2 (Utils):   ██ 2.7 ██ 2.8 ██
  Dev 3 (Runtime): [buffer / help Utils]
  Dev 4 (Billing): [buffer / help Utils]
         [48h stability window]

Week 3:
  Dev 1 (Chat):    ████ 2.1 ████
  Dev 2 (Utils):   ██ 2.11 ██ 2.12 ██ 2.13 ██
  Dev 3 (Runtime): ████ 2.3 ████ 2.9 ████
  Dev 4 (Billing): ██████ 2.4 ██████

Week 4:
  Dev 1 (Chat):    ██ 2.5a ██ 2.5b ██ 2.6 ██
  Dev 2 (Utils):   ██ 2.14 ██ [help others]
  Dev 3 (Runtime): ██ 2.10 ██ 2.15 ██ 2.16 ██
  Dev 4 (Billing): ██ 3.1 ██ [help Cleanup]
         [48h stability window]

Week 5:
  All devs:        ██ 3.2 ██ 3.3 ██ 3.4 ██ [buffer]
```

**Total: ~5 weeks**

---

### Team Size Impact Summary

| Team Size | Duration | Efficiency | Coordination Overhead |
|-----------|----------|------------|----------------------|
| 1 developer | 9 weeks | 100% utilization | None |
| 2 developers | 6 weeks | ~85% utilization | Low (weekly sync) |
| 3 developers | 5.5 weeks | ~75% utilization | Medium (2x/week sync) |
| 4 developers | 5 weeks | ~65% utilization | High (daily standup) |

> **Recommendation:** 2-3 developers is the sweet spot for this refactoring effort. 
> 4 developers provides diminishing returns due to coordination overhead and dependency bottlenecks.

---

## Testing Strategy Per Commit

| Commit | Testing Required | Estimated Test Time |
|--------|-----------------|---------------------|
| 1.1a, 1.1b | Full E2E + manual CLI + visual regression | +2h each |
| 1.2, 2.3 | Agent integration tests + unit tests | +1h each |
| 1.3, 1.4 | Unit tests + type checking | +30min each |
| 2.1, 2.5a, 2.5b | CLI integration tests + keyboard tests | +1h each |
| 2.4, 3.1 | Financial accuracy tests + staging validation | +2h each |
| 2.9, 2.10, 2.15 | Streaming E2E tests | +1h each |
| 2.6-2.8, 2.11-2.14 | Unit tests + type checking | +30min each |
| 3.2-3.4 | Full regression suite | +1h total |

---

## Feature Flags Required

| Commit | Flag Name | Default | Staged Rollout |
|--------|-----------|---------|----------------|
| 1.1a, 1.1b | `REFACTOR_CHAT_STATE` | `false` | 10% → 50% → 100% |
| 2.3 | `REFACTOR_AGENT_LOOP` | `false` | 5% → 25% → 100% |
| 2.4 | `REFACTOR_BILLING` | `false` | 1% → 10% → 50% → 100% |
| 2.9, 2.10 | `REFACTOR_STREAM` | `false` | 10% → 50% → 100% |

---

## Risk Mitigation

### High-Risk Commits (require extra review)
- **1.1a, 1.1b** - `chat.tsx`: Core UI, use feature flag
- **2.3** - `run-agent-step.ts`: Core runtime, use feature flag
- **2.4** - Billing: Financial accuracy, staged rollout, finance team sign-off
- **2.9, 2.10** - Streaming: Core functionality, use feature flag

### Rollback Procedures

| Phase | Rollback Procedure | Time to Rollback |
|-------|-------------------|------------------|
| Phase 1 | Feature flag off + git revert | < 5 minutes |
| Phase 2 (billing) | Immediate revert + flag off + on-call page | < 2 minutes |
| Phase 2 (other) | Git revert + redeploy | < 15 minutes |
| Phase 3 | Git revert + redeploy | < 15 minutes |

### Stability Windows
- **48 hours** between Phase 1 and Phase 2
- **48 hours** between Phase 2 and Phase 3
- **No deploys** on Fridays for refactoring changes

---

## Revised Schedule (7-8 Weeks)

| Week | Commits | Hours | Focus |
|------|---------|-------|-------|
| Week 1 | 1.1a, 1.1b | 10-12 | Chat.tsx extraction |
| Week 2 | 1.2, 1.3, 1.4 | 6-9 | Remaining critical issues |
| **Stability Window** | - | 48h | Monitor, fix issues |
| Week 3 | 2.1, 2.2, 2.3 | 11-14 | Core hook refactoring |
| Week 4 | 2.4, 2.5a, 2.5b, 2.6 | 16-22 | Billing + input |
| Week 5 | 2.7-2.13 | 18-24 | Parallel utility work |
| Week 6 | 2.14-2.16, 3.1 | 10-14 | SDK + auto-topup |
| **Stability Window** | - | 48h | Monitor, fix issues |
| Week 7 | 3.2, 3.3, 3.4 | 6-9 | Cleanup |
| Week 8 | Buffer | 0-10 | Overflow, polish |

### Time Breakdown
| Activity | Hours |
|----------|-------|
| Implementation | 84-108 |
| PR Review (2h × 22 commits) | 44 |
| Testing overhead | ~20 |
| Buffer (unexpected issues) | ~15 |
| **Total** | **163-187** |

---

## Success Metrics

### Code Quality Metrics
- [ ] No file > 400 lines (except schema files)
- [ ] No function > 100 lines
- [ ] No hook managing > 3 concerns
- [ ] Cyclomatic complexity < 15 for all functions
- [ ] 0 duplicate implementations of core utilities
- [ ] All tests passing
- [ ] No increase in bundle size > 5%
- [ ] Improved code coverage (target: +5%)

### Runtime Metrics (New)
- [ ] P95 latency unchanged (within 5%)
- [ ] Error rate unchanged (within 0.1%)
- [ ] Memory usage unchanged (within 10%)
- [ ] No new Sentry errors post-deploy

### Observability Checkpoint (After Phase 1)
- [ ] Verify Datadog/Sentry dashboards show no regressions
- [ ] Confirm feature flag metrics are tracked
- [ ] Review on-call incidents for any refactoring-related issues

---

## Hook Refactoring Template

> **Recommended pattern** established after Commit 1.1. Apply consistently.

```typescript
// Before: God hook with multiple concerns
function useGodHook() {
  // State management (100+ lines)
  // Business logic (100+ lines)  
  // UI effects (50+ lines)
}

// After: Composed hooks with single responsibility
function useComposedHook() {
  const state = useStateSlice()
  const logic = useBusinessLogic(state)
  const effects = useUIEffects(logic)
  return { ...state, ...logic, ...effects }
}
```

Apply this pattern to:
- `use-send-message.ts` (Commit 2.1)
- `multiline-input.tsx` (Commits 2.5a, 2.5b)
- `use-activity-query.ts` (Commit 2.6)
- `use-suggestion-engine.ts` (Commit 2.12)

---

## Notes

- Time estimates assume familiarity with the codebase
- Estimates include writing/updating tests and PR review
- 40% buffer applied to all estimates (vs. original 20%)
- Some commits may be combined if changes are smaller than expected
- Some commits may need to be split if changes are larger than expected
- **Scope creep risk:** Resist adding "while we're here" changes to commits
