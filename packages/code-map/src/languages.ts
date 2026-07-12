import * as fs from 'fs'
import * as path from 'path'

// Import some types for wasm & .scm files
import './types'

import { Language, Parser, Query } from 'web-tree-sitter'

import { initTreeSitterForNode } from './init-node'
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
import kotlinQuery from './tree-sitter-queries/tree-sitter-kotlin-tags.scm'
import phpQuery from './tree-sitter-queries/tree-sitter-php-tags.scm'
import swiftQuery from './tree-sitter-queries/tree-sitter-swift-tags.scm'
import gdscriptQuery from './tree-sitter-queries/tree-sitter-gdscript-tags.scm'
import { getDirnameDynamically } from './utils'

/* ------------------------------------------------------------------ */
/* 2. Types and interfaces                                           */
/* ------------------------------------------------------------------ */
export interface LanguageConfig {
  extensions: string[]
  wasmFile: string
  queryPathOrContent: string

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
  'tree-sitter-kotlin.wasm': 'tree-sitter-kotlin.wasm',
  'tree-sitter-php.wasm': 'tree-sitter-php.wasm',
  'tree-sitter-swift.wasm': 'tree-sitter-swift.wasm',
  'tree-sitter-gdscript.wasm': 'tree-sitter-gdscript.wasm',
} as const

/* ------------------------------------------------------------------ */
/* 4. Language table                                                 */
/* ------------------------------------------------------------------ */
export const languageTable: LanguageConfig[] = [
  {
    extensions: ['.ts', '.mts', '.cts'],
    wasmFile: WASM_FILES['tree-sitter-typescript.wasm'],
    queryPathOrContent: typescriptQuery,
  },
  {
    extensions: ['.tsx'],
    wasmFile: WASM_FILES['tree-sitter-tsx.wasm'],
    queryPathOrContent: typescriptQuery,
  },
  {
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    wasmFile: WASM_FILES['tree-sitter-javascript.wasm'],
    queryPathOrContent: javascriptQuery,
  },
  {
    extensions: ['.py', '.pyi'],
    wasmFile: WASM_FILES['tree-sitter-python.wasm'],
    queryPathOrContent: pythonQuery,
  },
  {
    extensions: ['.java'],
    wasmFile: WASM_FILES['tree-sitter-java.wasm'],
    queryPathOrContent: javaQuery,
  },
  {
    extensions: ['.cs'],
    wasmFile: WASM_FILES['tree-sitter-c-sharp.wasm'],
    queryPathOrContent: csharpQuery,
  },
  {
    extensions: ['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx'],
    wasmFile: WASM_FILES['tree-sitter-cpp.wasm'],
    queryPathOrContent: cppQuery,
  },
  {
    extensions: ['.rs'],
    wasmFile: WASM_FILES['tree-sitter-rust.wasm'],
    queryPathOrContent: rustQuery,
  },
  {
    extensions: ['.rb'],
    wasmFile: WASM_FILES['tree-sitter-ruby.wasm'],
    queryPathOrContent: rubyQuery,
  },
  {
    extensions: ['.go'],
    wasmFile: WASM_FILES['tree-sitter-go.wasm'],
    queryPathOrContent: goQuery,
  },
  {
    extensions: ['.php'],
    wasmFile: WASM_FILES['tree-sitter-php.wasm'],
    queryPathOrContent: phpQuery,
  },
  {
    extensions: ['.swift'],
    wasmFile: WASM_FILES['tree-sitter-swift.wasm'],
    queryPathOrContent: swiftQuery,
  },
  {
    extensions: ['.kt', '.kts'],
    wasmFile: WASM_FILES['tree-sitter-kotlin.wasm'],
    queryPathOrContent: kotlinQuery,
  },
  {
    extensions: ['.gd'],
    wasmFile: WASM_FILES['tree-sitter-gdscript.wasm'],
    queryPathOrContent: gdscriptQuery,
  },
]

export const SUPPORTED_CODE_EXTENSIONS = Object.freeze(
  languageTable.flatMap((config) =>
    config.extensions.map((ext) => ext.toLowerCase()),
  ),
)

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

/**
 * Validate a user-supplied WASM directory. Rejects relative paths (which could
 * escape the intended sandbox depending on CWD) and paths containing `..`
 * segments (path traversal). Returns the resolved absolute path or `null` if
 * invalid.
 */
function validateWasmDir(dir: string): string | null {
  if (!dir || dir.includes('..')) {
    return null
  }
  const resolved = path.isAbsolute(dir) ? path.resolve(dir) : null
  return resolved
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

  // Try environment variable override (validated to prevent path traversal)
  const envWasmDir = process.env.CODEBUFF_WASM_DIR
  if (envWasmDir) {
    const validated = validateWasmDir(envWasmDir)
    if (validated) {
      return path.join(validated, wasmFileName)
    }
    // Invalid env value: fall through to default resolution rather than loading
    // an arbitrary attacker-controlled path.
  }

  // Get the directory of this module
  const moduleDir = (() => {
    const dirname = getDirnameDynamically()
    if (typeof dirname !== 'undefined') {
      return dirname
    }
    // For ESM builds, we can't reliably get the module directory in all environments
    // So we fall back to process.cwd() which works for our use case
    return process.cwd()
  })()

  // For bundled SDK: WASM files are in a shared wasm directory. We don't check
  // file existence here; Language.load() handles it and falls back to package
  // resolution if the path is missing. The first candidate is the shared wasm
  // directory (new approach to avoid duplication).
  return path.join(moduleDir, '..', 'wasm', wasmFileName)
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

/* ------------------------------------------------------------------ */
/* 8. Unified runtime loader                                         */
/* ------------------------------------------------------------------ */
class UnifiedLanguageLoader implements RuntimeLanguageLoader {
  private parserReady: Promise<void>

  constructor() {
    this.parserReady = initTreeSitterForNode()
  }

  async initParser(): Promise<void> {
    try {
      await this.parserReady
    } catch (err) {
      // The cached init promise rejected (e.g. transient wasm load failure).
      // Retry so a one-time failure doesn't permanently break every
      // subsequent parse — a permanently-rejected promise would re-throw the
      // same cached error forever and the loader would never recover.
      this.parserReady = initTreeSitterForNode()
      await this.parserReady
    }
  }

  async loadLanguage(wasmFile: string): Promise<Language> {
    // Resolve WASM file path
    let wasmPath = resolveWasmPath(wasmFile)

    // Try to load the language using Node.js-specific method if available
    let lang: Language
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

    return lang
  }
}

/* ------------------------------------------------------------------ */
/* 9. Helper functions                                               */
/* ------------------------------------------------------------------ */
export function findLanguageConfigByExtension(
  filePath: string,
): LanguageConfig | undefined {
  const ext = path.extname(filePath).toLowerCase()
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

      // When loaded with bun, the queryText is a path to the file, not the content of the file.
      const queryContent = path.isAbsolute(cfg.queryPathOrContent)
        ? fs.readFileSync(cfg.queryPathOrContent, 'utf8')
        : cfg.queryPathOrContent

      cfg.language = lang
      cfg.parser = parser
      cfg.query = new Query(lang, queryContent)
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
