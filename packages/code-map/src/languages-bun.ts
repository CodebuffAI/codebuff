import { Language, Parser } from 'web-tree-sitter'
import { DEBUG_PARSING } from './parse'
import {
  type RuntimeLanguageLoader,
  type LanguageConfig,
  createLanguageConfig,
} from './languages-common'

/* ------------------------------------------------------------------ */
/* 1. WASM files - direct imports for Bun                           */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* 2. WASM path mapping for Bun                                     */
/* ------------------------------------------------------------------ */
const WASM_PATH_MAP: Record<string, string> = {
  'tree-sitter-c-sharp.wasm': csharpWasmPath,
  'tree-sitter-cpp.wasm': cppWasmPath,
  'tree-sitter-go.wasm': goWasmPath,
  'tree-sitter-java.wasm': javaWasmPath,
  'tree-sitter-javascript.wasm': javascriptWasmPath,
  'tree-sitter-python.wasm': pythonWasmPath,
  'tree-sitter-ruby.wasm': rubyWasmPath,
  'tree-sitter-rust.wasm': rustWasmPath,
  'tree-sitter-tsx.wasm': tsxWasmPath,
  'tree-sitter-typescript.wasm': typescriptWasmPath,
}

/* ------------------------------------------------------------------ */
/* 3. Bun-specific runtime loader                                   */
/* ------------------------------------------------------------------ */
class BunLanguageLoader implements RuntimeLanguageLoader {
  private parserReady: Promise<void>

  constructor() {
    this.parserReady = Parser.init()
  }

  async initParser(): Promise<void> {
    await this.parserReady
  }

  async loadLanguage(wasmFile: string): Promise<Language> {
    const wasmPath = WASM_PATH_MAP[wasmFile]
    if (!wasmPath) {
      throw new Error(`WASM file not found for: ${wasmFile}`)
    }

    try {
      // NOTE (James): For some reason, Bun gives the wrong path to the imported WASM file,
      // so we need to delete one level of ../.
      let lang
      try {
        const actualPath = wasmPath.replace('../', '')
        lang = await Language.load(actualPath)
      } catch (err) {
        lang = await Language.load(wasmPath)
      }
      return lang
    } catch (err) {
      if (DEBUG_PARSING) {
        console.error('[tree-sitter] Bun load error for', wasmFile, err)
      }
      throw err
    }
  }
}

/* ------------------------------------------------------------------ */
/* 4. Public API                                                     */
/* ------------------------------------------------------------------ */
const bunLoader = new BunLanguageLoader()

export async function getLanguageConfig(
  filePath: string,
): Promise<LanguageConfig | undefined> {
  try {
    return await createLanguageConfig(filePath, bunLoader)
  } catch (err) {
    if (DEBUG_PARSING) {
      console.error('[tree-sitter] Bun load error for', filePath, err)
    }
    return undefined
  }
}

// Re-export common types and utilities
export type { LanguageConfig } from './languages-common'
export { languageTable, WASM_FILES } from './languages-common'
