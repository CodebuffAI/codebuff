import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

import { WASM_FILES } from '@codebuff/code-map'
import { LANGUAGE_WASM_FILES } from '../../../packages/code-map/src/wasm-files'

const TREE_SITTER_RUNTIME_WASM = 'tree-sitter.wasm'

function readBuildScript(): string {
  return readFileSync(
    join(import.meta.dir, '..', '..', 'scripts', 'build.ts'),
    'utf-8',
  )
}

describe('build.ts copyWasmFiles / WASM_FILES parity', () => {
  test('the canonical language list contains every WASM_FILES entry once', () => {
    expect(LANGUAGE_WASM_FILES).toEqual(Object.values(WASM_FILES))
    expect(new Set(LANGUAGE_WASM_FILES).size).toBe(LANGUAGE_WASM_FILES.length)
    expect(LANGUAGE_WASM_FILES.length).toBeGreaterThan(0)
  })

  test('copyWasmFiles derives its list from the canonical language manifest', () => {
    const source = readBuildScript()

    expect(source).toContain(
      "import { LANGUAGE_WASM_FILES } from '../../packages/code-map/src/wasm-files'",
    )
    expect(source).toContain(
      `const wasmFiles = ['${TREE_SITTER_RUNTIME_WASM}', ...LANGUAGE_WASM_FILES]`,
    )

    // Grammar filenames belong in packages/code-map/src/wasm-files.ts only.
    // Keeping them out of the SDK build script prevents the two lists drifting.
    for (const wasmFile of LANGUAGE_WASM_FILES) {
      expect(source).not.toContain(`'${wasmFile}',`)
    }
  })
})
