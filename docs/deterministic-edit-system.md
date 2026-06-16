# Deterministic Edit System

This document records usage guidance for deterministic harness tools that should be consistently registered before agent prompts recommend them.

## Search before editing

Use `find_files_matching_content` when you need the unique set of files whose contents match a ripgrep pattern, without dumping every matching line. This is useful for refactor planning and follow-up targeted reads:

```json
{
  "pattern": "handleCodeSearch",
  "cwd": "packages/agent-runtime/src",
  "groupBySymbol": true
}
```

Prefer `code_search` when the matching lines and surrounding context are needed. Prefer `find_files_matching_content` when the next step is deduping file paths and reading or editing those files. The tool streams ripgrep output internally into bounded, deduped file sets so large searches do not require holding the full stdout payload in memory; future client protocols can expose those internal progress updates incrementally.

## Background jobs at turn boundaries

`run_terminal_command` with `process_type: "BACKGROUND"` registers running jobs in a shared process registry. `end_turn` surfaces any still-running job IDs so agents do not silently leak dev servers, watchers, or log tails across turns. Use `check_job`, `read_logs`, or `kill_job` to inspect or stop them before finishing when appropriate.
