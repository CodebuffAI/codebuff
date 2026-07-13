import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

import {
  getPinnedGrammarAssetUrl,
  PINNED_GRAMMAR_ASSETS,
  repairGrammarWasm,
  resolveGrammarWasmSource,
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
    const sourcePath =
      require.resolve('tree-sitter-wasms/out/tree-sitter-javascript.wasm')
    const bytes = fs.readFileSync(sourcePath)
    const repaired = await repairGrammarWasm({
      wasmFile: 'tree-sitter-javascript.wasm',
      targetDir,
      fetchImpl: async () => new Response(bytes) as Response,
    })

    expect(repaired).toBe(path.join(targetDir, 'tree-sitter-javascript.wasm'))
    expect(fs.readFileSync(repaired!)).toEqual(bytes)
  })

  test('pins verified repair bytes for every advertised language', () => {
    const repoRoot = path.resolve(import.meta.dir, '../../..')
    expect(Object.keys(PINNED_GRAMMAR_ASSETS).sort()).toEqual(
      [...LANGUAGE_WASM_FILES].sort(),
    )
    for (const wasmFile of LANGUAGE_WASM_FILES) {
      const asset = PINNED_GRAMMAR_ASSETS[wasmFile]!
      expect(getPinnedGrammarAssetUrl(wasmFile)).toMatch(/^https:\/\//)
      if (asset.sourceUrl) {
        expect(asset.sourceUrl).toContain(
          '/2e416060c2f70e99d46d09382f90523d6bd75993/',
        )
        expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/)
        continue
      }
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

  test('uses checksum-pinned repair when installed package candidates are missing', async () => {
    const targetDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'openbuff-grammar-resolver-'),
    )
    roots.push(targetDir)
    const repairedPath = path.join(targetDir, 'tree-sitter-gdscript.wasm')
    let repairCalls = 0

    const resolved = await resolveGrammarWasmSource({
      wasmFile: 'tree-sitter-gdscript.wasm',
      candidates: [path.join(targetDir, 'missing-package-asset.wasm')],
      repairDir: targetDir,
      repairImpl: async () => {
        repairCalls++
        fs.writeFileSync(repairedPath, 'verified wasm fixture')
        return repairedPath
      },
    })

    expect(resolved).toBe(repairedPath)
    expect(repairCalls).toBe(1)
  })

  test('prefers installed package assets without invoking network repair', async () => {
    const targetDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'openbuff-grammar-resolver-'),
    )
    roots.push(targetDir)
    const installedPath =
      require.resolve('tree-sitter-wasms/out/tree-sitter-javascript.wasm')

    const resolved = await resolveGrammarWasmSource({
      wasmFile: 'tree-sitter-javascript.wasm',
      candidates: [installedPath],
      repairDir: targetDir,
      repairImpl: async () => {
        throw new Error('repair should not run')
      },
    })

    expect(resolved).toBe(installedPath)
  })

  test('rejects an installed candidate whose checksum does not match the pin', async () => {
    const targetDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'openbuff-grammar-resolver-'),
    )
    roots.push(targetDir)
    const pollutedPath = path.join(targetDir, 'polluted.wasm')
    const repairedPath = path.join(targetDir, 'repaired.wasm')
    fs.writeFileSync(pollutedPath, 'untrusted extra package file')

    const resolved = await resolveGrammarWasmSource({
      wasmFile: 'tree-sitter-gdscript.wasm',
      candidates: [pollutedPath],
      repairDir: targetDir,
      repairImpl: async () => {
        fs.writeFileSync(repairedPath, 'verified by repair contract')
        return repairedPath
      },
    })

    expect(resolved).toBe(repairedPath)
  })

  test('fails closed when neither package candidates nor pinned repair exist', async () => {
    const targetDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'openbuff-grammar-resolver-'),
    )
    roots.push(targetDir)

    await expect(
      resolveGrammarWasmSource({
        wasmFile: 'tree-sitter-gdscript.wasm',
        candidates: [path.join(targetDir, 'missing.wasm')],
        repairDir: targetDir,
        repairImpl: async () => null,
      }),
    ).rejects.toThrow('checksum-pinned repair failed')
  })
})
