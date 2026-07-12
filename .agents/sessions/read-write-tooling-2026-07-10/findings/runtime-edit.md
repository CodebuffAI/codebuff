# Runtime edit findings

- Fixed alternating and partial-success `str_replace` retry loops by retaining a per-path failure budget.
- Fixed `rewrite_symbol` recovery so it bypasses the raw retry breaker and resets the budget only after client-confirmed success.
- Fixed atomic errors so they identify the failed replacement index.
- Fixed failed SDK read markers so they remain visible but cannot authorize edits.
- Added lexical path hardening across runtime read/write handlers before I/O.
- Invalidated prepared direct-edit state after client rejection/throws.
- Enforced fresh strict-mode anchors and scoped range/symbol authorization.
- Allowed capability-bearing and structural recovery through failed-edit gates, clearing state only after confirmed application.
- Enforced whole-file authorization after prior same-path edits and revoked write authorization on any non-syntax processing/client failure.
- Scanned every client output part for write errors and corrected strict per-replacement capability guidance.
- Added content-hash-backed whole-file authorization across turns, including external-change revocation and confirmed-write hash advancement.
- Unified direct edit confirmation through a prepare/apply/commit coordinator for `write_file`, `str_replace`, `replace_range`, `edit_transaction`, and runtime `apply_patch`.
- Empty or ambiguous client output now fails closed; explicit client/preflight errors retain their actionable diagnostics.
- Canonical structured reads are reconciled against the requested selector before authorization, preventing mismatched or truncated results from granting whole-file access.
- Remaining work: canonical structured edit results and a coherent shared snapshot for overlapping selectors in one read request.
