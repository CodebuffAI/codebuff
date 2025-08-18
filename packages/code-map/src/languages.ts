import * as path from 'path'

// Import some types for wasm & .scm files
import './types.d.ts'

/* ------------------------------------------------------------------ */
/* 1 .  WASM files
/* ------------------------------------------------------------------ */
// Import WASM files from @vscode/tree-sitter-wasm
import csharpWasmPath from '@vscode/tree-sitter-wasm/wasm/tree-sitter-c-sharp.wasm' with { type: 'file' }
import cppWasmPath from '@vscode/tree-sitter-wasm/wasm/tree-sitter-cpp.wasm' with { type: 'file' }
import goWasmPath from '@vscode/tree-sitter-wasm/wasm/tree-sitter-go.wasm' with { type: 'file' }
import javaWasmPath from '@vscode/tree-sitter-wasm/wasm/tree-sitter-java.wasm' with { type: 'file' }
import javascriptWasmPath from '@vscode/tree-sitter-wasm/wasm/tree-sitter-javascript.wasm' with { type: 'file' }
import pythonWasmPath from '@vscode/tree-sitter-wasm/wasm/tree-sitter-python.wasm' with { type: 'file' }
import rubyWasmPath from '@vscode/tree-sitter-wasm/wasm/tree-sitter-ruby.wasm' with { type: 'file' }
import rustWasmPath from '@vscode/tree-sitter-wasm/wasm/tree-sitter-rust.wasm' with { type: 'file' }
import tsxWasmPath from '@vscode/tree-sitter-wasm/wasm/tree-sitter-tsx.wasm' with { type: 'file' }
import typescriptWasmPath from '@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm' with { type: 'file' }
import { Language, Parser, Query } from 'web-tree-sitter'

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
    wasmFile: typescriptWasmPath,
    queryText: typescriptQuery,
  },
  {
    extensions: ['.tsx'],
    wasmFile: tsxWasmPath,
    queryText: typescriptQuery,
  },
  {
    extensions: ['.js', '.jsx'],
    wasmFile: javascriptWasmPath,
    queryText: javascriptQuery,
  },
  {
    extensions: ['.py'],
    wasmFile: pythonWasmPath,
    queryText: pythonQuery,
  },
  {
    extensions: ['.java'],
    wasmFile: javaWasmPath,
    queryText: javaQuery,
  },
  {
    extensions: ['.cs'],
    wasmFile: csharpWasmPath,
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
    wasmFile: cppWasmPath,
    queryText: cppQuery,
  },
  {
    extensions: ['.rs'],
    wasmFile: rustWasmPath,
    queryText: rustQuery,
  },
  {
    extensions: ['.rb'],
    wasmFile: rubyWasmPath,
    queryText: rubyQuery,
  },
  { extensions: ['.go'], wasmFile: goWasmPath, queryText: goQuery },
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
  filePath: string,
): Promise<LanguageConfig | undefined> {
  const ext = path.extname(filePath)
  const cfg = languageTable.find((c) => c.extensions.includes(ext))
  if (!cfg) return undefined

  if (!cfg.parser) {
    try {
      await parserReady
      // Use the imported WASM file directly
      const parser = new Parser()
      // NOTE (James): For some reason, Bun gives the wrong path to the imported WASM file,
      // so we need to delete one level of ../.
      let lang
      try {
        const actualPath = cfg.wasmFile.replace('../', '')
        lang = await Language.load(actualPath)
      } catch (err) {
        lang = await Language.load(cfg.wasmFile)
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
