import { TEST_USER_ID } from '@codebuff/common/old-constants'
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
  beforeAll(() => {
    // Mock database interactions
    mockModule('pg-pool', () => ({
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

    // Mock message saving
    mockModule('@codebuff/backend/llm-apis/message-cost-tracker', () => ({
      saveMessage: () => Promise.resolve(),
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
        ...agentRuntimeImpl,
        path: 'test.ts',
        instructions: undefined,
        initialContentPromise: Promise.resolve(null),
        newContent,
        messages: [],
        fullResponse: '',
        lastUserPrompt: undefined,
        clientSessionId: 'clientSessionId',
        fingerprintId: 'fingerprintId',
        userInputId: 'userInputId',
        userId: TEST_USER_ID,
      })

      expect(result).not.toBeNull()
      if ('error' in result) {
        throw new Error(`Expected success but got error: ${result.error}`)
      }
      expect(result.path).toBe('test.ts')
      expect(result.patch).toBeUndefined()
      expect(result.content).toBe(expectedContent)
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

      agentRuntimeImpl.promptAiSdk = async ({ messages }) => {
        if (typeof messages[0].content !== 'string') {
          throw new Error('Expected string prompt')
        }
        const m = messages[0].content.match(/<update>([\s\S]*)<\/update>/)
        if (!m) {
          return 'Test response'
        }
        return m[1].trim()
      }

      const result = await processFileBlock({
        ...agentRuntimeImpl,
        path: 'test.ts',
        instructions: undefined,
        initialContentPromise: Promise.resolve(oldContent),
        newContent,
        messages: [],
        fullResponse: '',
        lastUserPrompt: undefined,
        clientSessionId: 'clientSessionId',
        fingerprintId: 'fingerprintId',
        userInputId: 'userInputId',
        userId: TEST_USER_ID,
      })

      expect(result).not.toBeNull()
      if ('error' in result) {
        throw new Error(`Expected success but got error: ${result.error}`)
      }

      expect(result.path).toBe('test.ts')
      expect(result.content).toBe(newContent)
      expect(result.patch).toBeDefined()
      if (result.patch) {
        const updatedFile = applyPatch(oldContent, result.patch)
        expect(updatedFile).toBe(newContent)
      }
    })

    it('should handle empty or whitespace-only changes', async () => {
      const oldContent = 'function test() {\n  return true;\n}\n'
      const newContent = 'function test() {\n  return true;\n}\n'

      const result = await processFileBlock({
        ...agentRuntimeImpl,
        path: 'test.ts',
        instructions: undefined,
        initialContentPromise: Promise.resolve(oldContent),
        newContent,
        messages: [],
        fullResponse: '',
        lastUserPrompt: undefined,
        clientSessionId: 'clientSessionId',
        fingerprintId: 'fingerprintId',
        userInputId: 'userInputId',
        userId: TEST_USER_ID,
      })

      expect(result).not.toBeNull()
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('same as the old content')
      }
    })

    it('should preserve Windows line endings in patch and content', async () => {
      const oldContent = 'const x = 1;\r\nconst y = 2;\r\n'
      const newContent = 'const x = 1;\r\nconst z = 3;\r\n'

      agentRuntimeImpl.promptAiSdk = async ({ messages }) => {
        if (typeof messages[0].content !== 'string') {
          throw new Error('Expected string prompt')
        }
        const m = messages[0].content.match(/<update>([\s\S]*)<\/update>/)
        if (!m) {
          return 'Test response'
        }
        return m[1].trim()
      }

      const result = await processFileBlock({
        ...agentRuntimeImpl,
        path: 'test.ts',
        instructions: undefined,
        initialContentPromise: Promise.resolve(oldContent),
        newContent,
        messages: [],
        fullResponse: '',
        lastUserPrompt: undefined,
        clientSessionId: 'clientSessionId',
        fingerprintId: 'fingerprintId',
        userInputId: 'userInputId',
        userId: TEST_USER_ID,
      })

      expect(result).not.toBeNull()
      if ('error' in result) {
        throw new Error(`Expected success but got error: ${result.error}`)
      }

      // Verify content has Windows line endings
      expect(result.content).toBe(newContent)
      expect(result.content).toContain('\r\n')
      expect(result.content.split('\r\n').length).toBe(3) // 2 lines + empty line

      // Verify patch has Windows line endings
      expect(result.patch).toBeDefined()
      if (result.patch) {
        expect(result.patch).toContain('\r\n')
        const updatedFile = applyPatch(oldContent, result.patch)
        expect(updatedFile).toBe(newContent)

        // Verify patch can be applied and preserves line endings
        const patchLines = result.patch.split('\r\n')
        expect(patchLines.some((line) => line.startsWith('-const y'))).toBe(
          true,
        )
        expect(patchLines.some((line) => line.startsWith('+const z'))).toBe(
          true,
        )
      }
    })

    it('should return error when creating new file with lazy edit', async () => {
      const newContent =
        '// ... existing code ...\nconst x = 1;\n// ... existing code ...'

      const result = await processFileBlock({
        ...agentRuntimeImpl,
        path: 'test.ts',
        instructions: undefined,
        initialContentPromise: Promise.resolve(null),
        newContent,
        messages: [],
        fullResponse: '',
        lastUserPrompt: undefined,
        clientSessionId: 'clientSessionId',
        fingerprintId: 'fingerprintId',
        userInputId: 'userInputId',
        userId: TEST_USER_ID,
      })

      expect(result).not.toBeNull()
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('placeholder comment')
        expect(result.error).toContain('meant to modify an existing file')
      }
    })
  })
})
