# Read/write tooling audit report

## Implemented in this pass

1. Preserve `str_replace` failure pressure across intervening exact successes so alternating retry cascades reach the circuit breaker.
2. Keep `rewrite_symbol` available as a trusted structural recovery path and clear the failure budget after confirmed structural recovery.
3. Identify the exact failed replacement index in atomic batch errors.
4. Prevent SDK read-failure marker strings from granting strict read-before-edit authorization while preserving the failure marker in model-visible output.
5. Align `read_files` visible line counts and hashes with `replace_range` for newline-terminated files.
6. Allow `apply_patch` updates whose valid result is an empty file.
7. Show bounded multiline edit diagnostics in the CLI.
8. Correct model guidance for sequential/overlapping replacements and atomic batch recovery.
9. Honor unified patch coordinates and reject ambiguous coordinate-less repeated context.
10. Make context-pruner file/edit facts depend on successful matching tool results and preserve bounded head-and-tail diagnostics for every edit tool.
11. Reject unsafe runtime paths consistently before file or client I/O.
12. Invalidate prepared `str_replace`/`write_file` state when client application fails or throws.
13. Validate strict-mode `basedOnRead` anchors against current content, including small files and transaction edits.
14. Prevent range capabilities and symbol/range reads from authorizing whole-file overwrites or whole-file edit access.
15. Render explicit queued/pending/applied/failed states for `apply_patch` and queued/pending/read/partial/failed states for all `read_files` selector forms.
16. Let fresh per-replacement capabilities and `rewrite_symbol` recover through a failed-edit gate, clearing the gate only after client-confirmed success.
17. Enforce whole-file `write_file` authorization after resolving prior same-path edits, and revoke sticky authorization on processing/client failures found in any output part.
18. Require a matching fresh capability on every strict-mode replacement and emit strict-specific invalid-anchor guidance.
19. Give missing symbol reads an explicit structured failure reason instead of an ambiguous empty slice list.
20. Require positive `apply_patch` success evidence in the CLI and reject empty, malformed, nested-error, `applied: false`, and plain-error envelopes without showing the requested diff.
21. Prevent negated success text such as “not applied successfully” from becoming a persisted context-pruner edit fact.
22. Fix zero-context unified diff insertions so their old-file coordinate determines the insertion point.
23. Replace cross-turn Boolean read authorization with content-hash authorization that is revoked when disk content changes and advanced only after confirmed writes.
24. Add injected-filesystem-aware realpath containment across SDK reads, writes, patches, ranges, listings, and image reads.
25. Route direct edit tools through one prepare/apply/commit coordinator that commits only after positive client application evidence.
26. Treat empty or ambiguous client edit output as unconfirmed, preserve explicit rejection diagnostics, and require a fresh read after indeterminate application.
27. Report rollback failures accurately when an atomic SDK change cannot fully restore every path.
28. Introduce canonical `read_files` result version 1 with typed selector identity, status, errors, omissions, strict summary invariants, and legacy compatibility.
29. Build native structured reads from typed read metadata rather than reparsing rendered legacy marker strings.
30. Reconcile structured read results against the original selector index, kind, and normalized path before granting authorization.

## Resolved architectural findings

1. **Versioned whole-file authorization:** whole-file permission is now tied to a content hash across turns. External changes and rejected/failed edits revoke it; confirmed writes advance it.
2. **Unified edit application coordination:** `write_file`, `str_replace`, `replace_range`, `edit_transaction`, and runtime `apply_patch` now share confirmation, invalidation, and commit behavior.
3. **Realpath containment:** SDK filesystem operations resolve containment through the same injected filesystem used for the operation, including virtual-filesystem symlink escape tests.
4. **Structured `read_files` compatibility slice:** canonical v1 results now preserve selector identity, typed failures, aggregate status, omission semantics, and legacy histories/overrides.
5. **Accurate rollback reporting:** partial rollback failure is surfaced with affected paths instead of claiming complete atomic recovery.
6. **Fail-closed client confirmation:** empty or ambiguous client output cannot synthesize edit success. Legacy confirmation is tied to the expected tool/path shape, and original client/preflight diagnostics are preserved.

## Highest-priority remaining findings

1. **MEDIUM — structured edit results:** the coordinator still decodes legacy edit envelopes heuristically. Migrate mutation tools to a canonical `file_edit_result` contract with explicit `changed`, `atomic`, per-file status, failed operation index, and recovery requirements.
2. **MEDIUM — coherent multi-selector reads:** native structured whole/range/symbol selectors are independently read. A single logical request can therefore observe different file versions; introduce shared snapshot/read deduplication where selectors overlap.
3. **MEDIUM — broader filesystem result migration:** extend canonical versioned results beyond `read_files` to `read_subtree`, outlines/slices, discovery/listing tools, and generated output/result types.
4. **LOW — migration lifecycle:** add v0/v1/malformed telemetry, document deprecation, switch defaults only after compatibility evidence, and retain legacy decoding for persisted histories through the deprecation window.

## Validation

- Five workspace typechecks passed: `common`, `sdk`, `packages/agent-runtime`, `cli`, and `agents`.
- Runtime: 879 passed.
- SDK: 763 passed, 1 pre-existing skipped integration test.
- Agents: 523 passed.
- Common: 616 passed.
- Focused CLI read-result tests: 7 passed.
- Focused edit coordinator/recovery tests: 69 passed.
- SDK build and packaged-consumer verification passed, including CJS, ESM/types/compile, bundled ripgrep, and tree-sitter query checks.
- Final independent reviewer gate: **APPROVE**.
- Final architect gate: **APPROVE**.

## Coverage

See `COVERAGE-MATRIX.md`. The audit covered runtime edit state/matching, SDK filesystem application, common tool contracts, model-facing recovery prompts/context pruning, and CLI tool rendering.
