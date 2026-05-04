// Embed tree-sitter.wasm into the bun-compile binary so the SDK's tree-sitter
// parser singleton can find it at runtime. Must be the very first import in
// `index.tsx`: subsequent imports (the SDK / code-map) eagerly construct the
// parser, and its init reads what we publish here on `globalThis`.
//
// Why not `with { type: 'file' }` + a runtime fs read? That's what the prior
// fix tried, and it silently failed on Windows: bun --compile reports the
// embedded asset path as `B:\~BUN\root\...`, and on some Windows configs
// `fs.readFileSync` of that path throws (caught silently), so the SDK fell
// back to path-based resolution that also failed there.
//
// The base64 string in `tree-sitter-wasm-bytes.ts` is replaced with the real
// wasm contents by `cli/scripts/build-binary.ts` right before `bun build
// --compile` and restored after. The bytes end up in the binary's text
// segment as a JS string literal — no filesystem step on the hot path. In
// dev / unit tests the stub is empty and code-map falls back to the
// node_modules wasm, which works because the file actually exists locally.

import { TREE_SITTER_WASM_BASE64 } from './tree-sitter-wasm-bytes'

if (TREE_SITTER_WASM_BASE64.length > 0) {
  const buf = Buffer.from(TREE_SITTER_WASM_BASE64, 'base64')
  // globalThis is the only cross-bundle channel: the SDK pre-built bundle
  // inlines its own copy of `init-node.ts`, so a module-level variable in
  // the source package isn't visible to the singleton initialized via the
  // SDK. Slice into a fresh Uint8Array view instead of handing over the
  // Buffer's shared underlying ArrayBuffer.
  ;(
    globalThis as { __CODEBUFF_TREE_SITTER_WASM_BINARY__?: Uint8Array }
  ).__CODEBUFF_TREE_SITTER_WASM_BINARY__ = new Uint8Array(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength,
  )
}
