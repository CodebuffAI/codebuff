import * as fs from 'fs'
import path from 'path'

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test'

import * as projectFiles from '../../project-files'
import { handleInitializationFlowLocally } from '../init'

import type { ChatMessage } from '../../types/chat'

/** Helper to extract text content from ChatMessages returned by getSystemMessage */
const getMessageText = (messages: ChatMessage[]): string => {
  return messages
    .map((m) => {
      // ChatMessage has content as a string, not an array
      if (typeof m.content === 'string') {
        return m.content
      }
      return ''
    })
    .join('')
}

describe('handleInitializationFlowLocally', () => {
  const TEST_PROJECT_ROOT = '/test/project'
  const KNOWLEDGE_FILE_NAME = 'knowledge.md'

  let existsSyncSpy: ReturnType<typeof spyOn>
  let writeFileSyncSpy: ReturnType<typeof spyOn>
  let mkdirSyncSpy: ReturnType<typeof spyOn>
  let linkSyncSpy: ReturnType<typeof spyOn>
  let getProjectRootSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    // Mock getProjectRoot
    getProjectRootSpy = spyOn(projectFiles, 'getProjectRoot').mockReturnValue(
      TEST_PROJECT_ROOT,
    )

    // Mock fs functions
    existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false)
    writeFileSyncSpy = spyOn(fs, 'writeFileSync').mockImplementation(() => {})
    mkdirSyncSpy = spyOn(fs, 'mkdirSync').mockImplementation(() => undefined)
    linkSyncSpy = spyOn(fs, 'linkSync').mockImplementation(() => {})
    spyOn(fs, 'unlinkSync').mockImplementation(() => {})
    spyOn(fs, 'rmdirSync').mockImplementation(() => {})
  })

  afterEach(() => {
    mock.restore()
  })

  describe('knowledge file creation', () => {
    test('creates knowledge.md when it does not exist', () => {
      existsSyncSpy.mockImplementation((_p: string) => false)

      const { postUserMessage } = handleInitializationFlowLocally()

      expect(writeFileSyncSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          path.join(TEST_PROJECT_ROOT, `${KNOWLEDGE_FILE_NAME}.`),
        ),
        expect.stringContaining('# Project knowledge'),
        { flag: 'wx' },
      )
      expect(linkSyncSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${KNOWLEDGE_FILE_NAME}.`),
        path.join(TEST_PROJECT_ROOT, KNOWLEDGE_FILE_NAME),
      )

      // Check message indicates creation
      const messages = postUserMessage([])
      expect(messages.length).toBeGreaterThan(0)
      expect(getMessageText(messages)).toContain('✅ Created `knowledge.md`')
    })

    test('skips knowledge.md creation when it already exists', () => {
      existsSyncSpy.mockImplementation(
        (p: unknown) => p === path.join(TEST_PROJECT_ROOT, KNOWLEDGE_FILE_NAME),
      )

      const { postUserMessage } = handleInitializationFlowLocally()

      // writeFileSync should not be called for knowledge.md
      const knowledgeWriteCalls = writeFileSyncSpy.mock.calls.filter(
        (call: unknown[]) =>
          call[0] === path.join(TEST_PROJECT_ROOT, KNOWLEDGE_FILE_NAME),
      )
      expect(knowledgeWriteCalls.length).toBe(0)

      // Check message indicates file already exists
      const messages = postUserMessage([])
      expect(getMessageText(messages)).toContain(
        '📋 `knowledge.md` already exists',
      )
    })
  })

  describe('.agents directory creation', () => {
    test('creates .agents directory when it does not exist', () => {
      existsSyncSpy.mockReturnValue(false)

      const { postUserMessage } = handleInitializationFlowLocally()

      expect(mkdirSyncSpy).toHaveBeenCalledWith(
        path.join(TEST_PROJECT_ROOT, '.agents'),
        { recursive: true },
      )

      const messages = postUserMessage([])
      expect(getMessageText(messages)).toContain('✅ Created `.agents/`')
    })

    test('skips .agents directory creation when it already exists', () => {
      existsSyncSpy.mockImplementation(
        (p: unknown) => p === path.join(TEST_PROJECT_ROOT, '.agents'),
      )

      const { postUserMessage } = handleInitializationFlowLocally()

      // mkdirSync should not be called for .agents directory
      const agentsDirCalls = mkdirSyncSpy.mock.calls.filter(
        (call: unknown[]) =>
          call[0] === path.join(TEST_PROJECT_ROOT, '.agents'),
      )
      expect(agentsDirCalls.length).toBe(0)

      const messages = postUserMessage([])
      expect(getMessageText(messages)).toContain('📋 `.agents/` already exists')
    })
  })

  describe('.agents/types directory creation', () => {
    test('creates .agents/types directory when it does not exist', () => {
      existsSyncSpy.mockReturnValue(false)

      const { postUserMessage } = handleInitializationFlowLocally()

      expect(mkdirSyncSpy).toHaveBeenCalledWith(
        path.join(TEST_PROJECT_ROOT, '.agents', 'types'),
        { recursive: true },
      )

      const messages = postUserMessage([])
      expect(getMessageText(messages)).toContain('✅ Created `.agents/types/`')
    })

    test('skips .agents/types directory creation when it already exists', () => {
      existsSyncSpy.mockImplementation((p: unknown) => {
        // .agents exists, .agents/types exists
        return (
          p === path.join(TEST_PROJECT_ROOT, '.agents') ||
          p === path.join(TEST_PROJECT_ROOT, '.agents', 'types')
        )
      })

      const { postUserMessage } = handleInitializationFlowLocally()

      // mkdirSync should not be called for .agents/types directory
      const typesDirCalls = mkdirSyncSpy.mock.calls.filter(
        (call: unknown[]) =>
          call[0] === path.join(TEST_PROJECT_ROOT, '.agents', 'types'),
      )
      expect(typesDirCalls.length).toBe(0)

      const messages = postUserMessage([])
      expect(getMessageText(messages)).toContain(
        '📋 `.agents/types/` already exists',
      )
    })
  })

  describe('type file copying', () => {
    test('copies type files when they do not exist', () => {
      existsSyncSpy.mockReturnValue(false)

      const { postUserMessage } = handleInitializationFlowLocally()

      // Check that writeFileSync was called for type files
      const typeFiles = ['agent-definition.ts', 'tools.ts', 'util-types.ts']
      for (const fileName of typeFiles) {
        const fileCalls = writeFileSyncSpy.mock.calls.filter(
          (call: unknown[]) => (call[0] as string).includes(`${fileName}.`),
        )
        expect(fileCalls.length).toBe(1)
      }

      const messages = postUserMessage([])
      const messageContent = getMessageText(messages)

      // Should have success messages for copied files
      expect(messageContent).toContain('`.agents/types/agent-definition.ts`')
      expect(messageContent).toContain('`.agents/types/tools.ts`')
      expect(messageContent).toContain('`.agents/types/util-types.ts`')
    })

    test('skips type files that already exist', () => {
      const typesDir = path.join(TEST_PROJECT_ROOT, '.agents', 'types')
      existsSyncSpy.mockImplementation((p: unknown) => {
        // Only agent-definition.ts exists
        return p === path.join(typesDir, 'agent-definition.ts')
      })

      const { postUserMessage } = handleInitializationFlowLocally()

      // agent-definition.ts should NOT be written
      const agentDefCalls = writeFileSyncSpy.mock.calls.filter(
        (call: unknown[]) =>
          (call[0] as string).includes('agent-definition.ts.'),
      )
      expect(agentDefCalls.length).toBe(0)

      // tools.ts and util-types.ts should be written
      const toolsCalls = writeFileSyncSpy.mock.calls.filter((call: unknown[]) =>
        (call[0] as string).includes('tools.ts.'),
      )
      expect(toolsCalls.length).toBe(1)

      const utilTypesCalls = writeFileSyncSpy.mock.calls.filter(
        (call: unknown[]) => (call[0] as string).includes('util-types.ts.'),
      )
      expect(utilTypesCalls.length).toBe(1)

      const messages = postUserMessage([])
      expect(getMessageText(messages)).toContain(
        '📋 `.agents/types/agent-definition.ts` already exists',
      )
    })
  })

  describe('message accumulation', () => {
    test('returns multiple messages for all operations', () => {
      existsSyncSpy.mockReturnValue(false)

      const { postUserMessage } = handleInitializationFlowLocally()

      const messages = postUserMessage([])

      // Should have messages for:
      // 1. knowledge.md creation
      // 2. .agents/ creation
      // 3. .agents/types/ creation
      // 4-6. Three type file copies
      expect(messages.length).toBeGreaterThanOrEqual(6)
    })

    test('preserves previous messages in postUserMessage', () => {
      existsSyncSpy.mockReturnValue(false)

      const { postUserMessage } = handleInitializationFlowLocally()

      // ChatMessage has content as a string, not an array
      const previousMessages: ChatMessage[] = [
        {
          id: 'user-123',
          variant: 'user',
          content: 'Previous message',
          timestamp: '2024-01-01T00:00:00Z',
        },
      ]

      const messages = postUserMessage(previousMessages)

      // First message should be the previous one
      expect(messages[0]).toEqual(previousMessages[0])
      // Should have additional messages
      expect(messages.length).toBeGreaterThan(1)
    })
  })

  describe('error handling', () => {
    test('rolls back and reports write errors for type files', () => {
      existsSyncSpy.mockReturnValue(false)
      writeFileSyncSpy.mockImplementation((p: unknown) => {
        if ((p as string).includes('tools.ts.')) {
          throw new Error('Permission denied')
        }
      })

      const { postUserMessage } = handleInitializationFlowLocally()

      const messages = postUserMessage([])
      const messageContent = getMessageText(messages)

      expect(messageContent).toContain('Initialization failed')
      expect(messageContent).toContain('Permission denied')
      expect(linkSyncSpy).toHaveBeenCalled()
    })

    test('handles writeFileSync errors for knowledge.md gracefully', () => {
      existsSyncSpy.mockReturnValue(false)
      writeFileSyncSpy.mockImplementation((p: unknown) => {
        if ((p as string).includes(`${KNOWLEDGE_FILE_NAME}.`)) {
          throw new Error('Disk full')
        }
      })

      const messages = handleInitializationFlowLocally().postUserMessage([])
      expect(getMessageText(messages)).toContain('Disk full')
      expect(getMessageText(messages)).toContain('run `/init` again')
    })

    test('handles mkdirSync errors for .agents directory gracefully', () => {
      existsSyncSpy.mockReturnValue(false)
      mkdirSyncSpy.mockImplementation((p: unknown) => {
        if ((p as string).endsWith('.agents')) {
          throw new Error('Cannot create directory')
        }
        return undefined
      })

      const messages = handleInitializationFlowLocally().postUserMessage([])
      expect(getMessageText(messages)).toContain('Cannot create directory')
    })

    test('handles mkdirSync errors for .agents/types directory gracefully', () => {
      existsSyncSpy.mockImplementation((p: unknown) => {
        // .agents exists but .agents/types doesn't
        return p === path.join(TEST_PROJECT_ROOT, '.agents')
      })
      mkdirSyncSpy.mockImplementation((p: unknown) => {
        if ((p as string).endsWith('types')) {
          throw new Error('Permission denied for types dir')
        }
        return undefined
      })

      const messages = handleInitializationFlowLocally().postUserMessage([])
      expect(getMessageText(messages)).toContain(
        'Permission denied for types dir',
      )
    })

    test('does not continue after a type file failure', () => {
      existsSyncSpy.mockReturnValue(false)
      writeFileSyncSpy.mockImplementation((p: unknown) => {
        // Only fail for agent-definition.ts
        if ((p as string).includes('agent-definition.ts.')) {
          throw new Error('File locked')
        }
      })

      const { postUserMessage } = handleInitializationFlowLocally()
      const messages = postUserMessage([])
      const messageContent = getMessageText(messages)

      expect(messageContent).toContain('Initialization failed')
      expect(messageContent).toContain('File locked')
      expect(messageContent).not.toContain('✅ Copied `.agents/types/tools.ts`')
    })

    test('handles non-Error exceptions in type file copying', () => {
      existsSyncSpy.mockReturnValue(false)
      writeFileSyncSpy.mockImplementation((p: unknown) => {
        if ((p as string).includes('util-types.ts.')) {
          // Throw a non-Error value
          throw 'string error'
        }
      })

      const { postUserMessage } = handleInitializationFlowLocally()
      const messages = postUserMessage([])
      const messageContent = getMessageText(messages)

      expect(messageContent).toContain('Initialization failed')
      expect(messageContent).toContain('string error')
    })

    test('handles null/undefined exceptions in type file copying', () => {
      existsSyncSpy.mockReturnValue(false)
      writeFileSyncSpy.mockImplementation((p: unknown) => {
        if ((p as string).includes('tools.ts.')) {
          // Throw null
          throw null
        }
      })

      const { postUserMessage } = handleInitializationFlowLocally()
      const messages = postUserMessage([])
      const messageContent = getMessageText(messages)

      expect(messageContent).toContain('Initialization failed')
      expect(messageContent).toContain('Unknown')
    })
  })

  describe('integration scenarios', () => {
    test('handles partial initialization state correctly', () => {
      const agentsDir = path.join(TEST_PROJECT_ROOT, '.agents')
      const typesDir = path.join(agentsDir, 'types')

      // Scenario: knowledge.md exists, .agents exists, but .agents/types and type files don't exist
      existsSyncSpy.mockImplementation((p: unknown) => {
        return (
          p === path.join(TEST_PROJECT_ROOT, KNOWLEDGE_FILE_NAME) ||
          p === agentsDir
        )
      })

      const { postUserMessage } = handleInitializationFlowLocally()

      // Should NOT create knowledge.md
      const knowledgeWriteCalls = writeFileSyncSpy.mock.calls.filter(
        (call: unknown[]) =>
          call[0] === path.join(TEST_PROJECT_ROOT, KNOWLEDGE_FILE_NAME),
      )
      expect(knowledgeWriteCalls.length).toBe(0)

      // Should NOT create .agents directory
      const agentsDirCalls = mkdirSyncSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === agentsDir,
      )
      expect(agentsDirCalls.length).toBe(0)

      // Should create .agents/types directory
      const typesDirCalls = mkdirSyncSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === typesDir,
      )
      expect(typesDirCalls.length).toBe(1)

      // Should copy type files
      const typeFileCalls = writeFileSyncSpy.mock.calls.filter(
        (call: unknown[]) => (call[0] as string).startsWith(typesDir),
      )
      expect(typeFileCalls.length).toBe(3)

      const messages = postUserMessage([])
      const messageContent = getMessageText(messages)

      expect(messageContent).toContain('📋 `knowledge.md` already exists')
      expect(messageContent).toContain('📋 `.agents/` already exists')
      expect(messageContent).toContain('✅ Created `.agents/types/`')
    })

    test('handles fully initialized project correctly', () => {
      // Everything exists
      existsSyncSpy.mockReturnValue(true)

      const { postUserMessage } = handleInitializationFlowLocally()

      // Nothing should be created
      expect(writeFileSyncSpy).not.toHaveBeenCalled()
      expect(mkdirSyncSpy).not.toHaveBeenCalled()

      const messages = postUserMessage([])
      const messageContent = getMessageText(messages)

      // All messages should indicate existing files
      expect(messageContent).toContain('📋 `knowledge.md` already exists')
      expect(messageContent).toContain('📋 `.agents/` already exists')
      expect(messageContent).toContain('📋 `.agents/types/` already exists')
      expect(messageContent).toContain(
        '📋 `.agents/types/agent-definition.ts` already exists',
      )
      expect(messageContent).toContain(
        '📋 `.agents/types/tools.ts` already exists',
      )
      expect(messageContent).toContain(
        '📋 `.agents/types/util-types.ts` already exists',
      )
    })
  })
})
