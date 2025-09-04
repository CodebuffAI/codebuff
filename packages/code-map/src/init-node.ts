import * as path from 'path'
import * as fs from 'fs'
import { Parser } from 'web-tree-sitter'
import { fileURLToPath } from 'url'

/**
 * Helper function to get the current directory path that works in both ESM and CJS
 */
function hereDir() {
  // In CJS, __dirname is available
  if (typeof __dirname !== 'undefined') {
    return __dirname
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
        // Return our preferred path and let web-tree-sitter handle the error
        return sharedWasm
      }
      // For other files, use default behavior
      return path.join(scriptDir, name)
    },
  })
}
