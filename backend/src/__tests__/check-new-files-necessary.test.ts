import { describe, expect, it, spyOn, beforeEach, afterEach, mock } from 'bun:test'
import { CostMode } from '@codebuff/common/constants'
import * as gemini from '@/llm-apis/gemini-with-fallbacks'

import { checkNewFilesNecessary } from '../find-files/check-new-files-necessary'

import { System } from '@/llm-apis/claude'

// Mock environment variables before other imports
mock.module('@t3-oss/env-core', () => ({
  createEnv: () => ({
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  }),
}))

describe('checkNewFilesNecessary', () => {
  let promptFlashSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    promptFlashSpy = spyOn(gemini, 'promptFlashWithFallbacks')
  })

  afterEach(() => {
    promptFlashSpy.mockRestore()
  })

  const mockSystem: System = 'You are a helpful assistant.'

  const defaultParams = {
    clientSessionId: 'test-session',
    fingerprintId: 'test-fingerprint',
    userInputId: 'test-input',
    userId: undefined,
    costMode: 'normal' as CostMode,
  }

  const TEST_TIMEOUT = 10000

  it(
    'should return true for first message in conversation',
    async () => {
      promptFlashSpy.mockResolvedValue('YES')
      const messages: any[] = []
      const userPrompt = 'Help me understand the codebase'

      const result = await checkNewFilesNecessary(
        messages,
        mockSystem,
        defaultParams.clientSessionId,
        defaultParams.fingerprintId,
        defaultParams.userInputId,
        userPrompt,
        defaultParams.userId,
        defaultParams.costMode
      )

      expect(result.newFilesNecessary).toBe(true)
      expect(result.response.toUpperCase()).toMatch(/YES/)
      expect(typeof result.duration).toBe('number')
      expect(result.duration).toBeGreaterThan(0)
    },
    TEST_TIMEOUT
  )

  it(
    'should return false for follow-up messages',
    async () => {
      promptFlashSpy.mockResolvedValue('NO')
      const messages = [
        { role: 'user' as const, content: 'Explain the file1' },
        {
          role: 'assistant' as const,
          content: '<read_files>src/file1.ts</read_files>',
        },
        {
          role: 'user' as const,
          content: `<read_files_result><read_file>
<path>src/file1.ts</path>
<content>console.log('Hello, world!');
</content>
</read_file></read_files_result>`,
        },
        {
          role: 'assistant' as const,
          content: 'It is a file that logs "Hello, world!"',
        },
      ]
      const userPrompt = 'Can you explain that again?'

      const result = await checkNewFilesNecessary(
        messages,
        mockSystem,
        defaultParams.clientSessionId,
        defaultParams.fingerprintId,
        defaultParams.userInputId,
        userPrompt,
        defaultParams.userId,
        defaultParams.costMode
      )

      expect(result.newFilesNecessary).toBe(false)
      expect(result.response.toUpperCase()).toMatch(/NO/)
      expect(typeof result.duration).toBe('number')
      expect(result.duration).toBeGreaterThan(0)
    },
    TEST_TIMEOUT
  )

  it(
    'should return false for simple terminal commands',
    async () => {
      promptFlashSpy.mockResolvedValue('NO')
      const userPrompt = 'Run npm build'

      const result = await checkNewFilesNecessary(
        [],
        mockSystem,
        defaultParams.clientSessionId,
        defaultParams.fingerprintId,
        defaultParams.userInputId,
        userPrompt,
        defaultParams.userId,
        defaultParams.costMode
      )

      expect(result.newFilesNecessary).toBe(false)
      expect(result.response.toUpperCase()).toMatch(/NO/)
      expect(typeof result.duration).toBe('number')
      expect(result.duration).toBeGreaterThan(0)
    },
    TEST_TIMEOUT
  )

  it(
    'should return true for new feature requests',
    async () => {
      promptFlashSpy.mockResolvedValue('YES')
      const messages = [{ role: 'user' as const, content: 'First message' }]
      const userPrompt = 'Add a new authentication feature'

      const result = await checkNewFilesNecessary(
        messages,
        mockSystem,
        defaultParams.clientSessionId,
        defaultParams.fingerprintId,
        defaultParams.userInputId,
        userPrompt,
        defaultParams.userId,
        defaultParams.costMode
      )

      expect(result.newFilesNecessary).toBe(true)
      expect(result.response.toUpperCase()).toMatch(/YES/)
      expect(typeof result.duration).toBe('number')
      expect(result.duration).toBeGreaterThan(0)
    },
    TEST_TIMEOUT
  )

  it(
    'should return true when editing one loaded file',
    async () => {
      promptFlashSpy.mockResolvedValue('YES')
      const messages = [{ role: 'user' as const, content: 'First message' }]
      const userPrompt = 'Edit src/file1.ts to fix the bug'

      const result = await checkNewFilesNecessary(
        messages,
        mockSystem,
        defaultParams.clientSessionId,
        defaultParams.fingerprintId,
        defaultParams.userInputId,
        userPrompt,
        defaultParams.userId,
        defaultParams.costMode
      )

      expect(result.newFilesNecessary).toBe(true)
      expect(result.response.toUpperCase()).toMatch(/YES/)
      expect(typeof result.duration).toBe('number')
      expect(result.duration).toBeGreaterThan(0)
    },
    TEST_TIMEOUT
  )

  it(
    'should return true for a prompt at the start of a conversation (with user instructions)',
    async () => {
      promptFlashSpy.mockResolvedValue('YES')
      const userPrompt = `Fix the following issue. Keep going until you have completely fixed the issue. Do not ask me any follow-up questions, just do your best to i
        nterpret the intent of the issue.\n\n-----\n\nCan you add a console.log statement to components/like-button.ts with all the props?`

      const result = await checkNewFilesNecessary(
        [],
        mockSystem,
        defaultParams.clientSessionId,
        defaultParams.fingerprintId,
        defaultParams.userInputId,
        userPrompt,
        defaultParams.userId,
        defaultParams.costMode
      )

      expect(result.newFilesNecessary).toBe(true)
    },
    TEST_TIMEOUT
  )
})
