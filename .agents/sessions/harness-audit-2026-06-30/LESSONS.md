# Harness Audit — LESSONS

Append-only as the audit progresses. Seeded from priors discovered while scoping this plan.

## Priors (seeded before M1)

### Use the audit-codebase pattern verbatim — don't improvise
`agents/patterns/audit-codebase.md` already encodes the right shape (map → shard pairs → findings on disk → coverage matrix → synthesize). Improvising shard composition (e.g. only file-pickers, no code-searchers) silently fails the M10.2 minimum-shard rule and gets caught by `evaluateMinimumShardRule`. Use ≥ 1 file-picker + ≥ 1 code-searcher per shard.

### Findings MUST be on disk, not in messages
The pruner will eat per-shard `set_output` summaries before the synthesizer sees them. Every shard must `write_file` `findings/<shard>.md`. The shard prompt has to insist on this — left implicit, ~30% of shards return findings in their message and lose them.

### Synthesizer must not re-read source
The whole point of the map-reduce is that the synthesizer's context only holds the small focused finding files. If the synthesizer starts `read_files`-ing source, it re-introduces the parent-context bottleneck the pattern exists to eliminate.

### Coverage matrix prevents "you didn't look at X"
Without `COVERAGE-MATRIX.md` + the `## Subsystem enumeration` section, silent gaps slip through (M10.3 / M10.4 exist exactly to prevent this). Mark every top-level dir as audited or out-of-scope with a reason.

### Top-level dir disposition is part of the contract
The user can always run `ls` at the project root. If a dir they see isn't in the matrix, the audit looks incomplete. List every dir explicitly — even `.bun-version` gets "out-of-scope (version file)".

### Cross-cutting findings are the highest-value category
For a harness audit, the most valuable findings are systemic patterns that span multiple shards (e.g. "abort signal is dropped in 4 different tool handlers"). The synthesizer must produce a dedicated Cross-cutting section. If it's empty for a 15-shard harness audit, re-check the synthesis — it almost always indicates the synthesizer skipped pattern aggregation.

### Don't run benchmarks in the audit
Static analysis only. Tag perf findings as "static (not benchmarked)" so the user isn't misled. Benchmarks are a follow-up workstream.

### Don't run a coverage tool in the audit
Same as above — coverage findings are from static inspection (critical paths that obviously lack a `*.test.ts` sibling), not from `bun test --coverage`. The follow-up workstream can run the coverage tool against the gaps the audit surfaced.

### Plan-mode discipline
This session lives entirely in `.agents/sessions/harness-audit-2026-06-30/`. No project source, agent, config, or doc file is mutated by the audit itself. Fixes are follow-up tasks scoped from the report.

## Lessons discovered during execution
(append below as M1 → M5 progress)
