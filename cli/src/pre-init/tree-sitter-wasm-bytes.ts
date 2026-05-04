// Stub committed for dev mode and tests. The real wasm bytes are inlined
// here as base64 by `cli/scripts/build-binary.ts` immediately before
// `bun build --compile`, then restored to the empty stub after the build
// completes. Dev mode and unit tests see the empty stub and fall back to
// path-based resolution in `packages/code-map/src/init-node.ts` (which
// works locally because `node_modules/web-tree-sitter/tree-sitter.wasm`
// exists on the filesystem).
//
// Why a string literal instead of `with { type: 'file' }` + readFileSync:
// the file-import approach left the bytes in bunfs and required a runtime
// fs read, which silently failed on Windows (`fs.readFileSync` for
// `B:\~BUN\root\...` paths) and let the singleton fall through to a
// path-based fallback that also failed there. A base64 string literal in
// the JS source compiles into the bun binary's text segment, with no
// filesystem step on the hot path.
export const TREE_SITTER_WASM_BASE64 = ''
