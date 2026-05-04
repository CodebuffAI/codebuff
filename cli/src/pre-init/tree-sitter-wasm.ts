// Embed tree-sitter.wasm into the bun-compile binary so the SDK's tree-sitter
// parser singleton can find it at runtime. Must be the very first import in
// `index.tsx`: subsequent imports (the SDK / code-map) eagerly construct the
// parser, and its init reads what we publish here on `globalThis`.
//
// History of failed approaches before this one (all worked on macOS/Linux,
// failed on Windows in different ways):
//
//  1. `with { type: 'file' }` of `web-tree-sitter/tree-sitter.wasm` (node_
//     modules subpath) — bytes ended up in the binary but the import
//     variable was undefined at runtime. Bun/Windows bug with the import-
//     attribute binding.
//  2. `with { type: 'file' }` of a copied-in relative .wasm — same as #1,
//     so it's not subpath-vs-relative.
//  3. Single 274KB base64 string literal in a generated TS module — the
//     literal didn't appear in the compiled binary at all. Probably the
//     minifier transforming "huge constant" literals.
//  4. ~268 chunked base64 string literals — same fate; the bundler
//     appeared to evaluate the imported array as the empty stub at
//     static-analysis time and DCE'd the conditional that consumed it.
//
// What this version does: import a *function* whose body returns the
// chunks. Function return values aren't statically inlinable the way
// `export const` values are, so the bundler can't substitute the empty
// stub for the call site. Reference the result unconditionally so DCE
// can't kick in even if some inliner does fold the function.

import { getTreeSitterWasmChunks } from './tree-sitter-wasm-bytes'

const chunks = getTreeSitterWasmChunks()
if (chunks.length > 0) {
  const buf = Buffer.from(chunks.join(''), 'base64')
  // globalThis is the only cross-bundle channel: the SDK pre-built bundle
  // inlines its own copy of `init-node.ts`, so a module-level variable
  // here isn't visible to the singleton initialized via the SDK. Slice
  // into a fresh Uint8Array view rather than handing over Buffer's shared
  // underlying ArrayBuffer.
  ;(
    globalThis as { __CODEBUFF_TREE_SITTER_WASM_BINARY__?: Uint8Array }
  ).__CODEBUFF_TREE_SITTER_WASM_BINARY__ = new Uint8Array(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength,
  )
}

// `--smoke-tree-sitter` is the deterministic CI gate. The handler lives at
// the top of main() in cli/src/index.tsx (before parseArgs), not here —
// top-level await in this module didn't actually pause subsequent module
// evaluation under bun --compile on Windows. See the comment over the
// handler in index.tsx for the full reasoning.
