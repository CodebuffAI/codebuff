# M9 Final Local-Model Closure Report

Session: `.agents/sessions/harness-remediation-2026-07-01/`
Source audit: `.agents/sessions/harness-audit-2026-06-30/AUDIT-REPORT.md`
Date: 2026-07-02

## Closure decision

M9 is closed under the local-first Openbuff product model: local CLI/SDK, BYOK provider calls from the user's machine, no hosted Openbuff backend, web app, billing surface, hosted auth/session system, CORS/cookie boundary, API gateway, or tenant/account model in remediation scope.

The original audit inventory remains useful as a raw issue list, but final disposition is based on local impact:

- `fixed` — implemented and validated in M1-M8.
- `downgraded` — real local integration/secret-hygiene concern, but not hosted-security severity.
- `discarded` — hosted-product false positive or recommendation that would break intended local workflows.
- `deferred` — non-blocking cleanup/hardening intentionally left for future work.
- `accepted debt` — known residual low/medium local risk with rationale and no failing guard.

## Final validation summary

Passed before closure:

- `cd scripts && bun run guard:byok-wording && bun run guard:sync-agent-config && bun run guard:memory-drift`
- `cd scripts && bun run typecheck && bun run test`
- `bun run typecheck`
- Targeted M1-M8 package tests recorded in `STATUS.md`.
- Configured file-change hooks from the latest gate passed: `typecheck-common`, `typecheck-sdk`, `typecheck-cli`, `typecheck-agent-runtime`, `typecheck-indexer`.
- Latest automated reviewer gate returned `LOOKS_GOOD` for the pending M5-M8 files before M9 artifact-only closure.

The only M9 guard failure encountered was stale memory-drift knowledge. It was resolved by refreshing the package knowledge files and adding regression coverage for staleness detection before rerunning the full guard set.

## Finding-family disposition

