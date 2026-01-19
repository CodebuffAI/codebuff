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

> **Last Updated:** Wave 1 Complete
> **Current Status:** Ready for Wave 2 (Track A critical path)

### Phase 1 Progress
| Commit | Description | Status | Completed By |
|--------|-------------|--------|-------------|
| 1.1a | Extract chat state management | ⬜ Not Started | - |
| 1.1b | Extract chat UI and orchestration | ⬜ Not Started | - |
| 1.2 | Refactor context-pruner god function | ✅ Complete | Codex CLI |
| 1.3 | Split old-constants.ts god module | ✅ Complete | Codex CLI |
| 1.4 | Fix silent error swallowing | ✅ Complete | Codex CLI |

### Phase 2 Progress
| Commit | Description | Status | Completed By |
|--------|-------------|--------|-------------|
| 2.1 | Refactor use-send-message.ts | ⬜ Not Started | - |
| 2.2 | Consolidate block utils + think tags | ⬜ Not Started | - |
| 2.3 | Refactor loopAgentSteps | ⬜ Not Started | - |
| 2.4 | Consolidate billing duplication | ⬜ Not Started | - |
| 2.5a | Extract multiline keyboard navigation | ⬜ Not Started | - |
| 2.5b | Extract multiline editing handlers | ⬜ Not Started | - |
| 2.6 | Simplify use-activity-query.ts | ⬜ Not Started | - |
| 2.7 | Consolidate XML parsing | ⬜ Not Started | - |
| 2.8 | Consolidate analytics | ⬜ Not Started | - |
| 2.9 | Refactor doStream | ⬜ Not Started | - |
| 2.10 | DRY up OpenRouter stream handling | ⬜ Not Started | - |
| 2.11 | Consolidate image handling | ⬜ Not Started | - |
| 2.12 | Refactor suggestion-engine | ⬜ Not Started | - |
| 2.13 | Fix browser actions + string utils | ⬜ Not Started | - |
| 2.14 | Refactor agent-builder.ts | ⬜ Not Started | - |
| 2.15 | Refactor promptAiSdkStream | ⬜ Not Started | - |
| 2.16 | Simplify run-state.ts | ⬜ Not Started | - |

### Phase 3 Progress
| Commit | Description | Status | Completed By |
|--------|-------------|--------|-------------|
| 3.1 | DRY up auto-topup logic | ⬜ Not Started | - |
| 3.2 | Split db/schema.ts | ⬜ Not Started | - |
| 3.3 | Remove dead code batch 1 | ⬜ Not Started | - |
| 3.4 | Remove dead code batch 2 | ⬜ Not Started | - |

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

### Commit 2.1: Refactor `use-send-message.ts`
**Files:** `cli/src/hooks/use-send-message.ts`  
**Est. Time:** 4-5 hours  
**Est. LOC Changed:** ~400-500

| Task | Description |
|------|-------------|
| Extract `useBashHandler` hook | Bash command handling |
| Extract `useAttachmentHandler` hook | File attachment processing |
| Extract `useMessageExecution` hook | Core execution logic |
| Extract `useMessageErrors` hook | Error handling |
| Compose in main hook | Wire up extracted hooks |

**Dependencies:** Commits 1.1a, 1.1b (chat.tsx patterns)  
**Risk:** Medium  
**Rollback:** Revert single commit

---

### Commit 2.2: Consolidate Block Utils and Think Tag Parsing
**Files:** Multiple CLI files + `utils/think-tag-parser.ts`  
**Est. Time:** 3-4 hours  
**Est. LOC Changed:** ~550-650

> ⚠️ **Corrected:** `think-tag-parser.ts` already exists. Task is migration/consolidation, not creation.

| Task | Description |
|------|-------------|
| Audit all `updateBlocksRecursively` usages | Map duplicates |
| Create `utils/block-tree-utils.ts` | Unified block tree operations |
| Audit all think tag parsing | Map implementations |
| Migrate to existing `think-tag-parser.ts` | Use as single source |
| Add type-safe variants | `updateBlockById`, `parseThinkTags` |
| Replace all usages | Update imports across CLI |
| Add unit tests | Cover edge cases |

**Dependencies:** None  
**Risk:** Low  
**Rollback:** Revert single commit

---

