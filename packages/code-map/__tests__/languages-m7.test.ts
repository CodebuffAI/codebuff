import { describe, expect, test } from 'bun:test'

import {
  findLanguageConfigByExtension,
  getLanguageConfig,
  languageTable,
  WASM_FILES,
} from '../src/languages'

const TEST_TIMEOUT = 15_000

/* ------------------------------------------------------------------ */
/* M7.3 — PHP/Swift/Kotlin language config + graceful no-op.          */
/* ------------------------------------------------------------------ */
/* The @vscode/tree-sitter-wasm package does NOT bundle PHP/Swift/Kotlin
 * grammars. So the deliverable is: (a) register the three tag queries +
 * languageTable/WASM_FILES entries, and (b) verify getLanguageConfig no-ops
 * gracefully (resolves, never throws, returns undefined) when the WASM
 * grammar is absent — the existing try/catch in createLanguageConfig handles
 * it. No new WASM files are added to node_modules; M7.3 must not depend on a
 * user having the grammar.
 */

describe('M7.3 — PHP/Swift/Kotlin language config', () => {
  describe('languageTable + extension lookup', () => {
    test('PHP is registered for .php', () => {
      const cfg = findLanguageConfigByExtension('foo.php')
      expect(cfg).toBeDefined()
      expect(cfg?.extensions).toContain('.php')
      expect(cfg?.wasmFile).toBe('tree-sitter-php.wasm')
      expect(typeof cfg?.queryPathOrContent).toBe('string')
    })

    test('Swift is registered for .swift', () => {
      const cfg = findLanguageConfigByExtension('App.swift')
      expect(cfg).toBeDefined()
      expect(cfg?.extensions).toContain('.swift')
      expect(cfg?.wasmFile).toBe('tree-sitter-swift.wasm')
    })

    test('Kotlin is registered for .kt and .kts', () => {
      const kt = findLanguageConfigByExtension('Main.kt')
      expect(kt).toBeDefined()
      expect(kt?.extensions).toContain('.kt')
      expect(kt?.wasmFile).toBe('tree-sitter-kotlin.wasm')

      const kts = findLanguageConfigByExtension('build.gradle.kts')
      expect(kts).toBeDefined()
      expect(kts?.extensions).toContain('.kts')
      expect(kts?.wasmFile).toBe('tree-sitter-kotlin.wasm')
    })

    test('the three new languages are present in the manifest', () => {
      expect(languageTable.some((c) => c.wasmFile === 'tree-sitter-php.wasm')).toBe(true)
      expect(languageTable.some((c) => c.wasmFile === 'tree-sitter-swift.wasm')).toBe(true)
      expect(languageTable.some((c) => c.wasmFile === 'tree-sitter-kotlin.wasm')).toBe(true)
    })

    test('WASM_FILES manifest declares the new grammars (key === value)', () => {
      expect(WASM_FILES['tree-sitter-php.wasm']).toBe('tree-sitter-php.wasm')
      expect(WASM_FILES['tree-sitter-swift.wasm']).toBe('tree-sitter-swift.wasm')
      expect(WASM_FILES['tree-sitter-kotlin.wasm']).toBe('tree-sitter-kotlin.wasm')
    })
  })

  describe('graceful no-op on missing WASM grammar', () => {
    // getLanguageConfig must resolve (never reject) when the grammar wasm is
    // absent. Since @vscode/tree-sitter-wasm does not ship PHP/Swift/Kotlin
    // grammars, these resolve to undefined (the try/catch in
    // createLanguageConfig -> getLanguageConfig handles the load failure). If a
    // grammar were ever supplied, the result would still be a valid config
    // carrying the right wasmFile — either way it must not throw.
    test(
      'getLanguageConfig(.php) does not throw when the wasm is absent',
      async () => {
        const cfg = await getLanguageConfig('foo.php')
        expect(cfg === undefined || cfg?.wasmFile === 'tree-sitter-php.wasm').toBe(true)
      },
      TEST_TIMEOUT,
    )

    test(
      'getLanguageConfig(.swift) does not throw when the wasm is absent',
      async () => {
        const cfg = await getLanguageConfig('App.swift')
        expect(cfg === undefined || cfg?.wasmFile === 'tree-sitter-swift.wasm').toBe(true)
      },
      TEST_TIMEOUT,
    )

    test(
      'getLanguageConfig(.kt) does not throw when the wasm is absent',
      async () => {
        const cfg = await getLanguageConfig('Main.kt')
        expect(cfg === undefined || cfg?.wasmFile === 'tree-sitter-kotlin.wasm').toBe(true)
      },
      TEST_TIMEOUT,
    )
  })
})
