import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { cleanMarkdownCodeBlock } from '@codebuff/common/util/file'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { processFileBlock } from '../process-file-block'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'

let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps

describe('processFileBlockModule', () => {
  beforeAll(async () => {
    // Mock database interactions
    await mockModule('pg-pool', () => ({
      Pool: class {
        connect() {
          return {
            query: () => ({
              rows: [{ id: 'test-user-id' }],
              rowCount: 1,
            }),
            release: () => {},
          }
        }
      },
    }))
  })

  afterAll(() => {
    clearMockedModules()
  })

  beforeEach(() => {
    agentRuntimeImpl = { ...TEST_AGENT_RUNTIME_IMPL }
  })

  describe('cleanMarkdownCodeBlock', () => {
    it('should remove markdown code block syntax with language tag', () => {
      const input = '```typescript\nconst x = 1;\n```'
      expect(cleanMarkdownCodeBlock(input)).toBe('const x = 1;')
    })

    it('should remove markdown code block syntax without language tag', () => {
      const input = '```\nconst x = 1;\n```'
      expect(cleanMarkdownCodeBlock(input)).toBe('const x = 1;')
    })

    it('should return original content if not a code block', () => {
      const input = 'const x = 1;'
      expect(cleanMarkdownCodeBlock(input)).toBe('const x = 1;')
    })

    it('should handle multiline code blocks', () => {
      const input = '```javascript\nconst x = 1;\nconst y = 2;\n```'
      expect(cleanMarkdownCodeBlock(input)).toBe('const x = 1;\nconst y = 2;')
    })
  })

  describe('processFileBlock', () => {
    it('[ABI-M05] preserves markdown fences verbatim when creating new files', async () => {
      const newContent =
        '```typescript\nfunction test() {\n  return true;\n}\n```'

      const result = await processFileBlock({
        path: 'test.ts',
        initialContentPromise: Promise.resolve(null),
        newContent,
        logger: agentRuntimeImpl.logger,
      })

      expect(result.aborted).toBe(false)
      if (result.aborted) {
        throw new Error('Expected success but got aborted')
      }
      const value = result.value
      if ('error' in value) {
        throw new Error(`Expected success but got error: ${value.error}`)
      }
      expect(value.path).toBe('test.ts')
      expect(value.patch).toBeUndefined()
      expect(value.content).toBe(newContent)
    })

    it('should handle Windows line endings with multi-line changes', async () => {
      const oldContent =
        'function hello() {\r\n' +
        '  console.log("Hello, world!");\r\n' +
        '  return "Goodbye";\r\n' +
        '}\r\n'

      const newContent =
        'function hello() {\r\n' +
        '  console.log("Hello, Manicode!");\r\n' +
        '  return "See you later!";\r\n' +
        '}\r\n'

      const result = await processFileBlock({
        path: 'test.ts',
        initialContentPromise: Promise.resolve(oldContent),
        newContent,
        logger: agentRuntimeImpl.logger,
      })

      expect(result.aborted).toBe(false)
      if (result.aborted) {
        throw new Error('Expected success but got aborted')
      }
      const value = result.value
      if ('error' in value) {
        throw new Error(`Expected success but got error: ${value.error}`)
      }

      expect(value.path).toBe('test.ts')
      expect(value.content).toBe(newContent)
      expect(value.patch).toBeUndefined()
    })

    it('should handle empty or whitespace-only changes', async () => {
      const oldContent = 'function test() {\n  return true;\n}\n'
      const newContent = 'function test() {\n  return true;\n}\n'

      const result = await processFileBlock({
        path: 'test.ts',
        initialContentPromise: Promise.resolve(oldContent),
        newContent,
        logger: agentRuntimeImpl.logger,
      })

      expect(result.aborted).toBe(false)
      if (result.aborted) {
        throw new Error('Expected success but got aborted')
      }
      const value = result.value
      expect('error' in value).toBe(true)
      if ('error' in value) {
        expect(value.error).toContain('same as the old content')
      }
    })

    it('[ABI-M05] preserves caller-supplied Windows line endings exactly', async () => {
      const oldContent = 'const x = 1;\r\nconst y = 2;\r\n'
      const newContent = 'const x = 1;\r\nconst z = 3;\r\n'

      const result = await processFileBlock({
        path: 'test.ts',
        initialContentPromise: Promise.resolve(oldContent),
        newContent,
        logger: agentRuntimeImpl.logger,
      })

      expect(result.aborted).toBe(false)
      if (result.aborted) {
        throw new Error('Expected success but got aborted')
      }
      const value = result.value
      if ('error' in value) {
        throw new Error(`Expected success but got error: ${value.error}`)
      }

      // Verify content has Windows line endings
      expect(value.content).toBe(newContent)
      expect(value.content).toContain('\r\n')
      expect(value.content.split('\r\n').length).toBe(3) // 2 lines + empty line

      expect(value.patch).toBeUndefined()
    })

    it('[ABI-M05] treats a line-ending-only overwrite as an exact byte change', async () => {
      const result = await processFileBlock({
        path: 'line-endings.txt',
        initialContentPromise: Promise.resolve('first\nsecond\n'),
        newContent: 'first\r\nsecond\r\n',
        logger: agentRuntimeImpl.logger,
      })

      expect(result.aborted).toBe(false)
      if (result.aborted || 'error' in result.value) {
        throw new Error('Expected line-ending-only overwrite success')
      }
      expect(result.value.content).toBe('first\r\nsecond\r\n')
    })

    it('[ABI-M05] preserves leading newlines and mixed line endings on overwrite', async () => {
      const newContent = '\nfirst\r\nsecond\nthird\r\n'
      const result = await processFileBlock({
        path: 'mixed.txt',
        initialContentPromise: Promise.resolve('old\n'),
        newContent,
        logger: agentRuntimeImpl.logger,
      })

      expect(result.aborted).toBe(false)
      if (result.aborted || 'error' in result.value) {
        throw new Error('Expected exact-content overwrite success')
      }
      expect(result.value.content).toBe(newContent)
      expect(result.value.patch).toBeUndefined()
    })

    it('[ABI-M05] preserves empty content when creating a file', async () => {
      const result = await processFileBlock({
        path: 'empty.txt',
        initialContentPromise: Promise.resolve(null),
        newContent: '',
        logger: agentRuntimeImpl.logger,
      })

      expect(result.aborted).toBe(false)
      if (result.aborted || 'error' in result.value) {
        throw new Error('Expected empty-file creation success')
      }
      expect(result.value.content).toBe('')
    })

    it('[ABI-M05] preserves empty content when overwriting a small file', async () => {
      const result = await processFileBlock({
        path: 'empty.txt',
        initialContentPromise: Promise.resolve('remove me'),
        newContent: '',
        logger: agentRuntimeImpl.logger,
      })

      expect(result.aborted).toBe(false)
      if (result.aborted || 'error' in result.value) {
        throw new Error('Expected empty-file overwrite success')
      }
      expect(result.value.content).toBe('')
    })

    it('should block a large-file overwrite that drastically shrinks the file (truncated-context data loss)', async () => {
      const oldContent =
        Array.from(
          { length: 1_200 },
          (_, index) => `const value${index} = ${index};`,
        ).join('\n') + '\n'
      // Simulates the model only seeing/rewriting a small slice of the file.
      const newContent = 'const value0 = 0;\nconst value1 = 1;\n'

      const result = await processFileBlock({
        path: 'big.ts',
        initialContentPromise: Promise.resolve(oldContent),
        newContent,
        logger: agentRuntimeImpl.logger,
      })

      expect(result.aborted).toBe(false)
      if (result.aborted) {
        throw new Error('Expected success but got aborted')
      }
      const value = result.value
      expect('error' in value).toBe(true)
      if ('error' in value) {
        expect(value.error).toContain('write_file blocked for big.ts')
        expect(value.error).toContain('truncated')
        expect(value.error).toContain('str_replace')
      }
    })

    it('[COR-M09] blocks a large-file overwrite with severe byte shrink only', async () => {
      const oldContent = Array.from({ length: 1_200 }, () =>
        'x'.repeat(100),
      ).join('\n')
      const newContent = Array.from({ length: 1_200 }, () => 'x').join('\n')
      const result = await processFileBlock({
        path: 'byte-shrink.txt',
        initialContentPromise: Promise.resolve(oldContent),
        newContent,
        logger: agentRuntimeImpl.logger,
      })

      expect(result.aborted).toBe(false)
      if (result.aborted) throw new Error('Expected recoverable rejection')
      expect('error' in result.value).toBe(true)
    })

    it('[COR-M09] blocks a large-file overwrite with severe line shrink only', async () => {
      const oldContent = Array.from({ length: 1_200 }, () => 'x').join('\n')
      const newContent = 'x'.repeat(oldContent.length)
      const result = await processFileBlock({
        path: 'line-shrink.txt',
        initialContentPromise: Promise.resolve(oldContent),
        newContent,
        logger: agentRuntimeImpl.logger,
      })

      expect(result.aborted).toBe(false)
      if (result.aborted) throw new Error('Expected recoverable rejection')
      expect('error' in result.value).toBe(true)
    })

    it('should allow a legitimate large-file rewrite that keeps a similar size', async () => {
      const oldContent =
        Array.from(
          { length: 1_200 },
          (_, index) => `const value${index} = ${index};`,
        ).join('\n') + '\n'
      const newContent = oldContent.replace(
        'const value1199 = 1199;',
        'const value1199 = 1200;',
      )

      const result = await processFileBlock({
        path: 'big.ts',
        initialContentPromise: Promise.resolve(oldContent),
        newContent,
        logger: agentRuntimeImpl.logger,
      })

      expect(result.aborted).toBe(false)
      if (result.aborted) {
        throw new Error('Expected success but got aborted')
      }
      const value = result.value
      if ('error' in value) {
        throw new Error(`Expected success but got error: ${value.error}`)
      }
      expect(value.content).toBe(newContent)
    })

    it('should allow shrinking a small file (guard only applies to large files)', async () => {
      const oldContent = 'const a = 1;\nconst b = 2;\nconst c = 3;\n'
      const newContent = 'const a = 1;\n'

      const result = await processFileBlock({
        path: 'small.ts',
        initialContentPromise: Promise.resolve(oldContent),
        newContent,
        logger: agentRuntimeImpl.logger,
      })

      expect(result.aborted).toBe(false)
      if (result.aborted) {
        throw new Error('Expected success but got aborted')
      }
      const value = result.value
      if ('error' in value) {
        throw new Error(`Expected success but got error: ${value.error}`)
      }
      expect(value.content).toBe(newContent)
    })
  })
})
