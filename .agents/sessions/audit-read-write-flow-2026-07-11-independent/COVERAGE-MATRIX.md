# Independent read/write audit — coverage matrix

Date: 2026-07-11

This audit used live source, current tests, and current product documentation. Existing audit reports, remediation plans, `.agents/sessions/*` findings, `.omx/plans/*`, graveyard code, and evaluation logs were excluded as evidence.

## Repository coverage

| Area                      | Scope                                                                                                                                |               Coverage | Result                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------: | ---------------------------------------------------------------------------------------------------------------------- |
| `common/`                 | Tool names, metadata, read/write schemas, canonical result envelopes, filesystem adapter types, generated tool definitions           |                Audited | Contract drift, missing transaction primitives, and reachability/deprecation gaps found                                |
| `packages/agent-runtime/` | Registration, scheduling, handlers, read-before-edit state, structural reads, output validation/normalization, proposal coordination |                Audited | Symbol failure isolation, legacy/canonical normalization conflict, subtree authority bypass, and scheduler drift found |
| `sdk/`                    | Client options, dispatch, filesystem adapter, reads, mutations, authority/receipts, callbacks, hooks, public exports                 |                Audited | Highest-risk concurrency, recovery, adapter, cancellation, and public API gaps found                                   |
| `agents/`                 | Base/editor tool reachability, model-facing edit/read guidance, generated agent types                                                |                Audited | Patch reachability/docs drift, shell fallback guidance, deprecated tool exposure, and generated type drift found       |
| `cli/`                    | Event lifecycle, result normalization, read/write cards, proposal UX, hooks, completion summaries                                    |                Audited | Canonical diff loss, misleading cancellation state, unconfirmed-result omission, and weak recovery UX found            |
| `docs/`                   | Architecture, request flow, deterministic edit behavior, tools, testing, SDK-facing guidance                                         |  Relevant docs audited | Several live-behavior contradictions and SDK integration omissions found                                               |
| Tests in the areas above  | Focused unit/component/integration tests around read, write, authority, handlers, reachability, and rendering                        |   Audited and executed | 213 focused tests passed; current tests permit the reported gaps                                                       |
| `packages/code-map/`      | Structural-read dependency behavior                                                                                                  |   Sampled where called | Parser/cached-symbol behavior traced; package internals were not independently audited                                 |
| `packages/indexer/`       | `query_index`/cached context interaction with read flow                                                                              | Sampled where adjacent | Index freshness implications noted; indexing architecture was not independently audited                                |
| `scripts/`                | Tool-definition generation and registration checks                                                                                   |                Sampled | Semantic parity checks are incomplete                                                                                  |

## Explicitly out of scope

| Area                                                                 | Reason                                                                                                               |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `evals/` and evaluation logs                                         | Product evaluation framework is not part of the read/write execution path; logs were excluded as historical evidence |
| `agents-graveyard/`                                                  | Inactive code                                                                                                        |
| Existing `.agents/sessions/*` except this new audit directory        | Prior audits/findings were expressly excluded as source material                                                     |
| `.omx/`, including plans and state                                   | Prior plans and workflow state were expressly excluded as source material                                            |
| Provider implementations and model quality                           | Audit concerns filesystem tools/flow, not provider correctness                                                       |
| Release pipelines, packaging infrastructure, and platform installers | Sampled only where needed to verify SDK public exports/docs                                                          |
| Live provider-backed TUI behavior                                    | No real-provider interactive session was run; UI conclusions come from current event/render code and component tests |
| Third-party filesystem adapters outside this repository              | Their capabilities and metadata preservation cannot be established from this repository                              |

## Engineering-domain coverage

| Domain             | Evidence inspected                                                                                                   | Outcome                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Security           | Canonical path policy, sensitive-file policy, adapter boundaries, shell-routing guidance, mutation logging           | Full-content failure logging and authority-boundary inconsistencies found; no direct traversal exploit established |
| Correctness        | Selector correlation, hashes/capabilities, conditional commits, transaction verification/rollback, canonical outputs | Multiple high-confidence defects found                                                                             |
| State mutation     | Read-before-edit, locks/leases, create/update/delete/move, rollback, cancellation, proposals                         | Lost-update and lifecycle/state-reporting gaps found                                                               |
| Error handling     | Typed read errors, mutation normalization, recovery guidance, partial/unconfirmed/rollback outcomes                  | Errors are frequently collapsed or hidden at integration/UI boundaries                                             |
| Performance        | Read concurrency, output limits, oversized ranges, structural output, cancellation                                   | Large-file and structural-output gaps found; no broad performance regression established                           |
| Dependency hygiene | Tool registries, generated types, public exports, Node filesystem bypasses                                           | Multiple sources of truth and incomplete public surfaces found                                                     |
| Test coverage      | 213 focused tests plus negative-edge inventory                                                                       | Strong component baseline, but missing race, canonical-UI, adapter-parity, and failure-isolation tests             |
| API/ABI            | `read_v1`, `mutation_v1`, legacy compatibility, SDK options/overrides/callbacks                                      | Significant advertised-vs-runtime contract drift found                                                             |

## Validation totals

| Package/surface          | Passing tests |
| ------------------------ | ------------: |
| `common`                 |            14 |
| `packages/agent-runtime` |            47 |
| `sdk`                    |           101 |
| `cli`                    |            43 |
| `agents`                 |             8 |
| **Total**                |       **213** |

Passing tests are evidence that the current suite accepts the observed behavior, not evidence that the gaps are harmless. The most important missing cases are external-writer races, receipt-verification failure after bytes are written, mixed symbol-selector failures, default-filesystem large-range recovery, canonical mutation rendering, late results after cancellation, and non-Node adapter parity.
