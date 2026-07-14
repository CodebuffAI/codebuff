# Read/write/indexing architectural map

Date: 2026-07-14

The normal `.agents/sessions` audit scratchpad was read-only in this environment, so the durable audit artifacts are stored here.

## Vertical systems

### Read and discovery

- Public contracts: `common/src/tools/params/tool/read-files.ts`, `read-subtree.ts`, `read-outline.ts`, `common/src/tools/results/filesystem.ts`
- Runtime: `packages/agent-runtime/src/tools/handlers/tool/read-files.ts`, `read-subtree.ts`, `read-outline.ts`, `get-file-reading-updates.ts`
- SDK/filesystem: `sdk/src/tools/read-files.ts`, `node-filesystem.ts`, `path-utils.ts`, `mutation-capabilities.ts`
- CLI: `cli/src/components/tools/read-files.tsx`, `read-subtree.tsx`

### Write and edit application

- Public contracts: edit tool schemas under `common/src/tools/params/tool/`, `common/src/actions.ts`, `common/src/types/filesystem.ts`
- Runtime: `packages/agent-runtime/src/process-edit-transaction.ts` and edit handlers/coordinators
- SDK authority: `sdk/src/tools/change-file.ts`, `filesystem-authority.ts`, `apply-patch.ts`, `replace-range.ts`
- CLI: edit, patch, proposal, diff, lifecycle, and completion renderers

### Indexing and retrieval

- Index lifecycle/cache: `packages/indexer/src/index-manager.ts`, `index-store.ts`, `file-walker.ts`
- Metadata/graph/query: `metadata-indexer.ts`, `query.ts`, `semantic.ts`, `types.ts`
- Parsing: `packages/code-map/src/parse.ts`, `languages.ts`, `structure.ts`
- Tool transport: `common/src/tools/params/tool/query-index.ts`, runtime `query-index.ts`, CLI override and renderer

## Cross-cutting boundaries

- Read capability identity and read-before-edit authorization
- Filesystem adapter capability negotiation and mutation receipts
- Mutation notification, cancellation, rollback, and index invalidation
- Workspace/index/reviewer/validation snapshot identity
- Versioned result DTOs and CLI normalization
- Resource budgets, partial coverage, stale state, and recovery UX
