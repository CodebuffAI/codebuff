// Stub committed for dev mode and tests. The real wasm chunks are written
// here by `cli/scripts/build-binary.ts` immediately before
// `bun build --compile`, then restored to an empty array after the build
// completes. Dev mode and unit tests see the empty stub and fall back to
// path-based resolution in `packages/code-map/src/init-node.ts` (which
// works locally because `node_modules/web-tree-sitter/tree-sitter.wasm`
// exists on the filesystem).
//
// Why an array of small chunks rather than one big string: a single
// 274KB string literal got dropped/transformed by bun's Windows
// minifier (the binary built clean but ran without the bytes). Many
// small string literals slip under whatever threshold caused that. See
// `cli/src/pre-init/tree-sitter-wasm.ts` for the full failure history.
export const TREE_SITTER_WASM_BASE64_CHUNKS: readonly string[] = []
