// Stub committed for dev mode and tests. The real chunks are written
// here by `cli/scripts/build-binary.ts` immediately before
// `bun build --compile`, then restored to this empty stub after.
//
// Why a *function* return rather than a top-level const: prior
// approaches kept getting eliminated on Windows even with 268
// individual chunks. The bundler appears to evaluate the imported
// value at static-analysis time (we suspect either filesystem write
// timing or an AST cache), inlines it as the empty stub, and DCEs
// any conditional that depends on `.length > 0`. A function call's
// return value is not statically inlinable in the same way — the
// chunks live inside the function body, only materialized on call.
//
// Why a function instead of `export const X = (() => [...])()`:
// same reason — IIFEs can be folded by aggressive minifiers, but
// imported functions called at runtime are preserved.
export function getTreeSitterWasmChunks(): string[] {
  return []
}
