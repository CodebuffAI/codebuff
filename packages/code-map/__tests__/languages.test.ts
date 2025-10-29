import { describe, it, expect, mock } from 'bun:test'
import {
  languageTable,
  WASM_FILES,
  setWasmDir,
  getWasmDir,
  findLanguageConfigByExtension,
  createLanguageConfig,
  type LanguageConfig,
  type RuntimeLanguageLoader,
} from '../src/languages'

describe('languages module', () => {
  describe('languageTable', () => {
    it('should contain all expected language configurations', () => {
      expect(languageTable).toBeDefined()
      expect(Array.isArray(languageTable)).toBe(true)
      expect(languageTable.length).toBe(10) // Current number of supported languages
    })

    it('should have proper structure for each language config', () => {
      languageTable.forEach((config) => {
        expect(config).toHaveProperty('extensions')
        expect(config).toHaveProperty('wasmFile')
        expect(config).toHaveProperty('queryPathOrContent')
        expect(Array.isArray(config.extensions)).toBe(true)
        expect(config.extensions.length).toBeGreaterThan(0)
        expect(typeof config.wasmFile).toBe('string')
        expect(typeof config.queryPathOrContent).toBe('string')
      })
    })

    it('should support TypeScript files', () => {
      const tsConfig = languageTable.find((c) => c.extensions.includes('.ts'))
      expect(tsConfig).toBeDefined()
      expect(tsConfig?.wasmFile).toBe('tree-sitter-typescript.wasm')
      expect(tsConfig?.queryPathOrContent).toBeDefined()
    })

    it('should support TSX files', () => {
      const tsxConfig = languageTable.find((c) => c.extensions.includes('.tsx'))
      expect(tsxConfig).toBeDefined()
      expect(tsxConfig?.wasmFile).toBe('tree-sitter-tsx.wasm')
    })

    it('should support JavaScript files', () => {
      const jsConfig = languageTable.find((c) => c.extensions.includes('.js'))
      expect(jsConfig).toBeDefined()
      expect(jsConfig?.wasmFile).toBe('tree-sitter-javascript.wasm')
      expect(jsConfig?.extensions).toContain('.jsx')
    })

    it('should support Python files', () => {
      const pyConfig = languageTable.find((c) => c.extensions.includes('.py'))
      expect(pyConfig).toBeDefined()
      expect(pyConfig?.wasmFile).toBe('tree-sitter-python.wasm')
    })

    it('should support all documented languages', () => {
      const expectedLanguages = [
        { ext: '.ts', wasm: 'tree-sitter-typescript.wasm' },
        { ext: '.tsx', wasm: 'tree-sitter-tsx.wasm' },
        { ext: '.js', wasm: 'tree-sitter-javascript.wasm' },
        { ext: '.jsx', wasm: 'tree-sitter-javascript.wasm' },
        { ext: '.py', wasm: 'tree-sitter-python.wasm' },
        { ext: '.java', wasm: 'tree-sitter-java.wasm' },
        { ext: '.cs', wasm: 'tree-sitter-c-sharp.wasm' },
        { ext: '.cpp', wasm: 'tree-sitter-cpp.wasm' },
        { ext: '.hpp', wasm: 'tree-sitter-cpp.wasm' },
        { ext: '.rs', wasm: 'tree-sitter-rust.wasm' },
        { ext: '.rb', wasm: 'tree-sitter-ruby.wasm' },
        { ext: '.go', wasm: 'tree-sitter-go.wasm' },
      ]

      expectedLanguages.forEach(({ ext, wasm }) => {
        const config = languageTable.find((c) => c.extensions.includes(ext))
        expect(config).toBeDefined()
        expect(config?.wasmFile).toBe(wasm)
      })
    })
  })

  describe('WASM_FILES', () => {
    it('should contain all required WASM files', () => {
      const expectedFiles = [
        'tree-sitter-c-sharp.wasm',
        'tree-sitter-cpp.wasm',
        'tree-sitter-go.wasm',
        'tree-sitter-java.wasm',
        'tree-sitter-javascript.wasm',
        'tree-sitter-python.wasm',
        'tree-sitter-ruby.wasm',
        'tree-sitter-rust.wasm',
        'tree-sitter-tsx.wasm',
        'tree-sitter-typescript.wasm',
      ] as const

      expectedFiles.forEach((file) => {
        expect(WASM_FILES[file as keyof typeof WASM_FILES]).toBe(file)
      })
    })

    it('should have consistent keys and values', () => {
      Object.entries(WASM_FILES).forEach(([key, value]) => {
        expect(key).toBe(value)
      })
    })
  })

  describe('WASM directory management', () => {
    it('should set and get custom WASM directory', () => {
      const testDir = '/custom/wasm/path'
      setWasmDir(testDir)
      expect(getWasmDir()).toBe(testDir)

      // Reset for other tests
      setWasmDir('')
    })

    it('should return empty string when no custom directory is set', () => {
      setWasmDir('')
      expect(getWasmDir()).toBe('')
    })

    it('should allow changing WASM directory multiple times', () => {
      setWasmDir('/first/path')
      expect(getWasmDir()).toBe('/first/path')

      setWasmDir('/second/path')
      expect(getWasmDir()).toBe('/second/path')

      // Reset for other tests
      setWasmDir('')
    })
  })

  describe('findLanguageConfigByExtension', () => {
    it('should find config for TypeScript files', () => {
      const config = findLanguageConfigByExtension('test.ts')
      expect(config).toBeDefined()
      expect(config?.extensions).toContain('.ts')
      expect(config?.wasmFile).toBe('tree-sitter-typescript.wasm')
    })

    it('should find config for JavaScript files', () => {
      const config = findLanguageConfigByExtension('test.js')
      expect(config).toBeDefined()
      expect(config?.extensions).toContain('.js')
      expect(config?.wasmFile).toBe('tree-sitter-javascript.wasm')
    })

    it('should find config for Python files', () => {
      const config = findLanguageConfigByExtension('test.py')
      expect(config).toBeDefined()
      expect(config?.extensions).toContain('.py')
      expect(config?.wasmFile).toBe('tree-sitter-python.wasm')
    })

    it('should return undefined for unsupported extensions', () => {
      const config = findLanguageConfigByExtension('test.unknown')
      expect(config).toBeUndefined()
    })

    it('should handle files without extensions', () => {
      const config = findLanguageConfigByExtension('Makefile')
      expect(config).toBeUndefined()
    })

    it('should handle nested file paths', () => {
      const config = findLanguageConfigByExtension('src/components/Button.tsx')
      expect(config).toBeDefined()
      expect(config?.extensions).toContain('.tsx')
    })

    it('should handle files with multiple dots', () => {
      const config = findLanguageConfigByExtension('test.spec.ts')
      expect(config).toBeDefined()
      expect(config?.extensions).toContain('.ts')
    })

    it('should be case sensitive', () => {
      const config = findLanguageConfigByExtension('test.TS')
      expect(config).toBeUndefined()
    })
  })

  describe('createLanguageConfig', () => {
    it('should return undefined for unsupported file extensions', async () => {
      const mockLoader: RuntimeLanguageLoader = {
        initParser: mock(async () => {}),
        loadLanguage: mock(async () => ({}) as any),
      }

      const result = await createLanguageConfig('test.unknown', mockLoader)
      expect(result).toBeUndefined()
      expect(mockLoader.initParser).not.toHaveBeenCalled()
      expect(mockLoader.loadLanguage).not.toHaveBeenCalled()
    })

    it('should have proper function signature for createLanguageConfig', () => {
      // Just verify that the function exists and has the right signature
      expect(typeof createLanguageConfig).toBe('function')
      expect(createLanguageConfig.length).toBe(2) // filePath and runtimeLoader parameters
    })
  })

  describe('LanguageConfig interface', () => {
    it('should have proper type structure', () => {
      const config: LanguageConfig = {
        extensions: ['.test'],
        wasmFile: 'test.wasm',
        queryPathOrContent: 'test query',
      }

      expect(config.extensions).toEqual(['.test'])
      expect(config.wasmFile).toBe('test.wasm')
      expect(config.queryPathOrContent).toBe('test query')
      expect(config.parser).toBeUndefined()
      expect(config.query).toBeUndefined()
      expect(config.language).toBeUndefined()
    })
  })

  describe('RuntimeLanguageLoader interface', () => {
    it('should enforce proper interface implementation', () => {
      const loader: RuntimeLanguageLoader = {
        initParser: async () => {},
        loadLanguage: async (wasmFile: string) => ({}) as any,
      }

      expect(typeof loader.initParser).toBe('function')
      expect(typeof loader.loadLanguage).toBe('function')
    })
  })
})
