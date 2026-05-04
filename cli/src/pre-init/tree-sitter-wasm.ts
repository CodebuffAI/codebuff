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
import { dirname, isAbsolute, join, resolve } from 'path'

// Where to look for the sibling tree-sitter.wasm. We can't just use
// `dirname(process.execPath)`: at pre-init time inside a bun --compile
// binary on Windows, `process.execPath` returns the *bunfs* internal
// path (`B:\~BUN\root\<binary>.exe`) rather than the on-disk path of
// the .exe the user invoked. By the time main() runs it switches to
// the disk path, but pre-init has long since bailed out.
//
// Try several sources in order; the first whose sibling .wasm exists
// wins. argv[0] is normally the path the binary was invoked with —
// always a real disk path, never bunfs. execPath is kept as a fallback
// for environments where argv[0] is something exotic.
const candidates = (
  [process.argv[0], process.execPath] as Array<string | undefined>
)
  .filter((p): p is string => typeof p === 'string' && p.length > 0)
  .map((p) => (isAbsolute(p) ? p : resolve(p)))
  .map((p) => join(dirname(p), 'tree-sitter.wasm'))

const siblingPath = candidates.find((p) => existsSync(p))

// Pre-init diagnostic — only fires when --smoke-tree-sitter is set so we
// don't spam every run. We need to see what argv[0] / execPath looked
// like at this exact phase on Windows: the round-7 main() diag showed
// disk paths, but pre-init silently bailed, meaning module-init time
// gives different values. argv[0] alone wasn't enough to fix it.
if (process.argv.includes('--smoke-tree-sitter')) {
  console.error(
    `[pre-init diag] argv[0]=${process.argv[0]}\n` +
      `[pre-init diag] execPath=${process.execPath}\n` +
      `[pre-init diag] candidates=${JSON.stringify(candidates)}\n` +
      `[pre-init diag] resolved siblingPath=${siblingPath ?? '<none>'}\n`,
  )
}

if (siblingPath) {
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
