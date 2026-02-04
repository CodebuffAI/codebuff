import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { promptAborted, promptSuccess } from '@codebuff/common/util/error'
import { cleanMarkdownCodeBlock } from '@codebuff/common/util/file'
import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { applyPatch } from 'diff'

import { handleLargeFile, processFileBlock } from '../process-file-block'
import * as tokenCounter from '../util/token-counter'

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
        ...agentRuntimeImpl,
        runId: 'test-run-id',
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
        signal: new AbortController().signal,
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

      agentRuntimeImpl.promptAiSdk = async ({ messages }) => {
        if (messages[0].content[0].type !== 'text') {
          throw new Error('Expected text prompt')
        }
        const m = messages[0].content[0].text.match(
          /<update>([\s\S]*)<\/update>/,
        )
        if (!m) {
          return promptSuccess('Test response')
        }
        return promptSuccess(m[1].trim())
      }

      const result = await processFileBlock({
        ...agentRuntimeImpl,
        runId: 'test-run-id',
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
        signal: new AbortController().signal,
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
        ...agentRuntimeImpl,
        runId: 'test-run-id',
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
        signal: new AbortController().signal,
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

      agentRuntimeImpl.promptAiSdk = async ({ messages }) => {
        if (messages[0].content[0].type !== 'text') {
          throw new Error('Expected text prompt')
        }
        const m = messages[0].content[0].text.match(
          /<update>([\s\S]*)<\/update>/,
        )
        if (!m) {
          return promptSuccess('Test response')
        }
        return promptSuccess(m[1].trim())
      }

      const result = await processFileBlock({
        ...agentRuntimeImpl,
        runId: 'test-run-id',
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
        signal: new AbortController().signal,
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

    it('should return error when creating new file with lazy edit', async () => {
      const newContent =
        '// ... existing code ...\nconst x = 1;\n// ... existing code ...'

      const result = await processFileBlock({
        ...agentRuntimeImpl,
        runId: 'test-run-id',
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
        signal: new AbortController().signal,
      })

      expect(result.aborted).toBe(false)
      if (result.aborted) {
        throw new Error('Expected success but got aborted')
      }
      const value = result.value
      expect('error' in value).toBe(true)
      if ('error' in value) {
        expect(value.error).toContain('placeholder comment')
        expect(value.error).toContain('meant to modify an existing file')
      }
    })
  })

  describe('handleLargeFile', () => {
    it('should return aborted when promptAiSdk returns aborted', async () => {
      agentRuntimeImpl.promptAiSdk = async () => promptAborted('User cancelled')

      const result = await handleLargeFile({
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        oldContent: 'const x = 1;\nconst y = 2;\nconst z = 3;\n',
        editSnippet: '// ... existing code ...\nconst y = 999;\n// ... existing code ...',
        filePath: 'test.ts',
        clientSessionId: 'clientSessionId',
        fingerprintId: 'fingerprintId',
        userInputId: 'userInputId',
        userId: TEST_USER_ID,
        signal: new AbortController().signal,
      })

      expect(result.aborted).toBe(true)
      if (result.aborted) {
        expect(result.reason).toBe('User cancelled')
      }
    })

    it('should return aborted when promptAiSdk returns aborted without reason', async () => {
      agentRuntimeImpl.promptAiSdk = async () => promptAborted()

      const result = await handleLargeFile({
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        oldContent: 'function foo() {\n  return 1;\n}\n',
        editSnippet: '// ... existing code ...\n  return 42;\n// ... existing code ...',
        filePath: 'large-file.ts',
        clientSessionId: 'clientSessionId',
        fingerprintId: 'fingerprintId',
        userInputId: 'userInputId',
        userId: TEST_USER_ID,
        signal: new AbortController().signal,
      })

      expect(result.aborted).toBe(true)
    })

    it('should return editSnippet directly when no lazy edit markers present', async () => {
      // When there's no lazy edit, handleLargeFile returns the editSnippet directly
      // without calling promptAiSdk
      const mockPromptAiSdk = async () => {
        throw new Error('Should not be called')
      }
      agentRuntimeImpl.promptAiSdk = mockPromptAiSdk

      const editSnippet = 'const x = 100;\nconst y = 200;\n'
      const result = await handleLargeFile({
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        oldContent: 'const x = 1;\nconst y = 2;\n',
        editSnippet,
        filePath: 'test.ts',
        clientSessionId: 'clientSessionId',
        fingerprintId: 'fingerprintId',
        userInputId: 'userInputId',
        userId: TEST_USER_ID,
        signal: new AbortController().signal,
      })

      // Should return success with the editSnippet directly without calling LLM
      expect(result.aborted).toBe(false)
      if (!result.aborted) {
        expect(result.value).toBe(editSnippet)
      }
    })
  })

  describe('processFileBlock abort propagation', () => {
    it('should propagate abort from handleLargeFile for large files', async () => {
      // Mock countTokens to return a value > LARGE_FILE_TOKEN_LIMIT (64000)
      // This forces processFileBlock to use the large file path
      const countTokensSpy = spyOn(tokenCounter, 'countTokens').mockReturnValue(100000)

      // Mock promptAiSdk to return aborted
      agentRuntimeImpl.promptAiSdk = async () => promptAborted('User cancelled during large file edit')

      const oldContent = 'const x = 1;\nconst y = 2;\n'
      // Edit snippet with lazy edit markers triggers the LLM call in handleLargeFile
      const newContent = '// ... existing code ...\nconst y = 999;\n// ... existing code ...'

      const result = await processFileBlock({
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        path: 'large-file.ts',
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
        signal: new AbortController().signal,
      })

      expect(result.aborted).toBe(true)
      if (result.aborted) {
        expect(result.reason).toBe('User cancelled during large file edit')
      }

      // Verify countTokens was called to trigger the large file path
      expect(countTokensSpy).toHaveBeenCalled()
      countTokensSpy.mockRestore()
    })

    it('should propagate abort from handleLargeFile without reason', async () => {
      // Mock countTokens to return a value > LARGE_FILE_TOKEN_LIMIT (64000)
      const countTokensSpy = spyOn(tokenCounter, 'countTokens').mockReturnValue(100000)

      // Mock promptAiSdk to return aborted without a reason
      agentRuntimeImpl.promptAiSdk = async () => promptAborted()

      const oldContent = 'function foo() {\n  return 1;\n}\n'
      const newContent = '// ... existing code ...\n  return 42;\n// ... existing code ...'

      const result = await processFileBlock({
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        path: 'another-large-file.ts',
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
        signal: new AbortController().signal,
      })

      expect(result.aborted).toBe(true)
      countTokensSpy.mockRestore()
    })
  })
})
