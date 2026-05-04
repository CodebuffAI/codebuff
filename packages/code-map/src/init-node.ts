import * as fs from 'fs'
import * as path from 'path'

import { Parser } from 'web-tree-sitter'

const TREE_SITTER_WASM_ENV_VAR = 'CODEBUFF_TREE_SITTER_WASM_PATH'
const WASM_BINARY_GLOBAL_KEY = '__CODEBUFF_TREE_SITTER_WASM_BINARY__'

/**
 * Override the path to `tree-sitter.wasm` used during {@link initTreeSitterForNode}.
 *
 * Path-based fallback for environments that can't pre-load the wasm bytes (e.g.
 * external SDK consumers using a custom layout). The CLI binary instead pre-loads
 * bytes onto `globalThis.__CODEBUFF_TREE_SITTER_WASM_BINARY__` because Windows
 * bunfs paths (`B:\~BUN\root\...`) round-trip inconsistently through
 * `fs.existsSync` even when `fs.readFileSync` succeeds.
 *
 * Stored on `process.env` (not a module-level var) so the value reaches every
 * copy of this module — the SDK pre-built bundle inlines its own copy of
 * `init-node.ts`, so a local variable here wouldn't be visible to the singleton
 * initialized via the SDK.
 */
export function setTreeSitterWasmPath(wasmPath: string): void {
  process.env[TREE_SITTER_WASM_ENV_VAR] = wasmPath
}

function getEmbeddedWasmBinary(): Uint8Array | undefined {
  return (
    globalThis as { [WASM_BINARY_GLOBAL_KEY]?: Uint8Array }
  )[WASM_BINARY_GLOBAL_KEY]
}

function resolveTreeSitterWasm(scriptDir: string): string {
  const override = process.env[TREE_SITTER_WASM_ENV_VAR]
  if (override && fs.existsSync(override)) {
    return override
  }

  const fallback = path.join(scriptDir, 'tree-sitter.wasm')
  if (fs.existsSync(fallback)) {
    return fallback
  }

  try {
    const pkgDir = path.dirname(require.resolve('web-tree-sitter'))
    const wasm = path.join(pkgDir, 'tree-sitter.wasm')
    if (fs.existsSync(wasm)) {
      return wasm
    }
  } catch {
    // Package not resolvable; fall through.
  }

  const overrideDiagnostic = override
    ? ` (env ${TREE_SITTER_WASM_ENV_VAR}=${override} did not exist)`
    : ''
  throw new Error(
    `Internal error: tree-sitter.wasm not found (looked at scriptDir=${scriptDir} and via web-tree-sitter package${overrideDiagnostic}). Set ${TREE_SITTER_WASM_ENV_VAR} or ensure the file is included in your deployment bundle.`,
  )
}

/**
 * Initialize web-tree-sitter for Node.js environments with proper WASM file location
 */
export async function initTreeSitterForNode(): Promise<void> {
  const embedded = getEmbeddedWasmBinary()
  if (embedded) {
    // Pass the bytes directly so emscripten's `getBinarySync` returns them
    // without ever calling `locateFile`. This avoids the path-resolution
    // failure mode entirely and is the path the CLI binary takes.
    await Parser.init({ wasmBinary: embedded })
    return
  }

  // Use locateFile to override where the runtime looks for tree-sitter.wasm
  await Parser.init({
    locateFile: (name: string, scriptDir: string) => {
      if (name === 'tree-sitter.wasm') {
        return resolveTreeSitterWasm(scriptDir)
      }

      // For other files, use default behavior
      return path.join(scriptDir, name)
    },
  })
}