### Commit 2.3: Refactor `loopAgentSteps` in `run-agent-step.ts`
**Files:** `packages/agent-runtime/src/run-agent-step.ts`  
**Est. Time:** 4-5 hours  
**Est. LOC Changed:** ~500-600

> **Moved from Phase 1:** Let chat.tsx patterns establish before tackling runtime.

| Task | Description |
|------|-------------|
| Extract `processToolCalls()` | Tool call handling |
| Extract `handleStreamEvents()` | Stream event processing |
| Extract `validateStepResult()` | Step validation logic |
| Create `AgentStepProcessor` class | Optional: OOP refactor |
| Simplify main loop | Reduce to coordination only |

**Dependencies:** Commits 1.1a, 1.1b (patterns)  
**Risk:** High - Core runtime, extensive testing required  
**Feature Flag:** `REFACTOR_AGENT_LOOP=true`  
**Rollback:** Revert and flag off

---

### Commit 2.4: Consolidate Billing Duplication
**Files:** `packages/billing/src/org-billing.ts`, `packages/billing/src/balance-calculator.ts`  
**Est. Time:** 6-8 hours  
**Est. LOC Changed:** ~500-600

> ⚠️ **Risk Upgraded to High:** Financial logic requires extensive testing and staged rollout.

| Task | Description |
|------|-------------|
| Create `billing-core.ts` | Shared billing logic |
| Extract `calculateBalance()` | Core calculation |
| Extract `applyCredits()` | Credit application |
| Refactor `consumeCreditsAndAddAgentStep` | Split into separate operations |
| Update org-billing to use shared code | DRY up implementation |
| Add comprehensive unit tests | Cover all financial paths |
| Add integration tests | Verify end-to-end billing |

**Dependencies:** None  
**Risk:** High - Financial accuracy critical  
**Feature Flag:** `REFACTOR_BILLING=true` (staged rollout to 1% → 10% → 100%)  
**Rollback:** Immediate revert + flag off  
**Extra Review:** Finance/billing team sign-off required

---

### Commit 2.5a: Extract Multiline Input Keyboard Navigation
**Files:** `cli/src/components/multiline-input.tsx`  
**Est. Time:** 3-4 hours  
**Est. LOC Changed:** ~500-550

> ⚠️ **Corrected:** File is 1,102 lines, not 350-450. Split into two commits.

| Task | Description |
|------|-------------|
| Create `useKeyboardNavigation` hook | Arrow keys, home/end |
| Create `useKeyboardShortcuts` hook | Ctrl+C, Ctrl+D, etc. |
| Update multiline-input | Delegate navigation to hooks |

**Dependencies:** Commit 2.1 (use-send-message patterns)  
**Risk:** Medium - User input handling  
**Rollback:** Revert single commit

---

### Commit 2.5b: Extract Multiline Input Editing Handlers
**Files:** `cli/src/components/multiline-input.tsx`  
**Est. Time:** 3-4 hours  
**Est. LOC Changed:** ~500-550

| Task | Description |
|------|-------------|
| Create `useKeyboardEditing` hook | Backspace, delete, paste |
| Create keyboard handler registry | Composable handler system |
| Simplify main component | Delegate all keyboard to hooks |
| Add comprehensive tests | Cover all key combinations |

**Dependencies:** Commit 2.5a  
**Risk:** Medium  
**Rollback:** Revert both 2.5a and 2.5b together

---

### Commit 2.6: Simplify `use-activity-query.ts`
**Files:** `cli/src/hooks/use-activity-query.ts`  
**Est. Time:** 4-5 hours  
**Est. LOC Changed:** ~500-600

| Task | Description |
|------|-------------|
| Evaluate external caching library | Consider `react-query` or similar |
| If keeping custom: Extract `QueryCache` class | Cache management |
| Extract `QueryExecutor` | Query execution logic |
| Extract `QueryInvalidation` | Invalidation strategies |
| Simplify main hook | Compose extracted pieces |

**Dependencies:** None  
**Risk:** Medium  
**Rollback:** Revert single commit

---

### Commit 2.7: Consolidate XML Parsing
**Files:** `common/src/util/saxy.ts` + 3 related files  
**Est. Time:** 2-3 hours  
**Est. LOC Changed:** ~400-500

