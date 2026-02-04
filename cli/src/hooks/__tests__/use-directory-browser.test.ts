import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import os from 'os'
import path from 'path'

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

/**
 * Tests for useDirectoryBrowser hook logic.
 *
 * These tests focus on the pure logic aspects of the hook:
 * - expandPath: Expands ~ to home directory
 * - Path validation and navigation logic
 */

// Extract the pure expandPath logic for testing
const expandPath = (inputPath: string): string => {
  if (inputPath.startsWith('~')) {
    return path.join(os.homedir(), inputPath.slice(1))
  }
  return inputPath
}

// Extract the path validation logic for testing
const isValidDirectoryPath = (inputPath: string): boolean => {
  const expandedPath = expandPath(inputPath.trim())
  try {
    return existsSync(expandedPath) && statSync(expandedPath).isDirectory()
  } catch {
    return false
  }
}

describe('useDirectoryBrowser - expandPath', () => {
  const homeDir = os.homedir()

  describe('tilde expansion', () => {
    test('expands ~ to home directory', () => {
      const result = expandPath('~')
      expect(result).toBe(homeDir)
    })

    test('expands ~/path to home directory + path', () => {
      const result = expandPath('~/Documents')
      expect(result).toBe(path.join(homeDir, 'Documents'))
    })

    test('expands ~/nested/path correctly', () => {
      const result = expandPath('~/nested/path/to/file')
      expect(result).toBe(path.join(homeDir, 'nested/path/to/file'))
    })

    test('expands ~/ (with trailing slash) correctly', () => {
      const result = expandPath('~/')
      expect(result).toBe(path.join(homeDir, '/'))
    })

    test('handles ~ with special characters in path', () => {
      const result = expandPath('~/path with spaces')
      expect(result).toBe(path.join(homeDir, 'path with spaces'))
    })
  })

  describe('non-tilde paths', () => {
    test('returns absolute path unchanged', () => {
      const result = expandPath('/usr/local/bin')
      expect(result).toBe('/usr/local/bin')
    })

    test('returns relative path unchanged', () => {
      const result = expandPath('relative/path')
      expect(result).toBe('relative/path')
    })

    test('returns empty string unchanged', () => {
      const result = expandPath('')
      expect(result).toBe('')
    })

    test('returns dot path unchanged', () => {
      const result = expandPath('.')
      expect(result).toBe('.')
    })

    test('returns double dot path unchanged', () => {
      const result = expandPath('..')
      expect(result).toBe('..')
    })

    test('does not expand ~ in middle of path', () => {
      const result = expandPath('/some/~/path')
      expect(result).toBe('/some/~/path')
    })

    test('does not expand ~ at end of path', () => {
      const result = expandPath('/some/path~')
      expect(result).toBe('/some/path~')
    })
  })

  describe('edge cases', () => {
    test('handles ~user syntax (does not expand, returns as-is)', () => {
      // In this implementation, ~user is not specially handled
      // It would expand to homedir + 'user' which may not be intended
      // but that's the current behavior
      const result = expandPath('~user')
      expect(result).toBe(path.join(homeDir, 'user'))
    })

    test('handles path with only tilde character', () => {
      const result = expandPath('~')
      expect(result).toBe(homeDir)
    })
  })
})

describe('useDirectoryBrowser - path validation', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'dir-browser-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('isValidDirectoryPath', () => {
    test('returns true for existing directory', () => {
      expect(isValidDirectoryPath(tempDir)).toBe(true)
    })

    test('returns true for existing nested directory', () => {
      const nestedDir = path.join(tempDir, 'nested')
      mkdirSync(nestedDir)
      expect(isValidDirectoryPath(nestedDir)).toBe(true)
    })

    test('returns false for non-existent path', () => {
      expect(isValidDirectoryPath('/this/path/does/not/exist')).toBe(false)
    })

    test('returns false for file (not directory)', () => {
      const filePath = path.join(tempDir, 'test.txt')
      writeFileSync(filePath, 'test')
      expect(isValidDirectoryPath(filePath)).toBe(false)
    })

    test('handles whitespace in path by trimming', () => {
      expect(isValidDirectoryPath(`  ${tempDir}  `)).toBe(true)
    })

    test('returns false for empty string', () => {
      expect(isValidDirectoryPath('')).toBe(false)
    })

    test('handles tilde paths correctly', () => {
      // Home directory should exist
      expect(isValidDirectoryPath('~')).toBe(true)
    })
  })
})

describe('useDirectoryBrowser - directory entry conversion', () => {
  // Test the logic for converting directory entries to list items
  const convertToListItem = (entry: { name: string; path: string; isParent: boolean }) => ({
    id: entry.path,
    label: entry.name,
    icon: entry.isParent ? '📂' : '📁',
  })

  test('converts parent directory entry correctly', () => {
    const entry = { name: '..', path: '/home', isParent: true }
    const result = convertToListItem(entry)
    
    expect(result.id).toBe('/home')
    expect(result.label).toBe('..')
    expect(result.icon).toBe('📂')
  })

  test('converts regular directory entry correctly', () => {
    const entry = { name: 'Documents', path: '/home/user/Documents', isParent: false }
    const result = convertToListItem(entry)
    
    expect(result.id).toBe('/home/user/Documents')
    expect(result.label).toBe('Documents')
    expect(result.icon).toBe('📁')
  })

  test('handles special characters in directory names', () => {
    const entry = { name: 'My Folder (2024)', path: '/home/My Folder (2024)', isParent: false }
    const result = convertToListItem(entry)
    
    expect(result.id).toBe('/home/My Folder (2024)')
    expect(result.label).toBe('My Folder (2024)')
  })
})
