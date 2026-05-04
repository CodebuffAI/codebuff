// Embed tree-sitter.wasm into the bun-compile binary so the SDK's tree-sitter
// parser singleton can find it at runtime. Must be the very first import in
// `index.tsx`: subsequent imports (the SDK / code-map) eagerly construct the
// parser, and its init reads what we publish here on `globalThis` and via
// the env var.
//
// History of failed approaches before this one:
//
//  1. `with { type: 'file' }` import of `web-tree-sitter/tree-sitter.wasm`
//     (node_modules subpath) — bun --compile on Windows embedded the
//     bytes but bound the import variable to undefined.
//  2. `with { type: 'file' }` import of a copied-in relative wasm file —
//     same problem; this turns out to be a bun/Windows bug, not a
//     subpath-vs-relative thing.
//  3. Single 274KB base64 string literal in a generated TS module —
//     bun's Windows minifier dropped/transformed the literal even
//     though the embed step wrote it.
//
// What works: many small base64 chunks (each well under any plausible
// minifier threshold) joined at runtime. The build script writes the
// chunks; this module decodes them. The committed file ships an empty
// stub array — dev-mode runs see no chunks and fall through to
// path-based resolution in init-node.ts (which works locally because
// `node_modules/web-tree-sitter/tree-sitter.wasm` exists on disk).

import { TREE_SITTER_WASM_BASE64_CHUNKS } from './tree-sitter-wasm-bytes'

let embeddedWasm: Uint8Array | undefined
if (TREE_SITTER_WASM_BASE64_CHUNKS.length > 0) {
  // Joined string is up to ~275KB but only lives long enough to decode.
  const buf = Buffer.from(TREE_SITTER_WASM_BASE64_CHUNKS.join(''), 'base64')
  embeddedWasm = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  // globalThis is the only cross-bundle channel: the SDK pre-built bundle
  // inlines its own copy of `init-node.ts`, so a module-level variable
  // here isn't visible to the singleton initialized via the SDK.
  ;(
    globalThis as { __CODEBUFF_TREE_SITTER_WASM_BINARY__?: Uint8Array }
  ).__CODEBUFF_TREE_SITTER_WASM_BINARY__ = embeddedWasm
}

// `--smoke-tree-sitter` is the deterministic CI gate. The handler lives at
// the top of main() in cli/src/index.tsx (before parseArgs), not here —
// top-level await in this module didn't actually pause subsequent module
// evaluation under bun --compile on Windows. See the comment over the
// handler in index.tsx for the full reasoning.
