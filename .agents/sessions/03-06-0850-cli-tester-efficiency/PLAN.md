# Plan: CLI tester efficiency and CLI knowledge improvements

## Implementation Steps

1. Build an SDK-driven analysis harness for the CLI tester runs.
   - Add a reproducible script or test helper that runs `codebuff-local-cli` through the SDK with `handleEvent` and `handleStreamChunk` collection.
   - Standardize artifact naming for comparison (for example `baseline-smoke-run1`, `baseline-implementation-run2`, `post-smoke-run1`).
   - Define and persist a consistent metrics schema per run, including event counts by type, tool-call counts, unique tool names, spawned-agent counts, capture counts, and notable wait/capture observations.
   - Build in explicit failure-path handling for missing API key, auth failure, tmux startup failure, and hung runs, including cleanup where possible.

2. Execute baseline mixed-scenario runs and document findings.
   - Run the smoke scenario twice and the implementation scenario twice.
   - Keep the comparison controlled by using the same prompts, logging granularity, and timeout policy across baseline runs.
   - Inspect each run’s SDK trace and tmux session logs.
   - Record concrete inefficiencies, wasted actions, and missing Codebuff-CLI knowledge to drive the prompt/template changes.

3. Improve the shared CLI tester prompt layer.
   - Update `.agents/lib/cli-agent-prompts.ts` so CLI testers have sharper workflow guidance.
   - Add targeted guidance on when to gather prep context, when to capture, how to detect progress/completion, and how to avoid low-value repeated actions.
   - Keep knowledge additions evidence-based and avoid prompt bloat.

4. Improve shared CLI tester orchestration and the concrete `codebuff-local-cli` agent.
   - Update `.agents/lib/create-cli-agent.ts` if shared orchestration behavior needs refinement.
   - Update `.agents/codebuff-local-cli.ts` with Codebuff-CLI-specific knowledge and workflow refinements informed by baseline evidence.
   - Ensure the agent remains focused on CLI UI testing and uses the tmux helper scripts efficiently.
   - Keep output contract compatibility intact.

5. Add or update validation coverage.
   - Add tests for shared CLI-agent prompt/template behavior and/or the analysis harness.
   - Include compatibility-oriented checks for the shared CLI-agent layer.
   - At minimum, verify the `.agents` layer still typechecks and that `claude-code-cli`, `codex-cli`, `gemini-cli`, and `codebuff-local-cli` still satisfy shared construction/schema expectations.

6. Re-run post-change verification scenarios.
   - Run at least one smoke and one implementation scenario after changes using the same prompts and comparison controls.
   - Compare outputs/artifacts against the baseline.
   - Treat the step as successful if the post-change runs show at least two improvement signals such as fewer duplicate captures, fewer redundant waits/follow-ups, clearer evidence in captures/output, or better scenario-specific verification behavior.

7. Write session documentation and capture durable lessons.
   - Record before/after findings in `LESSONS.md`.
   - Document what was intentionally not changed and why.
   - Update relevant skill files only with broadly reusable insights.

## Dependencies / Ordering

- Step 1 must happen before baseline analysis in Step 2.
- Step 2 should happen before Steps 3–4 so improvements are evidence-based.
- Step 3 should happen before or alongside Step 4 because shared prompt guidance informs the concrete agent behavior.
- Step 5 should follow implementation so tests validate the actual behavior.
- Step 6 depends on Steps 3–5 being complete.
- Step 7 should happen after validation so lessons reflect the final state.

## Risk Areas

- The requested `cli-ui-tester` name does not exist directly in the repo, so the harness must target the correct concrete agent (`codebuff-local-cli`) and shared template layer consistently.
- SDK-driven CLI runs may fail due to auth, tmux availability, or local CLI startup issues; the harness should make failures inspectable rather than opaque.
- Richer CLI knowledge can easily become prompt bloat, so additions must stay targeted to observed failures.
- Shared-layer changes can affect multiple CLI tester agents, so compatibility checks are important.
