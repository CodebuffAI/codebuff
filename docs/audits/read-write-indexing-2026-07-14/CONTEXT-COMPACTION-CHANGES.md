# Context and compaction architecture changes

Marked complete on 2026-07-14.

## Completed changes

- Context-window-aware semantic budgets for configured models from 8k through 1m tokens.
- Live budget and provider-safe limit recomputation when model routing or failover changes the active context window.
- Authoritative runtime budget injection into the serialized context-pruner.
- Per-agent parent-history modes: `none`, `pinned`, and `full`.
- Isolated inline-agent system prompts, tools, agent context, and private message histories.
- Explicit `propagateMessageHistoryChanges` capability for the small set of agents allowed to replace parent history.
- Bounded structured handoffs and bounded child outputs before they enter another agent's history.
- Structured manual-compaction envelope with the newest authoritative pinned memory.
- Immediate checkpoint persistence after automatic semantic or mechanical compaction.
- Preservation of tagged live user prompts in `<knowledge_memory>`.
- Opaque single-line reviewer snapshot fingerprints, with snapshot details separated from the echoed attestation token.
- Reviewer protocol failures receive one reviewer-only retry and are no longer routed to source repair agents.
- Versioned typed task memory with revision CAS, checksum, bounded evidence,
  workspace provenance, and legacy `<knowledge_memory>` import.
- A per-request context compiler that prioritizes requirements, decisions,
  blockers, workspace revision, and next actions before lower-value evidence.
- Transactional `set_messages` commits for transcript plus task-memory state.
- Failover-safe budgeting based on the smallest declared window across each
  agent's independently configured primary and fallback routes.
- Workspace-revision invalidation of stale read/edit/validation/review evidence.
- Repeated-compaction and parent/child isolation regression coverage.

## Verification recorded

- Focused reviewer/gate regression suite: 94 passed, 0 failed.
- Focused context, compaction, handoff, and agent-isolation suite: 163 passed, 0 failed.
- Broader implementation validation previously completed: workspace typecheck; agent-runtime, common, SDK, and agent suites passed except two network-dependent agent tests blocked by restricted access to `agentrouter.org`.

## Current state

The previously identified architectural tier is implemented. Conversation
summaries remain useful human-readable history, but they are no longer the sole
operational source of truth. Typed memory and workspace state survive repeated
compaction, are compiled separately for each agent/model route, and invalidate
revision-stale evidence. Future work is primarily measurement: larger recall
eval corpora, long-running external-mutation soak tests, and provider-specific
token-accounting calibration.
