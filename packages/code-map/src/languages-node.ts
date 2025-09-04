import * as path from 'path'
import * as fs from 'fs'

// Import some types for wasm & .scm files
import './types'

import { Language, Parser } from 'web-tree-sitter'
import { DEBUG_PARSING } from './parse'
import {
  type RuntimeLanguageLoader,
  type LanguageConfig,
  createLanguageConfig,
  getWasmDir,
} from './languages-common'

/* ------------------------------------------------------------------ */
/* 1. WASM path resolver                                              */
/* ------------------------------------------------------------------ */

/**
 * Resolve the path to a WASM file in a Node.js environment.
 * Works for both ESM and CJS builds of the SDK.
 */
function resolveWasmPath(wasmFileName: string): string {
  const customWasmDir = getWasmDir()
  if (customWasmDir) {
    return path.join(customWasmDir, wasmFileName)
  }

  // Try environment variable override
  const envWasmDir = process.env.CODEBUFF_WASM_DIR
  if (envWasmDir) {
    return path.join(envWasmDir, wasmFileName)
  }

  // Get the directory of this module
  const moduleDir = (() => {
    if (typeof __dirname !== 'undefined') {
      return __dirname
    }
    // For ESM builds, we can't reliably get the module directory in all environments
    // So we fall back to process.cwd() which works for our use case
    return process.cwd()
  })()

  // For bundled SDK: WASM files are in the same directory as this module or in a wasm subdirectory
  const possiblePaths = [
    // WASM files in the same directory as this module (for bundled builds)
    path.join(moduleDir, 'wasm', wasmFileName),
    // Development scenario - relative to SDK directory
    path.join(process.cwd(), 'dist', 'esm', 'wasm', wasmFileName),
    path.join(process.cwd(), 'dist', 'cjs', 'wasm', wasmFileName),
    // Fallback to current working directory
    path.join(process.cwd(), 'wasm', wasmFileName),
  ]

  // Try each path and return the first one that exists (we'll fallback to package resolution if none work)
  for (const wasmPath of possiblePaths) {
    try {
      // Don't actually check file existence here, let the Language.load() call handle it
      // and fall back to package resolution if it fails
      return wasmPath
    } catch {
      continue
    }
  }

  // Default fallback
  return possiblePaths[0]
}

/**
 * Fallback: try to resolve from the original package for development
 */
function tryResolveFromPackage(wasmFileName: string): string | null {
  try {
    // This works in development/monorepo scenarios
    return require.resolve(`@vscode/tree-sitter-wasm/wasm/${wasmFileName}`)
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* 2. One-time library init                                          */
/* ------------------------------------------------------------------ */
// Initialize tree-sitter with Node.js-specific configuration
import {
  initTreeSitterForNode,
  isNodeEnvironment,
  loadLanguage,
} from './init-node'

/* ------------------------------------------------------------------ */
/* 3. Node.js-specific runtime loader                               */
/* ------------------------------------------------------------------ */
class NodeLanguageLoader implements RuntimeLanguageLoader {
  private parserReady: Promise<void>

  constructor() {
    this.parserReady = isNodeEnvironment()
      ? initTreeSitterForNode()
      : Parser.init()
  }

  async initParser(): Promise<void> {
    await this.parserReady
  }

  async loadLanguage(wasmFile: string): Promise<Language> {
    // Resolve WASM file path
    let wasmPath = resolveWasmPath(wasmFile)

    // Try to load the language using Node.js-specific method if available
    let lang: Language
    const nodeEnv = isNodeEnvironment()

    if (nodeEnv) {
      // Extract language name from WASM file name (e.g., 'tree-sitter-javascript.wasm' -> 'javascript')
      const langName = wasmFile.replace('tree-sitter-', '').replace('.wasm', '')

      try {
        lang = await loadLanguage(langName)
      } catch (err) {
        // Fallback to the original path-based loading
        try {
          lang = await Language.load(wasmPath)
        } catch (err2) {
          // Fallback: try resolving from the original package (development)
          const fallbackPath = tryResolveFromPackage(wasmFile)
          if (fallbackPath) {
            lang = await Language.load(fallbackPath)
          } else {
            throw err2
          }
        }
      }
    } else {
      // Browser environment - use URL-based loading
      try {
        lang = await Language.load(wasmPath)
      } catch (err) {
        // Fallback: try resolving from the original package (development)
        const fallbackPath = tryResolveFromPackage(wasmFile)
        if (fallbackPath) {
          lang = await Language.load(fallbackPath)
        } else {
          throw err
        }
      }
    }

    return lang
  }
}

/* ------------------------------------------------------------------ */
/* 4. Public API                                                     */
/* ------------------------------------------------------------------ */
const nodeLoader = new NodeLanguageLoader()

export async function getLanguageConfig(
  filePath: string,
): Promise<LanguageConfig | undefined> {
  try {
    return await createLanguageConfig(filePath, nodeLoader)
  } catch (err) {
    if (DEBUG_PARSING) {
      console.error('[tree-sitter] Node.js load error for', filePath, err)
    }
    return undefined
  }
}

// Re-export common types and utilities
export type { LanguageConfig } from './languages-common'
export { languageTable, WASM_FILES, setWasmDir } from './languages-common'
