# Memory drift cleanup — LESSONS

## Guard false positives vs. genuine findings — 2026-06-23

When a memory-drift checker flags many findings, distinguish guard false positives from genuine stale references before bulk-editing docs. Categorize by root cause:

- **Regex capture bugs** (e.g. `--cwd` flag captured as script name when flag ordering varies): fix the guard regex, not the docs.
- **File-path fragment false positives** (`bun run evals/foo.ts` captures `evals` because `/` truncates): skip captures where the next char is `/`.
- **Out-of-repo `--cwd`/`cd` paths** (transcripts reference `/home/user/Code/other-repo`): reject `--cwd`/`cd` targets outside the repo root.
- **Feature-name false positives** ("TODO List Positioning" flagged as a TODO marker): require `:` or `(` after the marker word.
- **Anchor-fragment false positives** (`./request-flow.md#reviewer--validation-gate-semantics` flagged as broken because `existsSync` sees the whole string): strip `#fragment` before existence check.

Each guard fix needs a regression test in `scripts/__tests__/memory-drift-guard.test.ts` with a tmpdir fixture that reproduces the false positive, asserting no finding is emitted.

## Multi-line `cd <dir>` prefix inference — 2026-06-23

`CONTRIBUTING.md` has `cd cli` on one line and `bun run test:tmux-poc` on the next (inside a code block). Same-line `cd <dir> && bun run` inference misses this. Fix: when a `bun run <script>` line has no same-line `cd` prefix, look back at preceding lines in the same fenced code block for a standalone `cd <dir>` and apply that as the inferred cwd. Stop scanning back at a blank line or closing fence (the block boundary).

## `.coverage-allow` allowlist pattern — 2026-06-23

For the `script-coverage` checker, standalone utility scripts invoked directly via `bun scripts/foo.ts` (not in `package.json` or markdown) are legitimate. Rather than forcing every utility script into markdown, add a `scripts/.coverage-allow` file (one basename per line, `#` comments allowed) and have `checkScriptCoverage` skip allowlisted basenames. This mirrors the `<!-- allow-todo -->` inline-allowlist pattern for TODO markers.

## CI gate promotion sequence — 2026-06-23

When promoting a guard from non-blocking (`|| echo "::warning::..."`) to a blocking CI gate, first confirm the guard exits 0 against the real repo. The sequence is: (1) run guard → exit 0, (2) run typecheck → exit 0, (3) run tests → all pass, (4) edit CI YAML to remove the `|| echo` fallback, (5) re-run guard to confirm the YAML edit didn't introduce drift. Do steps 1-3 in parallel; step 4 after; step 5 after step 4.

## `update_plan_status` append body must avoid raw backticks — 2026-06-23

The `update_plan_status` tool's `append.body` field is passed as a JSON string. Backticks inside the body can break JSON parsing if not properly escaped. Prefer plain text (no backticks, no code spans) in `append.body` prose; use `path`/`task`/`note` fields for structured references. If backticks are essential, ensure they are inside a valid JSON string value.
