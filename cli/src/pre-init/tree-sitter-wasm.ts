// Find tree-sitter.wasm so the SDK's tree-sitter parser singleton can load
// it at runtime. Must be the very first import in `index.tsx`: subsequent
// imports (the SDK / code-map) eagerly construct the parser, and its init
// reads what we publish here on `globalThis` and via the env var.
//
// Final approach after several attempts to embed the wasm into the bun
// --compile binary all failed on Windows (the bytes ended up in the
// binary, but every JS-level retrieval mechanism — `with { type: 'file' }`
// import binding, base64 string literals, chunked base64 in a generated
// module, function-export wrappers — was either tree-shaken, transformed
// by the minifier, or otherwise stripped):
//
//   ship tree-sitter.wasm as a sibling file next to the binary.
//
// It's 200KB, the npm tarball already contains the binary; adding one
// more file is trivial. The build script copies the wasm into `cli/bin/`
// after compile, the release workflow tarballs both, and the freebuff /
// codebuff downloader extracts both into the same directory. At runtime,
// `process.execPath` plus a relative file lookup gets us the wasm with
// zero bundler involvement.

import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'

// Sibling path: same directory as the running binary. Works for both
// production binaries (where the downloader places tree-sitter.wasm
// next to the executable) and dev runs (path won't exist, falls
// through to init-node.ts's path-based resolution which finds the
// node_modules copy).
const siblingPath = join(dirname(process.execPath), 'tree-sitter.wasm')

if (existsSync(siblingPath)) {
  // Tell init-node.ts (in code-map / the SDK bundle) where the wasm
  // is. The locateFile callback there will hand this path to
  // emscripten, which fs.readFile's it.
  process.env.CODEBUFF_TREE_SITTER_WASM_PATH = siblingPath

  // Also try the synchronous-bytes path: hand the bytes straight to
  // Parser.init({ wasmBinary }) so the SDK doesn't need to round-trip
  // through emscripten's path resolution. Both channels feed the same
  // tree-sitter init; whichever one trips first wins.
  try {
    const buf = readFileSync(siblingPath)
    ;(
      globalThis as { __CODEBUFF_TREE_SITTER_WASM_BINARY__?: Uint8Array }
    ).__CODEBUFF_TREE_SITTER_WASM_BINARY__ = new Uint8Array(
      buf.buffer,
      buf.byteOffset,
      buf.byteLength,
    )
  } catch (err) {
    console.error(
      '[tree-sitter pre-init] readFileSync failed for sibling wasm at',
      siblingPath,
      '—',
      err instanceof Error ? err.message : String(err),
    )
  }
}

// `--smoke-tree-sitter` is the deterministic CI gate. The handler lives at
// the top of main() in cli/src/index.tsx (before parseArgs).
