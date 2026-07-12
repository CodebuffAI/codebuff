# Coverage matrix

| Domain | Shard IDs | Covered |
|--------|-----------|---------|
| Runtime edit state and matching | runtime-edit-audit | yes |
| SDK filesystem execution and common contracts | sdk-contract-audit | yes |
| Agent prompts, pruning, and CLI UX | ux-prompt-audit | yes |

## Subsystem enumeration

- `packages/agent-runtime`: audited — deterministic read/edit processing, handlers, and focused tests.
- `sdk`: audited — read, patch, range, and client file-application paths.
- `common`: audited — read-anchor and edit-tool schemas/contracts.
- `agents`: audited — editor/base recovery prompts and context-pruning behavior.
- `cli`: audited — read/write/edit tool rendering and focused tests.
- `.agents`: out-of-scope except for this audit's artifacts.
- `.github`: out-of-scope — CI configuration is not part of read/write tool behavior.
- `agents-graveyard`: out-of-scope — inactive implementations.
- `common-legacy`: out-of-scope — no active read/write tool paths selected by the map.
- `docs`: audited only where deterministic edit contracts are documented.
- `evals`: out-of-scope — evaluation runners do not implement file I/O semantics.
- `node_modules`: out-of-scope — dependencies.
- `openbuff.d.example`: out-of-scope — example configuration.
- `packages/code-map`: out-of-scope — structural parsing is consumed by rewrite_symbol but file mutation is outside this package.
- `packages/indexer`: out-of-scope — retrieval/indexing, not deterministic file mutation.
- `packages/internal`: out-of-scope — provider internals.
- `prototype`: out-of-scope — user project content, not harness implementation.
- `scripts`: out-of-scope except the structural-map builder used for audit setup.
