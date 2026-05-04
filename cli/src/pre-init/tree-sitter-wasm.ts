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

// Deterministic CI gate: `<binary> --smoke-tree-sitter` proves the embed
// shipped end-to-end. Lives here, in the very first import, on purpose:
//
// - We're testing whether the *embed* works. Going through commander +
//   initTreeSitterForNode would pass via the path-resolution fallback
//   when the embed is empty (e.g. dev mode), giving false positives that
//   mask a broken production build.
// - Failing here, before any other module loads, gives a sharp signal:
//   either the wasm reached the runtime or it didn't.
//
// Top-level await (not a fire-and-forget IIFE) because subsequent module
// evaluation has to *wait* — otherwise `commander.parse()` runs first and
// fails on the unknown flag before our handler can exit cleanly.
if (process.argv.includes('--smoke-tree-sitter')) {
  try {
    const { Parser } = await import('web-tree-sitter')
    // Prefer the wasmBinary path (no filesystem step). Fall back to
    // letting Parser.init resolve the path via its locateFile callback,
    // which init-node.ts wires up to accept bunfs paths even when
    // fs.existsSync says otherwise.
    if (embeddedWasm) {
      await Parser.init({ wasmBinary: embeddedWasm })
      console.log(
        `tree-sitter smoke ok (wasmBinary, ${embeddedWasm.byteLength} bytes)`,
      )
    } else if (treeSitterWasmPath) {
      await Parser.init({
        locateFile: (name: string) =>
          name === 'tree-sitter.wasm' ? treeSitterWasmPath : name,
      })
      console.log(
        `tree-sitter smoke ok (locateFile, path=${treeSitterWasmPath})`,
      )
    } else {
      console.error(
        'tree-sitter smoke FAIL: no embedded wasm path. The `with { type: ' +
          "'file' }` import returned a falsy value, which means the bundler " +
          'did not embed the asset.',
      )
      process.exit(1)
    }
    process.exit(0)
  } catch (err) {
    console.error('tree-sitter smoke FAIL:', err)
    process.exit(1)
  }
}
