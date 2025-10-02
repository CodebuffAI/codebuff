import * as fs from 'fs'
import * as path from 'path'

import { Parser } from 'web-tree-sitter'

/**
 * Initialize web-tree-sitter for Node.js environments with proper WASM file location
 */
export async function initTreeSitterForNode(): Promise<void> {
  // Use locateFile to override where the runtime looks for tree-sitter.wasm
  await Parser.init({
    locateFile: (name: string, scriptDir: string) => {
      if (name === 'tree-sitter.wasm') {
        // Fallback to script directory
        const fallback = path.join(scriptDir, name)
        if (fs.existsSync(fallback)) {
          return fallback
        }

        // Find the installed package root
        const pkgDir = path.dirname(require.resolve('web-tree-sitter'))
        // The wasm ships at: node_modules/web-tree-sitter/tree-sitter.wasm
        const wasm = path.join(pkgDir, 'tree-sitter.wasm')
        if (fs.existsSync(wasm)) {
          return wasm
        }
        throw new Error(
          `Internal error: web-tree-sitter/tree-sitter.wasm not found at ${wasm}. Ensure the file is included in your deployment bundle.`,
        )
      }

      // For other files, use default behavior
      return path.join(scriptDir, name)
    },
  })
}
