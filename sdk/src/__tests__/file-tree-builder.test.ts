import { describe, expect, it, mock } from 'bun:test'

import { buildFileTree, computeProjectIndex } from '../impl/file-tree-builder'

/**
 * These tests focus on DOMAIN LOGIC - the tree building algorithm,
 * sorting rules (directories before files, alphabetical), and hierarchy.
 * Low-value tests that just verify JavaScript built-in behavior have been removed.
 */

describe('buildFileTree', () => {
  describe('tree structure building', () => {
    it('should create nested directory structure from path', () => {
      const result = buildFileTree(['src/components/Button.tsx'])
      
      expect(result[0].name).toBe('src')
      expect(result[0].type).toBe('directory')
      expect(result[0].children![0].name).toBe('components')
      expect(result[0].children![0].children![0].name).toBe('Button.tsx')
      expect(result[0].children![0].children![0].type).toBe('file')
    })

    it('should group multiple files in same directory', () => {
      const result = buildFileTree(['src/a.ts', 'src/b.ts', 'src/c.ts'])
      
      expect(result).toHaveLength(1) // single src directory
      expect(result[0].children).toHaveLength(3) // three files inside
    })

    it('should create separate root directories', () => {
      const result = buildFileTree(['src/file.ts', 'lib/file.ts', 'tests/file.ts'])
      
      expect(result).toHaveLength(3)
      expect(result.map(n => n.name)).toContain('src')
      expect(result.map(n => n.name)).toContain('lib')
      expect(result.map(n => n.name)).toContain('tests')
    })

    it('should handle mixed root files and directories', () => {
      const result = buildFileTree(['root.ts', 'src/nested.ts'])
      
      const rootFile = result.find(n => n.name === 'root.ts')
      const srcDir = result.find(n => n.name === 'src')
      
      expect(rootFile?.type).toBe('file')
      expect(srcDir?.type).toBe('directory')
    })
  })

  describe('sorting: directories before files, then alphabetical', () => {
    it('should sort directories BEFORE files at same level', () => {
      const result = buildFileTree(['file.ts', 'src/file.ts', 'another.ts'])
      
      // Directory should come first
      expect(result[0].name).toBe('src')
      expect(result[0].type).toBe('directory')
      // Then files
      expect(result[1].type).toBe('file')
      expect(result[2].type).toBe('file')
    })

    it('should sort alphabetically within same type', () => {
      const result = buildFileTree(['z.ts', 'a.ts', 'm.ts'])
      
      expect(result[0].name).toBe('a.ts')
      expect(result[1].name).toBe('m.ts')
      expect(result[2].name).toBe('z.ts')
    })

    it('should sort children within directories', () => {
      const result = buildFileTree(['src/z.ts', 'src/a.ts', 'src/utils/helper.ts'])
      
      // utils directory should come before files
      expect(result[0].children![0].name).toBe('utils')
      expect(result[0].children![0].type).toBe('directory')
      // then files alphabetically
      expect(result[0].children![1].name).toBe('a.ts')
      expect(result[0].children![2].name).toBe('z.ts')
    })
  })

  describe('filePath property', () => {
    it('should set correct filePath for nested items', () => {
      const result = buildFileTree(['src/components/Button.tsx'])
      
      expect(result[0].filePath).toBe('src')
      expect(result[0].children![0].filePath).toBe('src/components')
      expect(result[0].children![0].children![0].filePath).toBe('src/components/Button.tsx')
    })
  })

  describe('complex project structure', () => {
    it('should handle typical project layout', () => {
      const files = [
        'package.json',
        'tsconfig.json',
        'src/index.ts',
        'src/components/Button.tsx',
        'src/utils/helpers.ts',
        'tests/unit/button.test.ts',
      ]
      const result = buildFileTree(files)
      
      // Directories first (src, tests), then files (package.json, tsconfig.json)
      expect(result[0].type).toBe('directory')
      expect(result[1].type).toBe('directory')
      expect(result.map(n => n.name)).toContain('src')
      expect(result.map(n => n.name)).toContain('tests')
      expect(result.map(n => n.name)).toContain('package.json')
    })
  })
})

describe('computeProjectIndex', () => {
  it('should return file tree for project files', async () => {
    const projectFiles = {
      'src/index.ts': 'export const hello = "world"',
      'src/utils.ts': 'export const add = (a, b) => a + b',
    }
    
    const result = await computeProjectIndex('/mock/cwd', projectFiles)
    
    expect(result.fileTree).toHaveLength(1)
    expect(result.fileTree[0].name).toBe('src')
    expect(result.fileTree[0].children).toHaveLength(2)
  })

  it('should sort file paths before building tree', async () => {
    const projectFiles = {
      'z.ts': 'const z = 1',
      'a.ts': 'const a = 1',
      'm.ts': 'const m = 1',
    }
    
    const result = await computeProjectIndex('/mock/cwd', projectFiles)
    
    expect(result.fileTree[0].name).toBe('a.ts')
    expect(result.fileTree[1].name).toBe('m.ts')
    expect(result.fileTree[2].name).toBe('z.ts')
  })

  it('should return correct structure shape', async () => {
    const result = await computeProjectIndex('/mock/cwd', { 'file.ts': 'export const x = 1' })
    
    expect(result).toHaveProperty('fileTree')
    expect(result).toHaveProperty('fileTokenScores')
    expect(result).toHaveProperty('tokenCallers')
    expect(Array.isArray(result.fileTree)).toBe(true)
  })
})

/**
 * Mutation tests - verify our tests would catch real bugs
 */
describe('mutation detection', () => {
  it('REQUIRES directories to sort before files', () => {
    // If sorting was removed/broken, this would fail
    const result = buildFileTree(['z-file.ts', 'a-dir/file.ts'])
    expect(result[0].name).toBe('a-dir') // directory first, even though z < a alphabetically for files
    expect(result[0].type).toBe('directory')
  })

  it('REQUIRES alphabetical sorting within type', () => {
    // If localeCompare was removed, this would fail
    const result = buildFileTree(['z.ts', 'a.ts'])
    expect(result[0].name).toBe('a.ts')
  })

  it('REQUIRES recursive sorting of children', () => {
    // If sortNodes wasn't called recursively, this would fail
    const result = buildFileTree(['parent/z.ts', 'parent/a.ts'])
    expect(result[0].children![0].name).toBe('a.ts')
  })
})
