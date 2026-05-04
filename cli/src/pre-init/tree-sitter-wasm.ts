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

// Important: this is a *relative* import of a wasm file the build script
// copies in from `web-tree-sitter/tree-sitter.wasm` immediately before
// `bun build --compile`. On Windows, bun's `with { type: 'file' }`
// returned falsy at runtime when this import was a node_modules subpath
// (`web-tree-sitter/tree-sitter.wasm`) even though the bytes ended up in
// the binary — OpenTUI works around the same issue by using relative
// paths from inside its own package, which is what we're mirroring here.
//
// The `.wasm` lives at `./tree-sitter.wasm` next to this file. It is
// .gitignored; build-binary.ts copies it in before compile and removes
// it after, so dev-mode runs see no `.wasm` here and fall back to
// path-based resolution via init-node.ts (which works locally).
//
// @ts-expect-error - TS has no loader for .wasm; bun's `with { type: 'file' }`
// returns a string path at compile time.
import treeSitterWasmPath from './tree-sitter.wasm' with { type: 'file' }

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
