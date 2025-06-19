import * as path from 'path'
import { Language, Parser, Query } from 'web-tree-sitter'
import { DEBUG_PARSING } from './parse'

/* ------------------------------------------------------------------ */
/* 1 .  WASM files
/* ------------------------------------------------------------------ */
// Import core WASM file from web-tree-sitter
// @ts-ignore
// import coreWasmPath from 'web-tree-sitter/tree-sitter.wasm' with { type: 'file' }

// Import WASM files from @vscode/tree-sitter-wasm
import cppWasm from '@vscode/tree-sitter-wasm/wasm/tree-sitter-cpp.wasm'
import csharpWasm from '@vscode/tree-sitter-wasm/wasm/tree-sitter-c-sharp.wasm'
import goWasm from '@vscode/tree-sitter-wasm/wasm/tree-sitter-go.wasm'
import javaWasm from '@vscode/tree-sitter-wasm/wasm/tree-sitter-java.wasm'
import javascriptWasm from '@vscode/tree-sitter-wasm/wasm/tree-sitter-javascript.wasm'
import pythonWasm from '@vscode/tree-sitter-wasm/wasm/tree-sitter-python.wasm'
import rubyWasm from '@vscode/tree-sitter-wasm/wasm/tree-sitter-ruby.wasm'
import rustWasm from '@vscode/tree-sitter-wasm/wasm/tree-sitter-rust.wasm'
import typescriptWasm from '@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm'
import tsxWasm from '@vscode/tree-sitter-wasm/wasm/tree-sitter-tsx.wasm'

/* ------------------------------------------------------------------ */
/* 2 .  Queries
/* ------------------------------------------------------------------ */
import cQuery from './tree-sitter-queries/tree-sitter-c-tags.scm'
import cppQuery from './tree-sitter-queries/tree-sitter-cpp-tags.scm'
import csharpQuery from './tree-sitter-queries/tree-sitter-c_sharp-tags.scm'
import goQuery from './tree-sitter-queries/tree-sitter-go-tags.scm'
import javaQuery from './tree-sitter-queries/tree-sitter-java-tags.scm'
import javascriptQuery from './tree-sitter-queries/tree-sitter-javascript-tags.scm'
import phpQuery from './tree-sitter-queries/tree-sitter-php-tags.scm'
import pythonQuery from './tree-sitter-queries/tree-sitter-python-tags.scm'
import rubyQuery from './tree-sitter-queries/tree-sitter-ruby-tags.scm'
import rustQuery from './tree-sitter-queries/tree-sitter-rust-tags.scm'
import typescriptQuery from './tree-sitter-queries/tree-sitter-typescript-tags.scm'

/* ------------------------------------------------------------------ */
/* 2 .  Data structures                                                */
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

const languageTable: LanguageConfig[] = [
  {
    extensions: ['.ts'],
    wasmFile: typescriptWasm,
    queryText: typescriptQuery,
  },
  {
    extensions: ['.tsx'],
    wasmFile: tsxWasm,
    queryText: typescriptQuery,
  },
  {
    extensions: ['.js', '.jsx'],
    wasmFile: javascriptWasm,
    queryText: javascriptQuery,
  },
  {
    extensions: ['.py'],
    wasmFile: pythonWasm,
    queryText: pythonQuery,
  },
  {
    extensions: ['.java'],
    wasmFile: javaWasm,
    queryText: javaQuery,
  },
  {
    extensions: ['.cs'],
    wasmFile: csharpWasm,
    queryText: csharpQuery,
  },
  // Note: C WASM not available in @vscode/tree-sitter-wasm, keeping disabled for now
  // {
  //   extensions: ['.c', '.h'],
  //   wasmFile: cWasm,
  //   queryText: cQuery,
  // },
  {
    extensions: ['.cpp', '.hpp'],
    wasmFile: cppWasm,
    queryText: cppQuery,
  },
  {
    extensions: ['.rs'],
    wasmFile: rustWasm,
    queryText: rustQuery,
  },
  {
    extensions: ['.rb'],
    wasmFile: rubyWasm,
    queryText: rubyQuery,
  },
  { extensions: ['.go'], wasmFile: goWasm, queryText: goQuery },
  // Note: PHP WASM not available in @vscode/tree-sitter-wasm, keeping disabled for now
  // {
  //   extensions: ['.php'],
  //   wasmFile: phpWasm,
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
  filePath: string
): Promise<LanguageConfig | undefined> {
  const ext = path.extname(filePath)
  const cfg = languageTable.find((c) => c.extensions.includes(ext))
  if (!cfg) return undefined

  if (!cfg.parser) {
    try {
      await parserReady // ensure WebAssembly runtime initialised

      // Use the imported WASM file directly
      const parser = new Parser()
      const lang = await Language.load(cfg.wasmFile)
      parser.setLanguage(lang)

      cfg.language = lang
      cfg.parser = parser
      cfg.query = lang.query(cfg.queryText)
    } catch (err) {
      if (DEBUG_PARSING)
        console.error('[tree-sitter] load error for', filePath, err)
      return undefined
    }
  }

  return cfg
}