| Family | Final status | Evidence / validation | Residual debt |
| --- | --- | --- | --- |
| `SEC-H01`, `SEC-M01`, `SEC-M02` local path containment | Fixed | M1 path containment and shared helper validation; SDK/runtime/common tests and typechecks passed. | None for promised project-local surfaces. |
| `SEC-H02`, `COR-H01`, `STATE-H01` edit/read authorization | Partially fixed; residual accepted/deferred | M1 fixed failed-read and symbol/range read authorization, write traversal fail-closed behavior, and deterministic edit-state tests. | Broader invalid `basedOnRead`/large-file ordinal freshness hardening remains future edit-safety debt. |
| `COR-M20` large-file `occurrenceIndex` freshness | Deferred | Tracked in M1/M9 classification; no guard failure. | Future deterministic edit hardening. |
| `SEC-M03` gate path containment | Accepted debt | Existing gate paths reject `..` lexically; stale gate reuse was fixed in M3. | Absolute-path hardening deferred unless a local-file escape regression appears. |
| `STATE-H02`, `STATE-H04`, `ERR-M02`, `ERR-M03`, `PERF-H01` cancellation/process cleanup | Fixed | M2 SDK child tools, retry sleep, model discovery, runtime/custom/MCP signal forwarding, CLI ownership, check_job timeout, eval runner/final checks validated. | Background jobs remain durable by contract unless killed or follow-timeout cleanup applies. |
| `COR-H03`, `STATE-H03`, `COR-M14`, `STATE-M05`, `COR-M17-M19` freshness/index/config/cache | Fixed | M3 markStale barrier, command-mode freshness, same-size/same-mtime hashing, extension normalization, provider config fragment invalidation, background offset recovery, gate-state fingerprint reuse tests passed. | None noted for M9. |
| `SEC-H06`, `COR-H02`, `COR-M02` validation/reviewer freshness | Fixed | M3 gate/reviewer fingerprinting and static-review join behavior validated and reviewed. | None noted. |
| `ABI-H01-H02`, `ABI-M01-M13`, `COR-M01`, `COR-M21`, `DEP-M01`, `DEP-L03` registry/schema/config contracts | Fixed or accepted/deferred as noted | M4 consistency tests, SDK override/unsupported-tool tests, generated tool declaration checks, `hasNoValidation`, config merge, `set_output`, docs/env validation, and sync-agent-config guard passed. | Legacy substring-based `check-tool-registration.ts` weakness is accepted because table-driven tests and native guards cover the closure invariant. |
| `COR-M12` BYOK cost-accounting namespace | Accepted debt | Classified in M9 as local telemetry/accounting debt; no validation guard failed. | Future telemetry namespace cleanup. |
| `SEC-H04`, `SEC-H05`, `STATE-M04`, `SEC-M04`, `ERR-M04`, `PERF-M02` BYOK provider/MCP/cache hygiene | Fixed/downgraded | M5 provider discovery auth `auto/provider/none`, MCP cache identity, provider/MCP/prompt/cache-debug redaction tests and docs passed. | User opt-in custom endpoints can still receive credentials by design. |
| `SEC-H03`, `COR-M08-M11`, `STATE-M01-M03`, `ERR-H01`, `ERR-M01`, `ERR-L01`, `PERF-M01` parser/diagnostics/resource bounds | Fixed or accepted/deferred | M6 XML buffer bounds, malformed STEP_TEXT parse errors, code-map/indexer parse diagnostics, format-value hardening, model discovery timeout, initCommand shell semantics, and eval summaries passed. | Low runtime trimming/message edge cases and mutable singleton cleanup remain accepted debt. |
| `SEC-M05`, `DEP-M02` CDN parser WASM dependency hygiene | Deferred / accepted debt | Code-map/indexer tests and typechecks passed; no guard failure. | Future dependency trust/self-healing hardening. |
| `SEC-M06` eval token metadata logging | Accepted debt | Eval setup/results were validated for other M6/M8 behavior; no guard exposed leaked secrets. | Future log-redaction hygiene if eval logs become user-facing or shared. |
| `COR-M03-M07`, `COR-L01-L07`, `STATE-L01-L04`, `PERF-M03-M07`, `PERF-L01-L03`, `DEP-M04`, `DEP-L01`, `DEP-L02`, `TEST-L01-L03`, `ABI-L01-L05` low-priority cleanup/perf/test/API drift | Accepted debt/deferred | M9 classified as non-blocking local cleanup; broad typecheck and relevant package tests passed. | Future opportunistic cleanup only; not a closure blocker. |
| `COR-H04-H06`, `TEST-H01-H02`, `ABI-H03`, `COR-M15-M16`, `DEP-M03` eval and plan-sharding correctness | Fixed | M8 plan-sharding repeated agent counts, planner-output coverage, judge spec parity, helper registry smoke tests, and eval typecheck passed. | None noted for M9. |
| Hosted backend/web/billing/auth/CORS/cookie/account/tenant assumptions | Discarded out of scope | M0/M7 reclassification and BYOK wording guard passed. | None; adding hosted guards would break the intended local product model. |

## Accepted-debt register

These are intentionally not blockers for M9 closure:

- `SEC-H02/COR-H01/STATE-H01` residual invalid `basedOnRead` and broad deterministic-edit hardening beyond the fixed failed-read/symbol/range/traversal cases.
- `COR-M20` large-file `occurrenceIndex` freshness anchor enforcement.
- `SEC-M03` absolute gate-path hardening beyond existing traversal rejection and M3 gate-state freshness.
- `COR-M12` BYOK cost-accounting namespace cleanup.
- `SEC-M05/DEP-M02` CDN parser WASM dependency hygiene.
- `SEC-M06` eval token metadata log hygiene.
- `COR-M21` standalone substring-based tool-registration script weakness, mitigated by stronger table-driven consistency tests and guards.
- Low-priority CLI/runtime/glob/perf/dependency/test/API cleanup rows (`COR-L*`, `STATE-L*`, `ERR-L*`, `PERF-L*`, `DEP-L*`, `TEST-L*`, `ABI-L*`) unless future validation exposes a concrete regression.

## Local workflow compatibility confirmation

No implemented guard intentionally blocks:

- Custom provider URLs or local model servers.
- Explicit BYOK provider configuration.
- Remote/local MCP integrations.
- Background jobs that users intentionally keep running.
- Compatibility aliases documented during M4/M7.
- Trusted eval `initCommand` shell setup commands.

Where safety constraints were added, they apply to surfaces whose contract promises project-local containment or run-scoped cancellation.

## Final state

All audit families are triaged and mapped to fixed, downgraded, discarded, deferred, or accepted-debt status. Native guards and relevant validation passed after the M9 memory-drift fix. M9 is complete unless a future automated gate reports a new blocker from artifact-only closure edits.
