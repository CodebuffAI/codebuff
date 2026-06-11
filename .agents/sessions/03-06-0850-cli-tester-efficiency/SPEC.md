# Spec: CLI tester efficiency and CLI knowledge improvements

## Overview

Evaluate the shared tmux-based CLI tester agent framework and the concrete `codebuff-local-cli` agent as the implementation of the requested CLI UI tester. Do this by running the tester through the Codebuff SDK multiple times with full event logging, inspecting the resulting SDK event traces and tmux session logs after each run, and then improving the agent(s) so they use fewer wasted steps, capture more useful evidence, and have stronger built-in knowledge of the Codebuff CLI under test.

## Requirements

1. Treat `codebuff-local-cli` plus the shared CLI-agent template/prompt layer as the concrete implementation of the requested CLI UI tester for this pass.
2. Run the relevant tester via the Codebuff SDK multiple times with per-event logging enabled.
3. Use a fixed mixed scenario set for analysis:
   1. a visual smoke-test flow for startup/help/basic prompt rendering,
   2. a realistic implementation-oriented flow.
4. Collect a minimum of:
   1. 2 baseline runs of the smoke scenario,
   2. 2 baseline runs of the implementation scenario,
   3. 1 post-change verification run for each scenario.
5. Persist analysis artifacts for each run, including:
   1. full SDK event stream,
   2. stream chunks where available,
   3. run summary metrics,
   4. tmux session capture paths / session logs.
6. Inspect logs after each run and compare baseline behavior across runs before making changes.
7. Identify inefficiencies in the current tester workflow, especially repeated or low-value captures, vague prompting, unnecessary setup, weak completion criteria, and poor completion detection.
8. For this task, treat the following as examples of “wasted actions” unless the logs justify them:
   1. duplicate captures with no meaningful UI state change,
   2. redundant waits that do not produce new evidence,
   3. follow-up prompts that restate the original task without adding precision,
   4. generic verification steps that are not well matched to the scenario,
   5. broad repo-reading instructions that do not improve the test outcome.
9. Identify missing Codebuff-CLI-specific knowledge that would help the tester drive the CLI more effectively, such as startup expectations, useful commands, verification behaviors, and signs that the CLI is done or needs follow-up.
10. Improve the shared CLI tester framework where doing so benefits multiple CLI testers.
11. Improve the `codebuff-local-cli` agent as the concrete primary target.
12. Preserve the tmux-session-based testing model and the existing structured `set_output` contract; any schema changes should be backward-compatible or additive only.
13. Keep changes focused on agent behavior, prompt quality, logging usefulness, and related validation/test coverage rather than unrelated CLI product changes.
14. Add richer CLI knowledge in a targeted way: new prompt or workflow guidance must be tied to observed baseline failures, confusion, or inefficiencies rather than generic prompt expansion.
15. Add or update validation coverage for the new behavior where practical.
16. Handle key failure modes cleanly in either the agent behavior or the analysis harness, including:
    1. missing API key / auth failure,
    2. tmux startup failure,
    3. CLI hang / no-progress situations,
    4. cleanup of temporary artifacts or tmux sessions where applicable.
17. Summarize findings, rationale, and before/after evidence in session documentation.

## Acceptance Criteria

1. There is a reproducible SDK-driven way to run and inspect the CLI tester with full event logging.
2. The session documentation includes concrete before/after findings from the mixed scenario runs rather than only anecdotal recommendations.
3. The shared prompt/template layer or concrete tester agent is updated to add materially better Codebuff-CLI-specific guidance.
4. The updated tester behavior reduces obvious wasted actions or improves evidence quality in a way that is visible in prompts, logs, outputs, or tests.
5. Validation demonstrates the changes did not break the CLI tester contract or nearby shared behavior, including at least one compatibility-oriented check on the shared CLI-agent layer.

## Technical Approach

- Use the SDK directly to run the relevant tester agent with `handleEvent` and `handleStreamChunk` collectors so every emitted event can be persisted and analyzed.
- Use the tester’s existing tmux scripts and session logs as the main source of truth for what the tested CLI actually displayed.
- Compare current shared instructions in `.agents/lib/cli-agent-prompts.ts` and agent-construction logic in `.agents/lib/create-cli-agent.ts` against the Codebuff-local tester’s concrete behavior in `.agents/codebuff-local-cli.ts` to find mismatches and missing guidance.
- Tighten prompts and workflow instructions so the tester gathers relevant repo/CLI context up front when appropriate, uses more targeted capture/verification behavior, and returns richer but backward-compatible structured output.
- Capture lightweight comparative metrics such as event counts by type, tool-call counts, spawned-agent counts, and notable capture usefulness observations.
- Add or update tests around the agent prompt/template layer and, if useful, add a reproducible SDK-driven analysis harness.

## Files to Create/Modify

- `.agents/codebuff-local-cli.ts`
- `.agents/lib/create-cli-agent.ts`
- `.agents/lib/cli-agent-prompts.ts`
- `.agents/lib/cli-agent-schemas.ts` (only if additive schema changes are needed)
- Possible new SDK/e2e or helper script under `sdk/e2e/` or `scripts/`
- Session docs under `.agents/sessions/03-06-0850-cli-tester-efficiency/`

## Out of Scope

- Reworking the underlying tmux helper scripts unless logs show a concrete blocker there.
- Broad changes to the main Codebuff CLI product unrelated to tester quality.
- Replacing the tmux-based approach with a different testing framework.
- Optimizing non-CLI-testing agents unless directly affected by shared CLI tester changes.
