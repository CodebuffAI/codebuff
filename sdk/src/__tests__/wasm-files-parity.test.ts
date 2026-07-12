import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

import { WASM_FILES } from '@codebuff/code-map'

/**
 * The base tree-sitter runtime WASM. This file is NOT a language grammar and
 * is intentionally absent from WASM_FILES (which only tracks language-specific
 * grammars). build.ts copyWasmFiles() legitimately includes it as the first
 * entry, so the parity assertion below ignores it.
 */
const TREE_SITTER_RUNTIME_WASM = 'tree-sitter.wasm'

/**
 * Parse the `wasmFiles` array literal from build.ts source text.
 *
 * The array is a simple `const wasmFiles = [ ... ]` with single-quoted string
 * entries, one per line. We extract every `'...'` token between the opening
 * and closing brackets so a future format change (e.g. template literals) is
 * obvious and easy to update.
 */
function extractWasmFilesFromBuildScript(): string[] {
  const buildScriptPath = join(
    import.meta.dir,
    '..',
    '..',
    'scripts',
    'build.ts',
  )
  const source = readFileSync(buildScriptPath, 'utf-8')

  // Find the `const wasmFiles = [...]` block inside copyWasmFiles().
  const arrayStart = source.indexOf('const wasmFiles = [')
  expect(arrayStart).toBeGreaterThan(-1)
  const bracketOpen = source.indexOf('[', arrayStart)
  const bracketClose = source.indexOf(']', bracketOpen)
  expect(bracketClose).toBeGreaterThan(bracketOpen)

  const arrayBody = source.slice(bracketOpen, bracketClose)
  const matches = arrayBody.matchAll(/'([^']+)'/g)
  return Array.from(matches, (m) => m[1])
}

describe('build.ts copyWasmFiles / WASM_FILES parity', () => {
  test('every WASM_FILES entry appears in build.ts copyWasmFiles list', () => {
    const buildWasmFiles = extractWasmFilesFromBuildScript()
    const wasmFilesKeys = Object.keys(WASM_FILES)

    // Sanity: the arrays are non-empty.
    expect(buildWasmFiles.length).toBeGreaterThan(0)
    expect(wasmFilesKeys.length).toBeGreaterThan(0)

    const buildSet = new Set(buildWasmFiles)
    const missing = wasmFilesKeys.filter((f) => !buildSet.has(f))

    expect(missing).toEqual([])
  })

  test('no language grammar WASM in build.ts is absent from WASM_FILES', () => {
    const buildWasmFiles = extractWasmFilesFromBuildScript()
    const wasmFilesKeys = new Set(Object.keys(WASM_FILES))

    // Every `tree-sitter-*.wasm` in build.ts (excluding the base runtime) must
    // be in WASM_FILES so code-map can actually load it.
    const orphaned = buildWasmFiles.filter(
      (f) =>
        f !== TREE_SITTER_RUNTIME_WASM &&
        f.startsWith('tree-sitter-') &&
        !wasmFilesKeys.has(f),
    )

    expect(orphaned).toEqual([])
  })
})
