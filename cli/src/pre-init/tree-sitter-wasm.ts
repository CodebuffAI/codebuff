// Embed tree-sitter.wasm into the bun-compile binary so the SDK's tree-sitter
// parser singleton can find it at runtime. Must be the very first import in
// `index.tsx`: subsequent imports (the SDK / code-map) eagerly construct the
// parser, and its init reads what we publish here on `globalThis` and via
// the env var.
//
// Why `with { type: 'file' }` rather than embedding base64 in TS source:
// the latter doesn't survive `bun --compile` on Windows. The base64 string
// gets dropped or transformed somewhere in the bundle/minify pipeline, so
// the runtime sees an empty stub even though the build script wrote the
// real bytes. `with { type: 'file' }` is Bun's documented asset-embed
// path — the file gets placed at a bunfs location the runtime can read.

import { readFileSync } from 'fs'

// @ts-expect-error - Bun's `with { type: 'file' }` returns a string path; TS
// has no loader for the .wasm subpath of web-tree-sitter's package exports.
import treeSitterWasmPath from 'web-tree-sitter/tree-sitter.wasm' with {
  type: 'file',
}

let embeddedWasm: Uint8Array | undefined

if (treeSitterWasmPath) {
  // Path stays for the locateFile fallback in init-node.ts. That fallback
  // accepts bunfs-style paths (`/~BUN/root/...`) without checking
  // fs.existsSync, because fs.existsSync misreports those paths on Windows.
  // emscripten's wasm loader will fs.readFile them through its own runtime.
  process.env.CODEBUFF_TREE_SITTER_WASM_PATH = treeSitterWasmPath

  // Also try a synchronous read so we can hand the bytes straight to
  // Parser.init via wasmBinary — bypassing locateFile entirely is the most
  // robust path. If readFileSync of the bunfs path throws on this OS (we've
  // seen this happen on Windows in some configurations), log it loudly so
  // the smoke check / user reports include the diagnostic, then fall
  // through to the locateFile flow.
  try {
    const buf = readFileSync(treeSitterWasmPath)
    embeddedWasm = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    ;(
      globalThis as { __CODEBUFF_TREE_SITTER_WASM_BINARY__?: Uint8Array }
    ).__CODEBUFF_TREE_SITTER_WASM_BINARY__ = embeddedWasm
  } catch (err) {
    console.error(
      '[tree-sitter pre-init] readFileSync failed for embedded wasm at',
      treeSitterWasmPath,
      '—',
      err instanceof Error ? err.message : String(err),
    )
  }
}

// `--smoke-tree-sitter` is the deterministic CI gate. We can't handle it
// here with top-level await — bun --compile on Windows didn't preserve the
// blocking semantics in our last attempt, so commander still ran and
// rejected the unknown flag. Instead, the handler lives at the top of
// main() in cli/src/index.tsx (before parseArgs), where we can synchronously
// short-circuit before commander parses argv. This module's job is just to
// publish the wasm bytes / path on globalThis + process.env so that the
// handler (and the SDK's eager Parser.init) can find them.
