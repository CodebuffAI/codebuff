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

let embeddedWasm: Uint8Array | undefined
if (TREE_SITTER_WASM_BASE64.length > 0) {
  const buf = Buffer.from(TREE_SITTER_WASM_BASE64, 'base64')
  embeddedWasm = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  // globalThis is the only cross-bundle channel: the SDK pre-built bundle
  // inlines its own copy of `init-node.ts`, so a module-level variable in
  // the source package isn't visible to the singleton initialized via the
  // SDK. Slice into a fresh Uint8Array view instead of handing over the
  // Buffer's shared underlying ArrayBuffer.
  ;(
    globalThis as { __CODEBUFF_TREE_SITTER_WASM_BINARY__?: Uint8Array }
  ).__CODEBUFF_TREE_SITTER_WASM_BINARY__ = embeddedWasm
}

// Deterministic CI gate: `<binary> --smoke-tree-sitter` proves the embed
// shipped end-to-end. Lives here, in the very first import, on purpose:
//
// - We're testing whether the *embed* works. Going through commander +
//   initTreeSitterForNode would also pass via the path-resolution
//   fallback when the embed is empty (e.g. dev mode), giving false
//   positives that mask a broken production build.
// - Failing here, before any other module loads, gives a sharp signal:
//   the embed either worked or it didn't. No render-loop timing, no
//   commander wiring, no SDK init order to debug.
//
// Async IIFE because Parser.init returns a promise; process.exit tears
// the process down before parallel top-level imports can fire side
// effects we'd have to clean up.
if (process.argv.includes('--smoke-tree-sitter')) {
  void (async () => {
    try {
      if (!embeddedWasm) {
        console.error(
          'tree-sitter smoke FAIL: TREE_SITTER_WASM_BASE64 stub is empty — ' +
            'the build-binary.ts embed step did not run or did not write the file.',
        )
        process.exit(1)
      }
      const { Parser } = await import('web-tree-sitter')
      await Parser.init({ wasmBinary: embeddedWasm })
      // Marker grepped by cli/scripts/smoke-binary.ts — keep this exact text.
      console.log(
        `tree-sitter smoke ok (${embeddedWasm.byteLength} bytes wasm initialized)`,
      )
      process.exit(0)
    } catch (err) {
      console.error('tree-sitter smoke FAIL:', err)
      process.exit(1)
    }
  })()
}
