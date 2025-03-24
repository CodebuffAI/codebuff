import { expect, describe, it } from 'bun:test'
import { checkNewFilesNecessary } from '../find-files/check-new-files-necessary'
import { System } from '@/llm-apis/claude'
import { CostMode } from 'common/constants'

describe('checkNewFilesNecessary', () => {
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
      const messages: any[] = []
      const previousFiles: string[] = []
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
      const messages = [
        { role: 'user' as const, content: 'First message' },
        { role: 'assistant' as const, content: 'First response' },
        { role: 'user' as const, content: 'Can you explain that again?' },
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
      const messages = [{ role: 'user' as const, content: 'First message' }]
      const userPrompt = 'Run git diff against the latest commit'

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
    'should return true for new feature requests',
    async () => {
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
})
