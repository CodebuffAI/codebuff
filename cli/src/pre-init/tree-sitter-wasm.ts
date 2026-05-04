// Embed tree-sitter.wasm into the bun-compile binary at a bunfs path the runtime
// can find. Must be the very first import in `index.tsx`: subsequent imports
// (the SDK / code-map) eagerly construct a tree-sitter parser singleton, and its
// `locateFile` callback reads `CODEBUFF_TREE_SITTER_WASM_PATH` from `process.env`.
//
// Without this, web-tree-sitter@0.25.10 falls back to `require.resolve` which —
// per the package's split `import`/`require` exports map — returns the build-time
// absolute path of `tree-sitter.cjs` and fails on user machines.

// @ts-expect-error - Bun's `with { type: 'file' }` returns a string path; TS resolves
// the .wasm file via web-tree-sitter's exports map and has no loader for it.
import treeSitterWasmPath from 'web-tree-sitter/tree-sitter.wasm' with {
  type: 'file',
}

if (treeSitterWasmPath) {
  process.env.CODEBUFF_TREE_SITTER_WASM_PATH = treeSitterWasmPath
}
