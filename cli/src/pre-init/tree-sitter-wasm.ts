// Embed tree-sitter.wasm into the bun-compile binary so the SDK's tree-sitter
// parser singleton can find it at runtime. Must be the very first import in
// `index.tsx`: subsequent imports (the SDK / code-map) eagerly construct the
// parser, and its init reads what we publish here on `globalThis` and `process.env`.
//
// Why not just `locateFile` + a path? On Windows, bun --compile reports the
// embedded path as `B:\~BUN\root\...`, and `fs.existsSync` returns false for
// that path inside the running binary even though `fs.readFileSync` works. So
// we read the bytes once at startup and pass them straight to `Parser.init`
// via `wasmBinary`, sidestepping filesystem resolution entirely.

import * as fs from 'fs'

// @ts-expect-error - Bun's `with { type: 'file' }` returns a string path; TS resolves
// the .wasm file via web-tree-sitter's exports map and has no loader for it.
import treeSitterWasmPath from 'web-tree-sitter/tree-sitter.wasm' with {
  type: 'file',
}

if (treeSitterWasmPath) {
  // Path stays for any consumer (tests, dev runs) that still resolves via fs.
  process.env.CODEBUFF_TREE_SITTER_WASM_PATH = treeSitterWasmPath

  try {
    const binary = fs.readFileSync(treeSitterWasmPath)
    // globalThis is the only cross-bundle channel: the SDK pre-built bundle
    // inlines its own copy of `init-node.ts`, so a module-level variable in
    // the source package wouldn't be visible to the singleton initialized
    // via the SDK.
    ;(globalThis as { __CODEBUFF_TREE_SITTER_WASM_BINARY__?: Uint8Array }).__CODEBUFF_TREE_SITTER_WASM_BINARY__ =
      new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength)
  } catch {
    // readFileSync failure is unexpected (the file is supposed to be embedded)
    // but we let init-node.ts fall back to path-based resolution and surface
    // a clearer error if that also fails.
  }
}
