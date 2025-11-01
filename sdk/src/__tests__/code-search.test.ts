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

// Helper to create ripgrep JSON match output
function createRgJsonMatch(
  filePath: string,
  lineNumber: number,
  lineText: string,
): string {
  return JSON.stringify({
    type: 'match',
    data: {
      path: { text: filePath },
      lines: { text: lineText },
      line_number: lineNumber,
    },
  })
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

      // Simulate ripgrep JSON output
      const output = [
        createRgJsonMatch('file1.ts', 1, 'import foo from "bar"'),
        createRgJsonMatch('file1.ts', 5, 'import { baz } from "qux"'),
        createRgJsonMatch('file2.ts', 10, 'import React from "react"'),
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

      // Ripgrep JSON output - only match events are processed
      const output = [
        createRgJsonMatch('test.ts', 1, 'import { env } from "./config"'),
        createRgJsonMatch('other.ts', 5, 'import env from "process"'),
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
      expect(value.stdout.length).toBeLessThan(1000)
    })

    it('should correctly parse output with -B flag (before context)', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'export',
        flags: '-B 2',
      })

      const output = [
        createRgJsonMatch('app.ts', 3, 'export const main = () => {}'),
        createRgJsonMatch('utils.ts', 10, 'export function helper() {}'),
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

      const output = createRgJsonMatch('code.ts', 6, '  // TODO: implement this')

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
        createRgJsonMatch('file1.ts', 1, 'test line'),
        createRgJsonMatch('file2.ts', 5, 'another test'),
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

      const output = [
        createRgJsonMatch('my-file.ts', 1, 'import foo'),
        createRgJsonMatch('other-file.ts', 5, 'import bar'),
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

      const output = createRgJsonMatch(
        'my-complex_file-name.ts',
        10,
        'test content',
      )

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      // Should parse correctly despite multiple hyphens in filename
      expect(value.stdout).toContain('my-complex_file-name.ts:')
      expect(value.stdout).toContain('test content')
    })

    it('should not accumulate entire file content (regression test)', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'import.*env',
        flags: '-A 2',
        maxOutputStringLength: 20000,
      })

      const output = [
        createRgJsonMatch('large-file.ts', 5, 'import { env } from "config"'),
        createRgJsonMatch('other.ts', 1, 'import env'),
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
        createRgJsonMatch('file.ts', 1, 'test 1'),
        createRgJsonMatch('file.ts', 5, 'test 2'),
        createRgJsonMatch('file.ts', 10, 'test 3'),
        createRgJsonMatch('file.ts', 15, 'test 4'),
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
        createRgJsonMatch('file1.ts', 1, 'test 1'),
        createRgJsonMatch('file1.ts', 5, 'test 2'),
        createRgJsonMatch('file2.ts', 1, 'test 3'),
        createRgJsonMatch('file2.ts', 5, 'test 4'),
      ].join('\n')

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      // Should be limited globally to 3 results
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
        createRgJsonMatch('file.ts', 1, 'valid line'),
        'malformed line without proper JSON',
        createRgJsonMatch('file.ts', 2, 'another valid line'),
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

  describe('bug fixes validation', () => {
    it('should handle patterns starting with hyphen (regression test)', async () => {
      // Bug: Patterns starting with '-' were misparsed as flags
      // Fix: Added '--' separator before pattern in args
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: '-foo',
      })

      const output = createRgJsonMatch('file.ts', 1, 'const x = -foo')

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      expect(value.stdout).toContain('file.ts:')
      expect(value.stdout).toContain('-foo')
    })

    it('should strip trailing newlines from line text (regression test)', async () => {
      // Bug: JSON lineText includes trailing \n, causing blank lines
      // Fix: Strip \r?\n from lineText
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'import',
      })

      // Simulate ripgrep JSON with trailing newlines in lineText
      const output = JSON.stringify({
        type: 'match',
        data: {
          path: { text: 'file.ts' },
          lines: { text: 'import foo from "bar"\n' }, // trailing newline
          line_number: 1,
        },
      })

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      // Should not have double newlines or blank lines
      expect(value.stdout).not.toContain('\n\n\n')
      expect(value.stdout).toContain('import foo')
    })

    it('should process multiple JSON objects in remainder at close (regression test)', async () => {
      // Bug: Only processed one JSON object in remainder
      // Fix: Loop through all complete lines in remainder
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'test',
      })

      // Send partial JSON chunks that will be completed in remainder
      const match1 = createRgJsonMatch('file1.ts', 1, 'test 1')
      const match2 = createRgJsonMatch('file2.ts', 2, 'test 2')
      const match3 = createRgJsonMatch('file3.ts', 3, 'test 3')

      // Send as one chunk without trailing newline to simulate remainder scenario
      const output = `${match1}\n${match2}\n${match3}`

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      // All three matches should be processed
      expect(value.stdout).toContain('file1.ts:')
      expect(value.stdout).toContain('file2.ts:')
      expect(value.stdout).toContain('file3.ts:')
    })

    it('should enforce output size limit during streaming (regression test)', async () => {
      // Bug: Output size only checked at end, could exceed limit
      // Fix: Check estimatedOutputLen during streaming and stop early
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'test',
        maxOutputStringLength: 500, // Small limit
      })

      // Generate many matches that would exceed the limit
      const matches: string[] = []
      for (let i = 0; i < 50; i++) {
        matches.push(createRgJsonMatch('file.ts', i, `test line ${i} with some content`))
      }
      const output = matches.join('\n')

      mockProcess.stdout.emit('data', Buffer.from(output))
      // Process won't get to close because it should kill early
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      // Should have stopped early and included size limit message
      expect(value.stdout).toContain('Output size limit reached')
      expect(value.message).toContain('Stopped early')
    })

    it('should handle non-UTF8 paths using path.bytes (regression test)', async () => {
      // Bug: Only handled path.text, not path.bytes for non-UTF8 paths
      // Fix: Check both path.text and path.bytes
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'test',
      })

      // Simulate ripgrep JSON with path.bytes instead of path.text
      const output = JSON.stringify({
        type: 'match',
        data: {
          path: { bytes: 'file-with-bytes.ts' }, // Using bytes field
          lines: { text: 'test content' },
          line_number: 1,
        },
      })

      mockProcess.stdout.emit('data', Buffer.from(output))
      mockProcess.emit('close', 0)

      const result = await searchPromise
      const value = result[0].value as any

      // Should handle path.bytes
      expect(value.stdout).toContain('file-with-bytes.ts:')
      expect(value.stdout).toContain('test content')
    })
  })

  describe('timeout handling', () => {
    it('should timeout after specified seconds', async () => {
      const searchPromise = codeSearch({
        projectPath: '/test/project',
        pattern: 'test',
        timeoutSeconds: 1,
      })

      // Don't emit any data or close event to simulate hanging
      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1100))

      // Manually trigger the timeout by emitting close
      mockProcess.emit('close', null)

      const result = await searchPromise
      const value = result[0].value as any

      expect(value.errorMessage).toContain('timed out')
    })
  })
})
