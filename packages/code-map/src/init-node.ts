import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

import { Parser } from 'web-tree-sitter'

import { getDirnameDynamically } from './utils'

/**
 * Helper function to get the current directory path that works in both ESM and CJS
 * Uses runtime-only approach to prevent bundlers from inlining absolute paths
 */
function hereDir() {
  const dirname = getDirnameDynamically()
  if (typeof dirname !== 'undefined') {
    return dirname
  }

  // For ESM builds, use import.meta.url
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    return dir
  }

  // Fallback to process.cwd() as last resort
  return process.cwd()
}

/**
 * Initialize web-tree-sitter for Node.js environments with proper WASM file location
 */
export async function initTreeSitterForNode(): Promise<void> {
  // Get the directory where our WASM files should be located
  const dir = hereDir()

  // Try shared WASM directory first (new approach to avoid duplication)
  const sharedWasm = path.join(dir, '..', 'wasm', 'tree-sitter.wasm')

  // Use locateFile to override where the runtime looks for tree-sitter.wasm
  await Parser.init({
    locateFile: (name: string, scriptDir: string) => {
      if (name === 'tree-sitter.wasm') {
        // First try shared WASM directory (new approach)
        if (fs.existsSync(sharedWasm)) {
          return sharedWasm
        }
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
