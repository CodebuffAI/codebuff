import * as path from 'path'

// Import some types for wasm & .scm files
import './types'

import { Language, Parser, Query } from 'web-tree-sitter'
import { DEBUG_PARSING } from './parse'

/* ------------------------------------------------------------------ */
/* 1. Query imports (these work in all bundled environments)         */
/* ------------------------------------------------------------------ */
import csharpQuery from './tree-sitter-queries/tree-sitter-c_sharp-tags.scm'
import cppQuery from './tree-sitter-queries/tree-sitter-cpp-tags.scm'
import goQuery from './tree-sitter-queries/tree-sitter-go-tags.scm'
import javaQuery from './tree-sitter-queries/tree-sitter-java-tags.scm'
import javascriptQuery from './tree-sitter-queries/tree-sitter-javascript-tags.scm'
import pythonQuery from './tree-sitter-queries/tree-sitter-python-tags.scm'
import rubyQuery from './tree-sitter-queries/tree-sitter-ruby-tags.scm'
import rustQuery from './tree-sitter-queries/tree-sitter-rust-tags.scm'
import typescriptQuery from './tree-sitter-queries/tree-sitter-typescript-tags.scm'

/* ------------------------------------------------------------------ */
/* 2. Types and interfaces                                           */
/* ------------------------------------------------------------------ */
export interface LanguageConfig {
  extensions: string[]
  wasmFile: string
  queryText: string

  /* Loaded lazily ↓ */
  parser?: Parser
  query?: Query
  language?: Language
}

export interface RuntimeLanguageLoader {
  loadLanguage(wasmFile: string): Promise<Language>
  initParser(): Promise<void>
}

/* ------------------------------------------------------------------ */
/* 3. WASM file manifest                                             */
/* ------------------------------------------------------------------ */
export const WASM_FILES = {
  'tree-sitter-c-sharp.wasm': 'tree-sitter-c-sharp.wasm',
  'tree-sitter-cpp.wasm': 'tree-sitter-cpp.wasm',
  'tree-sitter-go.wasm': 'tree-sitter-go.wasm',
  'tree-sitter-java.wasm': 'tree-sitter-java.wasm',
  'tree-sitter-javascript.wasm': 'tree-sitter-javascript.wasm',
  'tree-sitter-python.wasm': 'tree-sitter-python.wasm',
  'tree-sitter-ruby.wasm': 'tree-sitter-ruby.wasm',
  'tree-sitter-rust.wasm': 'tree-sitter-rust.wasm',
  'tree-sitter-tsx.wasm': 'tree-sitter-tsx.wasm',
  'tree-sitter-typescript.wasm': 'tree-sitter-typescript.wasm',
} as const

/* ------------------------------------------------------------------ */
/* 4. Language table                                                 */
/* ------------------------------------------------------------------ */
export const languageTable: LanguageConfig[] = [
  {
    extensions: ['.ts'],
    wasmFile: WASM_FILES['tree-sitter-typescript.wasm'],
    queryText: typescriptQuery,
  },
  {
    extensions: ['.tsx'],
    wasmFile: WASM_FILES['tree-sitter-tsx.wasm'],
    queryText: typescriptQuery,
  },
  {
    extensions: ['.js', '.jsx'],
    wasmFile: WASM_FILES['tree-sitter-javascript.wasm'],
    queryText: javascriptQuery,
  },
  {
    extensions: ['.py'],
    wasmFile: WASM_FILES['tree-sitter-python.wasm'],
    queryText: pythonQuery,
  },
  {
    extensions: ['.java'],
    wasmFile: WASM_FILES['tree-sitter-java.wasm'],
    queryText: javaQuery,
  },
  {
    extensions: ['.cs'],
    wasmFile: WASM_FILES['tree-sitter-c-sharp.wasm'],
    queryText: csharpQuery,
  },
  {
    extensions: ['.cpp', '.hpp'],
    wasmFile: WASM_FILES['tree-sitter-cpp.wasm'],
    queryText: cppQuery,
  },
  {
    extensions: ['.rs'],
    wasmFile: WASM_FILES['tree-sitter-rust.wasm'],
    queryText: rustQuery,
  },
  {
    extensions: ['.rb'],
    wasmFile: WASM_FILES['tree-sitter-ruby.wasm'],
    queryText: rubyQuery,
  },
  {
    extensions: ['.go'],
    wasmFile: WASM_FILES['tree-sitter-go.wasm'],
    queryText: goQuery,
  },
]

/* ------------------------------------------------------------------ */
/* 5. WASM directory management                                      */
/* ------------------------------------------------------------------ */
let customWasmDir: string | undefined

/**
 * Set a custom WASM directory for loading tree-sitter WASM files.
 * This can be useful for custom packaging or deployment scenarios.
 */
export function setWasmDir(dir: string): void {
  customWasmDir = dir
}

export function getWasmDir(): string | undefined {
  return customWasmDir
}

/* ------------------------------------------------------------------ */
/* 6. WASM path resolver                                             */
/* ------------------------------------------------------------------ */

/**
 * Resolve the path to a WASM file in a Node.js or Bun environment.
 * Works for both ESM and CJS builds of the SDK.
 */
function resolveWasmPath(wasmFileName: string): string {
  const customWasmDirPath = getWasmDir()
  if (customWasmDirPath) {
    return path.join(customWasmDirPath, wasmFileName)
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
/* 7. One-time library init                                          */
/* ------------------------------------------------------------------ */
// Initialize tree-sitter with Node.js-specific configuration
import {
  initTreeSitterForNode,
  isNodeEnvironment,
  loadLanguage,
} from './init-node'

/* ------------------------------------------------------------------ */
/* 8. Unified runtime loader                                         */
/* ------------------------------------------------------------------ */
class UnifiedLanguageLoader implements RuntimeLanguageLoader {
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
/* 9. Helper functions                                               */
/* ------------------------------------------------------------------ */
export function findLanguageConfigByExtension(
  filePath: string,
): LanguageConfig | undefined {
  const ext = path.extname(filePath)
  return languageTable.find((c) => c.extensions.includes(ext))
}

/* ------------------------------------------------------------------ */
/* 10. Language configuration loader                                 */
/* ------------------------------------------------------------------ */
export async function createLanguageConfig(
  filePath: string,
  runtimeLoader: RuntimeLanguageLoader,
): Promise<LanguageConfig | undefined> {
  const cfg = findLanguageConfigByExtension(filePath)
  if (!cfg) {
    return undefined
  }

  if (!cfg.parser) {
    try {
      await runtimeLoader.initParser()

      // Load the language using the runtime-specific loader
      const lang = await runtimeLoader.loadLanguage(cfg.wasmFile)

      // Create parser and query
      const parser = new Parser()
      parser.setLanguage(lang)

      cfg.language = lang
      cfg.parser = parser
      cfg.query = new Query(lang, cfg.queryText)
    } catch (err) {
      // Let the runtime-specific implementation handle error logging
      throw err
    }
  }

  return cfg
}

/* ------------------------------------------------------------------ */
/* 11. Public API                                                    */
/* ------------------------------------------------------------------ */
const unifiedLoader = new UnifiedLanguageLoader()

export async function getLanguageConfig(
  filePath: string,
): Promise<LanguageConfig | undefined> {
  try {
    return await createLanguageConfig(filePath, unifiedLoader)
  } catch (err) {
    if (DEBUG_PARSING) {
      console.error('[tree-sitter] Load error for', filePath, err)
    }
    return undefined
  }
}