| Task | Description |
|------|-------------|
| Audit all XML parsing usages | Map current implementations |
| Create unified `xml-parser.ts` | Single parsing module |
| Create typed interfaces | `XmlNode`, `XmlParser` |
| Migrate all usages | Update imports |
| Remove duplicate implementations | Clean up |

**Dependencies:** None (can run in parallel with 2.6)  
**Risk:** Low  
**Rollback:** Revert single commit

---

### Commit 2.8: Consolidate Analytics
**Files:** `common/src/analytics*.ts` (10+ files across packages)  
**Est. Time:** 3-4 hours  
**Est. LOC Changed:** ~500-600

> ⚠️ **Corrected:** 10+ files across packages, not just 4 in common.

| Task | Description |
|------|-------------|
| Audit all analytics files | Map across all packages |
| Create `analytics/index.ts` | Main entry point |
| Create `analytics/events.ts` | Event definitions |
| Create `analytics/providers.ts` | Provider implementations |
| Create `analytics/types.ts` | Shared types |
| Consolidate all files | Merge into new structure |

**Dependencies:** None (can run in parallel with 2.7)  
**Risk:** Low  
**Rollback:** Revert single commit

---

### Commit 2.9: Refactor `doStream` in OpenAI Compatible Model
**Files:** `packages/internal/src/ai-sdk/openai-compatible-chat-language-model.ts`  
**Est. Time:** 3-4 hours  
**Est. LOC Changed:** ~350-400

| Task | Description |
|------|-------------|
| Extract `StreamParser` class | Parsing logic |
| Extract `ChunkProcessor` | Chunk handling |
| Extract `StreamErrorHandler` | Error handling |
| Simplify `doStream` | Orchestration only |

**Dependencies:** None  
**Risk:** Medium - Core streaming  
**Feature Flag:** `REFACTOR_STREAM=true`  
**Rollback:** Revert and flag off

---

### Commit 2.10: DRY Up OpenRouter Stream Handling
**Files:** `packages/internal/src/ai-sdk/openrouter-ai-sdk/chat/index.ts`  
**Est. Time:** 2-3 hours  
**Est. LOC Changed:** ~300-400

| Task | Description |
|------|-------------|
| Create shared `stream-utils.ts` | Common streaming utilities |
| Extract shared chunk processing | Reuse across providers |
| Update OpenRouter implementation | Use shared code |
| Update OpenAI compatible | Use shared code |

**Dependencies:** Commit 2.9  
**Risk:** Medium  
**Rollback:** Revert single commit

---

### Commit 2.11: Consolidate Image Handling
**Files:** Clipboard/image related files in CLI  
**Est. Time:** 2-3 hours  
**Est. LOC Changed:** ~300-400

| Task | Description |
|------|-------------|
| Create `utils/image-handler.ts` | Unified image handling |
| Extract `processImageFromClipboard()` | Clipboard images |
| Extract `processImageFromFile()` | File images |
| Extract `validateImage()` | Image validation |
| Update all usages | Replace duplicates |

**Dependencies:** None (can run in parallel with 2.10)  
**Risk:** Low  
**Rollback:** Revert single commit

---

### Commit 2.12: Refactor `use-suggestion-engine.ts`
**Files:** `cli/src/hooks/use-suggestion-engine.ts`  
**Est. Time:** 2-3 hours  
**Est. LOC Changed:** ~350-450

| Task | Description |
|------|-------------|
| Extract `useSuggestionCache` hook | Caching logic |
| Extract `useSuggestionRanking` hook | Ranking algorithms |
| Extract `useSuggestionFiltering` hook | Filter logic |
| Compose in main hook | Wire up |

**Dependencies:** None (can run in parallel with 2.11)  
**Risk:** Low  
**Rollback:** Revert single commit

---

### Commit 2.13: Fix Browser Actions and String Utils
**Files:** `common/src/browser-actions.ts`, `common/src/util/string.ts`  
**Est. Time:** 2-3 hours  
**Est. LOC Changed:** ~200-300

> **Combined:** Original 2.13 + 2.14 merged (small changes)

| Task | Description |
|------|-------------|
| Create `parseActionValue()` utility | Single parsing function |
| Add type guards | `isValidActionValue()` |
| Replace duplicated parsing | Use new utility |
| Consolidate regex patterns | Single source of truth for lazy edit |
| Create named constants | `LAZY_EDIT_PATTERNS` |
| Add unit tests | Cover edge cases |

