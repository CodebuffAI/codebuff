# UX and prompt findings

- Fixed sequential-overlap and atomic-batch recovery guidance for the model.
- Fixed generic retry wording and distinguished syntax-only recovery from stale/no-match recovery.
- Fixed CLI edit failures to retain a bounded head-and-tail diagnostic with an actionable recovery line.
- Made context pruning correlate tool calls/results and persist only successful read/edit facts.
- Added accurate queued/pending/applied/failed patch rendering and visible queued/pending/read/partial/failed path/range/symbol read states.
- Required positive patch success evidence, rejected malformed/nested-error envelopes, and suppressed unapplied diffs.
- Prevented negated success wording from being persisted as an edit fact during context pruning.
- CLI and context pruning now prefer canonical `read_files` status/path/error fields while retaining legacy-history fallback.
- Simplification preserves canonical result identity and bounded error information instead of collapsing selector failures into fake content entries.
- Empty edit application output now renders as an unconfirmed rejection rather than synthesized success, while explicit rejection diagnostics remain visible.
- Remaining architectural work is tracked in the main report: structured edit results, coherent overlapping-selector snapshots, broader filesystem v1 coverage, and the compatibility/deprecation lifecycle.
