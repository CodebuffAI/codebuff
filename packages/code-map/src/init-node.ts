import * as fs from 'fs'
import * as path from 'path'

import { Parser } from 'web-tree-sitter'

const TREE_SITTER_WASM_ENV_VAR = 'CODEBUFF_TREE_SITTER_WASM_PATH'

/**
 * Override the path to `tree-sitter.wasm` used during {@link initTreeSitterForNode}.
 *
 * Needed for `bun build --compile` binaries: the embedded `tree-sitter.js` reports a
 * `scriptDir` like `/$bunfs/root/`, but the runtime wasm isn't auto-embedded next to
 * it, and `require.resolve('web-tree-sitter')` resolves to the build-time absolute
 * path of `tree-sitter.cjs` (per the package's `require` exports condition added in
 * 0.25.10), which doesn't exist on the end user's machine. Callers building binaries
 * should embed the wasm via Bun's `import ... with { type: 'file' }` and pass the
 * resulting path here before any tree-sitter use.
 *
 * Stored on `process.env` so it reaches every copy of this module — the SDK
 * pre-built bundle inlines its own copy of `init-node.ts`, so a module-level
 * variable here wouldn't be visible to the singleton initialized via the SDK.
 */
export function setTreeSitterWasmPath(wasmPath: string): void {
  process.env[TREE_SITTER_WASM_ENV_VAR] = wasmPath
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

  throw new Error(
    `Internal error: tree-sitter.wasm not found (looked at scriptDir=${scriptDir} and via web-tree-sitter package). Set ${TREE_SITTER_WASM_ENV_VAR} or ensure the file is included in your deployment bundle.`,
  )
}

/**
 * Initialize web-tree-sitter for Node.js environments with proper WASM file location
 */
export async function initTreeSitterForNode(): Promise<void> {
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