**Dependencies:** None (can run in parallel with 2.12)  
**Risk:** Low  
**Rollback:** Revert single commit

---

### Commit 2.14: Refactor `agent-builder.ts`
**Files:** `agents/agent-builder.ts`  
**Est. Time:** 2-3 hours  
**Est. LOC Changed:** ~300-400

| Task | Description |
|------|-------------|
| Extract file I/O helpers | `readAgentFile()`, `writeAgentFile()` |
| Create prompt templates | Separate from logic |
| Add proper error handling | Replace brittle I/O |
| Add input validation | Validate agent configs |

**Dependencies:** None  
**Risk:** Low  
**Rollback:** Revert single commit

---

### Commit 2.15: Refactor `promptAiSdkStream` in SDK
**Files:** `sdk/src/impl/llm.ts`  
**Est. Time:** 3-4 hours  
**Est. LOC Changed:** ~350-450

| Task | Description |
|------|-------------|
| Extract `StreamConfig` builder | Configuration handling |
| Extract `StreamEventEmitter` | Event emission |
| Extract `StreamErrorHandler` | Error handling |
| Simplify main function | Orchestration only |

**Dependencies:** Commits 2.9, 2.10 (streaming patterns)  
**Risk:** Medium  
**Rollback:** Revert single commit

---

### Commit 2.16: Simplify `run-state.ts` in SDK
**Files:** `sdk/src/run-state.ts`  
**Est. Time:** 3-4 hours  
**Est. LOC Changed:** ~400-500

> **Moved from Phase 3:** File is 737 lines, not a minor cleanup task.

| Task | Description |
|------|-------------|
| Audit state complexity | Identify unnecessary parts |
| Extract state machine helpers | `createStateTransition()` |
| Remove unused state fields | Clean up |
| Simplify state transitions | Reduce complexity |
| Update tests | Ensure coverage |

**Dependencies:** Commit 2.15  
**Risk:** Medium  
**Rollback:** Revert single commit

---

## Phase 3: Cleanup (Week 6-7)

### Commit 3.1: DRY Up Auto-Topup Logic
**Files:** `packages/billing/src/auto-topup.ts`  
**Est. Time:** 2-3 hours  
**Est. LOC Changed:** ~200-250

| Task | Description |
|------|-------------|
| Create `TopupProcessor` | Shared processing logic |
| Extract user/org differences | Configuration-based |
| Reduce duplication | Single implementation |

**Dependencies:** Commit 2.4 (billing)  
**Risk:** Medium - Financial logic  
**Rollback:** Revert single commit

---

### Commit 3.2: Split `db/schema.ts`
**Files:** `packages/internal/src/db/schema.ts` → multiple files  
**Est. Time:** 2-3 hours  
**Est. LOC Changed:** ~600-700

> ⚠️ **Corrected:** Schema file is in `packages/internal/`, not `packages/billing/`.

| Task | Description |
|------|-------------|
| Create `schema/users.ts` | User-related tables |
| Create `schema/billing.ts` | Billing tables |
| Create `schema/organizations.ts` | Org tables |
| Create `schema/agents.ts` | Agent tables |
| Create `schema/index.ts` | Re-exports |

**Dependencies:** None  
**Risk:** Low - Pure schema organization  
**Rollback:** Revert single commit

---

### Commit 3.3: Remove Dead Code (Batch 1)
**Files:** Various  
**Est. Time:** 2-3 hours  
**Est. LOC Changed:** ~400-600

| Task | Description |
|------|-------------|
| Remove commented code | Clean up |
| Remove unused exports | Clean up |
| Remove unused imports | Clean up |
| Update affected tests | Ensure coverage |

**Dependencies:** All Phase 2 commits  
**Risk:** Low  
**Rollback:** Revert single commit

---

### Commit 3.4: Remove Dead Code (Batch 2)
**Files:** Various  
**Est. Time:** 2-3 hours  
**Est. LOC Changed:** ~400-600

| Task | Description |
|------|-------------|
| Remove unused utilities | Clean up |
| Remove deprecated functions | Clean up |
| Update documentation | Reflect changes |

**Dependencies:** Commit 3.3  
**Risk:** Low  
**Rollback:** Revert single commit

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
