import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { cleanMarkdownCodeBlock } from '@codebuff/common/util/file'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { applyPatch } from 'diff'

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
    it('should handle markdown code blocks when creating new files', async () => {
      const newContent =
        '```typescript\nfunction test() {\n  return true;\n}\n```'
      const expectedContent = 'function test() {\n  return true;\n}'

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
      expect(value.content).toBe(expectedContent)
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
      expect(value.patch).toBeDefined()
      if (value.patch) {
        const updatedFile = applyPatch(oldContent, value.patch)
        expect(updatedFile).toBe(newContent)
      }
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

    it('should preserve Windows line endings in patch and content', async () => {
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

      // Verify patch has Windows line endings
      expect(value.patch).toBeDefined()
      if (value.patch) {
        expect(value.patch).toContain('\r\n')
        const updatedFile = applyPatch(oldContent, value.patch)
        expect(updatedFile).toBe(newContent)

        // Verify patch can be applied and preserves line endings
        const patchLines = value.patch.split('\r\n')
        expect(patchLines.some((line) => line.startsWith('-const y'))).toBe(
          true,
        )
        expect(patchLines.some((line) => line.startsWith('+const z'))).toBe(
          true,
        )
      }
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

    it('should allow a legitimate large-file rewrite that keeps a similar size', async () => {
      const oldContent =
        Array.from(
          { length: 1_200 },
          (_, index) => `const value${index} = ${index};`,
        ).join('\n') + '\n'
      const newContent =
        Array.from(
          { length: 1_200 },
          (_, index) => `const value${index} = ${index + 1};`,
        ).join('\n') + '\n'

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
