import * as path from 'path'
import * as fs from 'fs'
import { Parser, Language } from 'web-tree-sitter'
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
  const runtimeWasm = path.join(dir, 'tree-sitter.wasm')

  // Use locateFile to override where the runtime looks for tree-sitter.wasm
  await Parser.init({
    locateFile: (name: string, scriptDir: string) => {
      if (name === 'tree-sitter.wasm') {
        // First try our bundled location
        if (fs.existsSync(runtimeWasm)) {
          return runtimeWasm
        }
        // Fallback to script directory
        const fallback = path.join(scriptDir, name)
        if (fs.existsSync(fallback)) {
          return fallback
        }
        // Return our preferred path and let web-tree-sitter handle the error
        return runtimeWasm
      }
      // For other files, use default behavior
      return path.join(scriptDir, name)
    },
  })
}

/**
 * Load a language WASM file using Uint8Array to avoid fetch issues
 */
export async function loadLanguage(lang: string): Promise<any> {
  const dir = hereDir()
  const langPath = path.join(dir, 'wasm', `tree-sitter-${lang}.wasm`)
  
  // Read the WASM file as bytes and pass directly to Language.load
  const buf = fs.readFileSync(langPath)
  
  const result = await Language.load(new Uint8Array(buf))
  return result
}

/**
 * Check if we're running in Node.js environment
 */
export function isNodeEnvironment(): boolean {
  return typeof process !== 'undefined' && process.versions && !!process.versions.node
}
