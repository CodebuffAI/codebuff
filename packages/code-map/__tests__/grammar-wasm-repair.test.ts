import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

import {
  PINNED_GRAMMAR_ASSETS,
  repairGrammarWasm,
} from '../src/grammar-wasm-repair'
import { LANGUAGE_WASM_FILES } from '../src/wasm-files'

describe('grammar WASM repair', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('writes only checksum-verified pinned grammar bytes', async () => {
    const targetDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'openbuff-grammar-repair-'),
    )
    roots.push(targetDir)
    const sourcePath = require.resolve(
      'tree-sitter-wasms/out/tree-sitter-javascript.wasm',
    )
    const bytes = fs.readFileSync(sourcePath)
    const repaired = await repairGrammarWasm({
      wasmFile: 'tree-sitter-javascript.wasm',
      targetDir,
      fetchImpl: async () => new Response(bytes) as Response,
    })

    expect(repaired).toBe(
      path.join(targetDir, 'tree-sitter-javascript.wasm'),
    )
    expect(fs.readFileSync(repaired!)).toEqual(bytes)
  })

  test('pins verified repair bytes for every advertised language', () => {
    const repoRoot = path.resolve(import.meta.dir, '../../..')
    expect(Object.keys(PINNED_GRAMMAR_ASSETS).sort()).toEqual(
      [...LANGUAGE_WASM_FILES].sort(),
    )
    for (const wasmFile of LANGUAGE_WASM_FILES) {
      const asset = PINNED_GRAMMAR_ASSETS[wasmFile]!
      const packageDir =
        asset.packageName === 'tree-sitter-wasms' ? 'out' : 'wasm'
      const source = path.join(
        repoRoot,
        'node_modules',
        asset.packageName,
        packageDir,
        asset.remoteFile,
      )
      expect(fs.existsSync(source), wasmFile).toBe(true)
      expect(
        createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
      ).toBe(asset.sha256)
    }
  })

  test('rejects unpinned or checksum-mismatched bytes', async () => {
    const targetDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'openbuff-grammar-repair-'),
    )
    roots.push(targetDir)
    const fetchImpl = async () => new Response('not a grammar') as Response

    expect(
      await repairGrammarWasm({
        wasmFile: 'tree-sitter-javascript.wasm',
        targetDir,
        fetchImpl,
      }),
    ).toBeNull()
    expect(
      await repairGrammarWasm({
        wasmFile: 'tree-sitter-kotlin.wasm',
        targetDir,
        fetchImpl,
      }),
    ).toBeNull()
  })
})
