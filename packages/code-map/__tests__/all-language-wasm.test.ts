import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  getLanguageConfig,
  languageTable,
  setWasmDir,
} from '../src/languages'

describe('packaged language WASM coverage', () => {
  let wasmDir: string

  beforeAll(() => {
    wasmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-all-wasm-'))
    const repoRoot = path.resolve(import.meta.dir, '../../..')
    for (const config of languageTable) {
      const sourceName =
        config.wasmFile === 'tree-sitter-c-sharp.wasm'
          ? 'tree-sitter-c_sharp.wasm'
          : config.wasmFile
      const primary = path.join(
        repoRoot,
        'node_modules',
        'tree-sitter-wasms',
        'out',
        sourceName,
      )
      const fallback = path.join(
        repoRoot,
        'node_modules',
        '@vscode',
        'tree-sitter-wasm',
        'wasm',
        config.wasmFile,
      )
      const source = fs.existsSync(primary) ? primary : fallback
      expect(fs.existsSync(source), config.wasmFile).toBe(true)
      fs.copyFileSync(source, path.join(wasmDir, config.wasmFile))
    }
    setWasmDir(wasmDir)
  })

  afterAll(() => {
    setWasmDir('')
    fs.rmSync(wasmDir, { recursive: true, force: true })
  })

  for (const config of languageTable) {
    const extension = config.extensions[0]
    test(`loads parser and query for ${extension}`, async () => {
      const loaded = await getLanguageConfig(`fixture${extension}`)
      expect(loaded?.parser).toBeDefined()
      expect(loaded?.query).toBeDefined()
    })
  }
})
