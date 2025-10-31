import { EventEmitter } from 'events'

import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test'

import { codeSearch } from '../tools/code-search'

import type { ChildProcess } from 'child_process'

// Helper to create a mock child process
function createMockChildProcess() {
  const mockProcess = new EventEmitter() as ChildProcess & {
    stdout: EventEmitter
    stderr: EventEmitter
  }
  mockProcess.stdout = new EventEmitter() as any
  mockProcess.stderr = new EventEmitter() as any
  return mockProcess
}

describe('codeSearch', () => {
  let mockSpawn: ReturnType<typeof mock>
  let mockProcess: ReturnType<typeof createMockChildProcess>

  beforeEach(async () => {
    mockProcess = createMockChildProcess()
    mockSpawn = mock(() => mockProcess)
    await mockModule('child_process', () => ({
      spawn: mockSpawn,
    }))
  })

  afterEach(() => {
    mock.restore()
    clearMockedModules()
  })

  describe('basic search', () => {
    it('should parse standard ripgrep output without context flags', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'import',
      })

      // Simulate ripgrep output
      const output = [
        'file1.ts:1:import foo from "bar"',
        'file1.ts:5:import { baz } from "qux"',
        'file2.ts:10:import React from "react"',
      ].join('\n')

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      expect(result[0].type).toBe('json')
      const value = result[0].value as any
      expect(value.stdout).toContain('file1.ts:')
      expect(value.stdout).toContain('file2.ts:')
    })
  })

  describe('context flags handling', () => {
    it('should correctly parse output with -A flag (after context)', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'import.*env',
        flags: '-A 2',
      })

      // Ripgrep output with -A 2 flag:
      // Match lines use colon: filename:line_number:content
      // Context lines use hyphen: filename-line_number-content
      const output = [
        'test.ts:1:import { env } from "./config"',
        'test.ts-2-',
        'test.ts-3-const config = {',
        '--',
        'other.ts:5:import env from "process"',
        'other.ts-6-',
        'other.ts-7-console.log(env)',
      ].join('\n')

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      expect(result[0].type).toBe('json')
      const value = result[0].value as any

      // Should contain both files
      expect(value.stdout).toContain('test.ts:')
      expect(value.stdout).toContain('other.ts:')

      // Should not include the entire file content
      // (bug would cause file content to accumulate)
      expect(value.stdout.length).toBeLessThan(1000)
    })

    it('should correctly parse output with -B flag (before context)', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'export',
        flags: '-B 2',
      })

      const output = [
        'app.ts-1-import foo',
        'app.ts-2-import bar',
        'app.ts:3:export const main = () => {}',
        '--',
        'utils.ts-8-// Helper function',
        'utils.ts-9-',
        'utils.ts:10:export function helper() {}',
      ].join('\n')

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      expect(value.stdout).toContain('app.ts:')
      expect(value.stdout).toContain('utils.ts:')
    })

    it('should correctly parse output with -C flag (context before and after)', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'TODO',
        flags: '-C 1',
      })

      const output = [
        'code.ts-5-function process() {',
        'code.ts:6:  // TODO: implement this',
        'code.ts-7-  return null',
      ].join('\n')

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      expect(value.stdout).toContain('code.ts:')
      expect(value.stdout).toContain('TODO')
    })

    it('should skip separator lines between result groups', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'test',
        flags: '-A 1',
      })

      const output = [
        'file1.ts:1:test line',
        'file1.ts-2-context',
        '--',
        'file2.ts:5:another test',
        'file2.ts-6-more context',
      ].join('\n')

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      // Should not contain '--' separator
      expect(value.stdout).not.toContain('--')
    })
  })

  describe('edge cases with context lines', () => {
    it('should handle filenames with hyphens correctly', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'import',
        flags: '-A 1',
      })

      // Filename contains hyphen, but match line uses colon
      const output = [
        'my-file.ts:1:import foo',
        'my-file.ts-2-const x = 1',
        '--',
        'other-file.ts:5:import bar',
        'other-file.ts-6-const y = 2',
      ].join('\n')

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      // Files are formatted with filename on its own line followed by content
      expect(value.stdout).toContain('my-file.ts:')
      expect(value.stdout).toContain('import foo')
      expect(value.stdout).toContain('other-file.ts:')
      expect(value.stdout).toContain('import bar')
    })

    it('should handle filenames with multiple hyphens and underscores', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'test',
        flags: '-A 1',
      })

      // Filename with multiple hyphens and underscores
      const output = [
        'my-complex_file-name.ts:10:test content',
        'my-complex_file-name.ts-11-context line',
      ].join('\n')

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      // Should parse correctly despite multiple hyphens in filename
      expect(value.stdout).toContain('my-complex_file-name.ts:')
      expect(value.stdout).toContain('test content')
      expect(value.stdout).toContain('context line')
    })

    it('should not accumulate entire file content (regression test)', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'import.*env',
        flags: '-A 2',
        maxOutputStringLength: 20000,
      })

      // Simulate a large file with context lines
      // This tests the specific bug where context lines were incorrectly parsed
      const largeFileContent = Array(100)
        .fill(0)
        .map((_, i) => `line${i}: some code here`)
        .join('\n')

      const output = [
        'large-file.ts:5:import { env } from "config"',
        'large-file.ts-6-// some context',
        'large-file.ts-7-const x = 1',
        '--',
        'other.ts:1:import env',
        'other.ts-2-usage here',
        'other.ts-3-more usage',
      ].join('\n')

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      // Output should be reasonably sized, not including entire file
      expect(value.stdout.length).toBeLessThan(2000)

      // Should still contain the matches
      expect(value.stdout).toContain('large-file.ts:')
      expect(value.stdout).toContain('other.ts:')
    })
  })

  describe('result limiting with context lines', () => {
    it('should respect maxResults per file with context lines', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'test',
        flags: '-A 1',
        maxResults: 2,
      })

      const output = [
        'file.ts:1:test 1',
        'file.ts-2-context',
        '--',
        'file.ts:5:test 2',
        'file.ts-6-context',
        '--',
        'file.ts:10:test 3',
        'file.ts-11-context',
        '--',
        'file.ts:15:test 4',
        'file.ts-16-context',
      ].join('\n')

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      // Should be limited to 2 results per file
      // Count how many 'test' matches are in the output
      const testMatches = (value.stdout.match(/test \d/g) || []).length
      expect(testMatches).toBeLessThanOrEqual(2)
      expect(value.stdout).toContain('Results limited')
    })

    it('should respect globalMaxResults with context lines', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'test',
        flags: '-A 1',
        globalMaxResults: 3,
      })

      const output = [
        'file1.ts:1:test 1',
        'file1.ts-2-context',
        '--',
        'file1.ts:5:test 2',
        'file1.ts-6-context',
        '--',
        'file2.ts:1:test 3',
        'file2.ts-2-context',
        '--',
        'file2.ts:5:test 4',
        'file2.ts-6-context',
      ].join('\n')

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      // Should be limited globally to 3 results (each line with context counts as one result)
      const matches = (value.stdout.match(/test \d/g) || []).length
      expect(matches).toBeLessThanOrEqual(3)
      // Check for either 'Global limit' message or truncation indicator
      const hasLimitMessage =
        value.stdout.includes('Global limit') ||
        value.stdout.includes('Results limited')
      expect(hasLimitMessage).toBe(true)
    })
  })

  describe('malformed output handling', () => {
    it('should skip lines without separator', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'test',
      })

      const output = [
        'file.ts:1:valid line',
        'malformed line without separator',
        'file.ts:2:another valid line',
      ].join('\n')

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      // Should still process valid lines
      expect(value.stdout).toContain('valid line')
      expect(value.stdout).toContain('another valid line')
    })

    it('should handle empty output', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'nonexistent',
      })

      mockProcess.stdout.emit('data', Buffer.from(''))
      mockProcess.emit('close', 1)

      const result = await searchPromise
      const value = result[0].value as any

      // formatCodeSearchOutput returns 'No results' for empty input
      expect(value.stdout).toBe('No results')
    })
  })
})
