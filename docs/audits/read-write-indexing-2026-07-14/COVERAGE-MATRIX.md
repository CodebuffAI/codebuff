# Read/write/indexing audit coverage matrix

Date: 2026-07-14

## Audit shards

| Shard | Primary scope | Eight domains covered | Artifact |
|---|---|---:|---|
| Read path | Schemas, runtime reads, SDK filesystem reads, capability minting, subtree/outline, CLI, tests/docs | yes | `findings/read-path.md` |
| Write path | Edit preparation, authority, transaction/rollback, proposals, SDK commits, CLI, tests/docs | yes | `findings/write-path.md` |
| Indexing/retrieval | Walker, parser, metadata/graph, cache, lexical/semantic query, tool/CLI, tests/docs | yes | `findings/indexing-retrieval.md` |
| Cross-layer contracts | Common/runtime/SDK/indexer/CLI DTOs, versions, normalization, generated types | yes | `findings/cross-layer-contracts.md` |
| Workspace coherence | Read authorization, mutation receipts/events, external changes, index freshness, multi-process persistence | yes | `findings/workspace-coherence.md` |

The eight domains evaluated by every shard were security, correctness, state mutation, error handling, performance, dependency hygiene, test coverage gaps, and API/ABI contracts.

## Repository subsystem enumeration

| Top-level area | Disposition |
|---|---|
| `common/` | audited: tool schemas, result contracts, metadata, filesystem/capability types |
| `packages/agent-runtime/` | audited: read/write/query handlers, authorization state, transactions, normalization |
| `packages/indexer/` | audited comprehensively for the requested indexing scope |
| `packages/code-map/` | audited for parsing, symbols, calls, language support, and graph inputs |
| `sdk/` | audited: filesystem adapter, reads, mutations, authority, observers, public configuration |
| `cli/` | audited: client overrides, index lifecycle, read/write/query rendering and state summaries |
| `agents/` | audited where prompts/tool policy govern read-before-edit and retrieval verification |
| `docs/` | audited for architecture and behavioral contract accuracy; contains this report |
| `evals/` | partially audited for retrieval/contract evaluation coverage; implementation outside scope |
| `.agents/` | prior reports used only as a baseline; current findings were reverified against live source |
| `packages/internal/` | out of scope: no primary read/write/indexing ownership found |
| `packages/build-tools/` | out of scope: build tooling, not the requested runtime data path |
| `cli`-unrelated UI/features | out of scope except shared lifecycle/result normalization |
| `web/`, `assets/`, `test/`, `e2e-traces/`, `debug/`, `scripts/` | out of scope unless referenced by a covered implementation/test path |
| `agents-graveyard/`, `.omx/`, `.codex/`, `.github/`, `.vscode/` | out of scope: inactive tooling, configuration, or workflow infrastructure |
| Generated/cache/dependency dirs (`node_modules`, `.codebuff-index`, `.turbo`, `.e2e-scratch`, `.bin`) | out of scope |

## Coverage conclusion

Every implementation-owning subsystem for the requested read/write/indexing architecture was audited. The main uncertainty is operational frequency and production latency under very large repositories or hostile concurrent filesystem activity; those require dedicated stress/e2e evaluation rather than further source inspection.
