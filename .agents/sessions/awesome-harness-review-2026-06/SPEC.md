# Awesome Harness Engineering Review — SPEC

## Overview
Compare the curated list at https://github.com/walkinglabs/awesome-harness-engineering against Openbuff's current harness and surface concrete improvements organized by priority and section. Deliver a durable review artifact the team can use to drive follow-up work, not an implementation PR.

## Goals
- Map every section in the awesome list to our current state (covered / partial / missing / non-adoption).
- Identify concrete improvements with file targets, rationale, and rough priority.
- Be honest about what we already do well (do not reinvent existing primitives).
- Produce durable artifacts that a future session can resume from.

## Non-Goals
- Implement any improvement in this session — this is a review and roadmap, not a refactor.
- Re-litigate the BYOK / hosted-surface cleanup completed in `byok-cli-only-cleanup-2026-06`.
- Cover every benchmark in the list — only flag ones that would meaningfully change how we measure harness quality.
- Write a comprehensive literature review — link to the awesome list as the source of truth.

## Requirements
- One table per awesome-list section: row per resource, columns `Have it?`, `Status`, `Notes`.
- One prioritized recommendation list: P0/P1/P2 with one-line `Where` / `Why` / `Effort` per item.
- All file paths must point to real files in this repo (verified via `read_files` or `git_status`) or be marked as new files.
- Resumable: `STATUS.md` tracks which sections have been reviewed and which gaps are accepted vs. queued.

## Acceptance Criteria
- `SPEC.md`, `PLAN.md`, `STATUS.md`, `LESSONS.md` all exist under `.agents/sessions/awesome-harness-review-2026-06/`.
- `PLAN.md` contains a section-by-section mapping and a prioritized improvement list.
- `STATUS.md` reflects that the review is complete and lists the next checkpoint (user decision on which P0/P1 items to actually pick up).
- `LESSONS.md` captures transferable insights and the rationale for non-adoptions.

## Relevant files
- `.agents/codebuff-local-cli.ts`, `agents/base2/base2.ts`, `agents/base2/gate-state.ts`, `agents/base2/gate-files.ts`, `agents/base2/gate-reviewer.ts`, `agents/editor/editor.ts`, `agents/context-pruner.ts`, `agents/reviewer/code-reviewer.ts`
- `packages/agent-runtime/src/run-agent-step.ts`, `packages/agent-runtime/src/run-programmatic-step.ts`, `packages/agent-runtime/src/tool-executor.ts`, `packages/agent-runtime/src/tools/handlers/tool/*`
- `common/src/tools/list.ts`, `common/src/tools/constants.ts`, `common/src/tools/compile-tool-definitions.ts`
- `cli/src/chat.tsx`, `cli/src/commands/plan-artifacts.ts`, `cli/src/components/*`
- `evals/*` (existing eval scaffolding)
- `scripts/byok-wording-guard.ts` (existing static-guardrail pattern to mirror)
