import * as path from 'path'
import { Language, Parser, Query } from 'web-tree-sitter'

// Import some types for wasm & .scm files
import './types'

/* ------------------------------------------------------------------ */
/* 1 .  WASM files - Lazy Dynamic Imports
/* ------------------------------------------------------------------ */
// Dynamic import function for WASM files to support bundlers
export async function getWasmPath(language: string): Promise<string> {
  switch (language) {
    case 'csharp':
      return (
        await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-c-sharp.wasm')
      ).default
    case 'cpp':
      return (
        await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-cpp.wasm')
      ).default
    case 'go':
      return (await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-go.wasm'))
        .default
    case 'java':
      return (
        await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-java.wasm')
      ).default
    case 'javascript':
      return (
        await import(
          '@vscode/tree-sitter-wasm/wasm/tree-sitter-javascript.wasm'
        )
      ).default
    case 'python':
      return (
        await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-python.wasm')
      ).default
    case 'ruby':
      return (
        await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-ruby.wasm')
      ).default
    case 'rust':
      return (
        await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-rust.wasm')
      ).default
    case 'tsx':
      return (
        await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-tsx.wasm')
      ).default
    case 'typescript':
      return (
        await import(
          '@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm'
        )
      ).default
    default:
      throw new Error(`Unknown language: ${language}`)
  }
}

import { DEBUG_PARSING } from './parse'

/* ------------------------------------------------------------------ */
/* 2 .  Queries
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
/* 2 .  Data structures                                                */
/* ------------------------------------------------------------------ */
export interface LanguageConfig {
  extensions: string[]
  wasmFile?: string // Set after first load for backward compatibility
  loadWasm: () => Promise<string>
  queryText: string

  /* Loaded lazily ↓ */
  parser?: Parser
  query?: Query
  language?: Language
}

const languageTable: LanguageConfig[] = [
  {
    extensions: ['.ts'],
    loadWasm: () => getWasmPath('typescript'),
    queryText: typescriptQuery,
  },
  {
    extensions: ['.tsx'],
    loadWasm: () => getWasmPath('tsx'),
    queryText: typescriptQuery,
  },
  {
    extensions: ['.js', '.jsx'],
    loadWasm: () => getWasmPath('javascript'),
    queryText: javascriptQuery,
  },
  {
    extensions: ['.py'],
    loadWasm: () => getWasmPath('python'),
    queryText: pythonQuery,
  },
  {
    extensions: ['.java'],
    loadWasm: () => getWasmPath('java'),
    queryText: javaQuery,
  },
  {
    extensions: ['.cs'],
    loadWasm: () => getWasmPath('csharp'),
    queryText: csharpQuery,
  },
  // Note: C WASM not available in @vscode/tree-sitter-wasm, keeping disabled for now
  // {
  //   extensions: ['.c', '.h'],
  //   loadWasm: () => getWasmPath('c'),
  //   queryText: cQuery,
  // },
  {
    extensions: ['.cpp', '.hpp'],
    loadWasm: () => getWasmPath('cpp'),
    queryText: cppQuery,
  },
  {
    extensions: ['.rs'],
    loadWasm: () => getWasmPath('rust'),
    queryText: rustQuery,
  },
  {
    extensions: ['.rb'],
    loadWasm: () => getWasmPath('ruby'),
    queryText: rubyQuery,
  },
  {
    extensions: ['.go'],
    loadWasm: () => getWasmPath('go'),
    queryText: goQuery,
  },
  // Note: PHP WASM not available in @vscode/tree-sitter-wasm, keeping disabled for now
  // {
  //   extensions: ['.php'],
  //   loadWasm: () => getWasmPath('php'),
  //   queryText: phpQuery,
  // },
]

/* ------------------------------------------------------------------ */
/* 4 .  One-time library init                                          */
/* ------------------------------------------------------------------ */
// Initialize tree-sitter - in binary builds, WASM files are bundled as assets
const parserReady = Parser.init()

/* ------------------------------------------------------------------ */
/* 5 .  Public helper                                                  */
/* ------------------------------------------------------------------ */
export async function getLanguageConfig(
  filePath: string,
): Promise<LanguageConfig | undefined> {
  const ext = path.extname(filePath)
  const cfg = languageTable.find((c) => c.extensions.includes(ext))
  if (!cfg) return undefined

  if (!cfg.parser) {
    try {
      await parserReady
      // Load WASM file using dynamic import
      const wasmPath = await cfg.loadWasm()
      cfg.wasmFile = wasmPath // Set for backward compatibility

      const parser = new Parser()
      // NOTE (James): For some reason, Bun gives the wrong path to the imported WASM file,
      // so we need to delete one level of ../.
      let lang
      try {
        const actualPath = wasmPath.replace('../', '')
        lang = await Language.load(actualPath)
      } catch (err) {
        lang = await Language.load(wasmPath)
      }
      parser.setLanguage(lang)

      cfg.language = lang
      cfg.parser = parser
      cfg.query = new Query(lang, cfg.queryText)
    } catch (err) {
      if (DEBUG_PARSING)
        console.error('[tree-sitter] load error for', filePath, err)
      return undefined
    }
  }

  return cfg
}
