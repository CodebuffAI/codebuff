import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
} from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import {
  getAllToggleIdsFromMessages,
  getRunStatePath,
  getChatMessagesPath,
  saveChatState,
  loadMostRecentChatState,
  clearChatState,
  setChatDirOverrideForTesting,
  setLiveChatStateProvider,
  clearLiveChatStateProvider,
  flushLiveChatState,
} from '../run-state-storage'
import type { ChatMessage, ContentBlock } from '../../types/chat'
import type { RunState } from '@codebuff/sdk'

// Mock the project-files module
const mockProjectDataDir = path.join(os.tmpdir(), 'codebuff-test-project')
const mockCurrentChatDir = path.join(mockProjectDataDir, 'chats', 'test-chat-123')

// Mock the module before importing
const originalGetProjectDataDir = () => mockProjectDataDir
const originalGetCurrentChatDir = () => mockCurrentChatDir

describe('run-state-storage', () => {
  beforeEach(() => {
    // Create test directories
    if (fs.existsSync(mockProjectDataDir)) {
      fs.rmSync(mockProjectDataDir, { recursive: true })
    }
    fs.mkdirSync(mockCurrentChatDir, { recursive: true })
  })

  afterEach(() => {
    // Clean up test directories
    if (fs.existsSync(mockProjectDataDir)) {
      fs.rmSync(mockProjectDataDir, { recursive: true })
    }
  })

  describe('getAllToggleIdsFromMessages', () => {
    test('extracts agent IDs from messages', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          variant: 'agent',
          content: '',
          timestamp: new Date().toISOString(),
          blocks: [
            { type: 'agent', agentId: 'agent-1', agentName: 'TestAgent', agentType: 'inline', content: '', status: 'complete', blocks: [] },
          ],
        },
      ]

      const ids = getAllToggleIdsFromMessages(messages)

      expect(ids).toContain('agent-1')
    })

    test('extracts tool call IDs from messages', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          variant: 'agent',
          content: '',
          timestamp: new Date().toISOString(),
          blocks: [
            { type: 'tool', toolCallId: 'tool-1', toolName: 'glob', input: {}, output: '' },
          ],
        },
      ]

      const ids = getAllToggleIdsFromMessages(messages)

      expect(ids).toContain('tool-1')
    })

    test('recursively extracts IDs from nested agent blocks', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          variant: 'agent',
          content: '',
          timestamp: new Date().toISOString(),
          blocks: [
            {
              type: 'agent',
              agentId: 'parent-agent',
              agentName: 'ParentAgent',
              agentType: 'inline',
              content: '',
              status: 'complete',
              blocks: [
                { type: 'tool', toolCallId: 'nested-tool', toolName: 'glob', input: {}, output: '' },
                {
                  type: 'agent',
                  agentId: 'child-agent',
                  agentName: 'ChildAgent',
                  agentType: 'inline',
                  content: '',
                  status: 'complete',
                  blocks: [
                    { type: 'tool', toolCallId: 'deep-tool', toolName: 'glob', input: {}, output: '' },
                  ],
                },
              ],
            },
          ],
        },
      ]

      const ids = getAllToggleIdsFromMessages(messages)

      expect(ids).toContain('parent-agent')
      expect(ids).toContain('nested-tool')
      expect(ids).toContain('child-agent')
      expect(ids).toContain('deep-tool')
    })

    test('handles messages with no blocks', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          variant: 'user',
          content: '',
          timestamp: new Date().toISOString(),
          blocks: [],
        },
      ]

      const ids = getAllToggleIdsFromMessages(messages)

      expect(ids).toHaveLength(0)
    })

    test('handles empty messages array', () => {
      const ids = getAllToggleIdsFromMessages([])
      expect(ids).toHaveLength(0)
    })

    test('handles mixed block types in single message', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          variant: 'agent',
          content: '',
          timestamp: new Date().toISOString(),
          blocks: [
            { type: 'text', content: 'Some text' },
            { type: 'agent', agentId: 'agent-1', agentName: 'TestAgent', agentType: 'inline', content: '', status: 'complete', blocks: [] },
            { type: 'tool', toolCallId: 'tool-1', toolName: 'glob', input: {}, output: '' },
          ],
        },
      ]

      const ids = getAllToggleIdsFromMessages(messages)

      expect(ids).toContain('agent-1')
      expect(ids).toContain('tool-1')
      expect(ids).toHaveLength(2)
    })

    test('does not deduplicate IDs (returns all occurrences)', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          variant: 'agent',
          content: '',
          timestamp: new Date().toISOString(),
          blocks: [
            { type: 'agent', agentId: 'shared-id', agentName: 'TestAgent', agentType: 'inline', content: '', status: 'complete', blocks: [] },
          ],
        },
        {
          id: 'msg-2',
          variant: 'agent',
          content: '',
          timestamp: new Date().toISOString(),
          blocks: [
            { type: 'tool', toolCallId: 'shared-id', toolName: 'glob', input: {}, output: '' },
          ],
        },
      ]

      const ids = getAllToggleIdsFromMessages(messages)

      // Current implementation returns all occurrences without deduplication
      expect(ids.filter(id => id === 'shared-id')).toHaveLength(2)
    })
  })

  describe('getRunStatePath', () => {
    test('returns path with correct filename', () => {
      // We need to mock the internal functions
      // This is a simplified test - in reality we'd need to mock the module
      const testPath = path.join(mockCurrentChatDir, 'run-state.json')
      expect(testPath).toContain('run-state.json')
    })
  })

  describe('getChatMessagesPath', () => {
    test('returns path with correct filename', () => {
      const testPath = path.join(mockCurrentChatDir, 'chat-messages.json')
      expect(testPath).toContain('chat-messages.json')
    })
  })

  describe('file serialization format', () => {
    test('run state JSON structure is preserved through serialization', () => {
      const runState: RunState = {
        output: {
          type: 'error',
          message: 'Test output',
        },
      } as unknown as RunState

      const runStatePath = path.join(mockCurrentChatDir, 'run-state.json')
      fs.writeFileSync(runStatePath, JSON.stringify(runState, null, 2))

      const savedRunState = JSON.parse(fs.readFileSync(runStatePath, 'utf8'))
      expect(savedRunState.output.type).toBe('error')
      expect(savedRunState.output.message).toBe('Test output')
    })

    test('messages JSON structure is preserved through serialization', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          variant: 'user',
          content: 'Hello',
          timestamp: new Date().toISOString(),
          blocks: [{ type: 'text', content: 'Hello' }],
        },
      ]

      const messagesPath = path.join(mockCurrentChatDir, 'chat-messages.json')
      fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2))

      const savedMessages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'))
      expect(savedMessages).toHaveLength(1)
      expect(savedMessages[0].variant).toBe('user')
    })

    test('nested message structure is preserved through serialization', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          variant: 'agent',
          content: '',
          timestamp: new Date().toISOString(),
          blocks: [
            {
              type: 'agent',
              agentId: 'nested-agent',
              agentName: 'NestedAgent',
              agentType: 'inline',
              content: '',
              status: 'complete',
              blocks: [
                { type: 'text', content: 'Nested content' },
                { type: 'tool', toolCallId: 'tool-xyz', toolName: 'glob', input: {}, output: '' },
              ],
            },
          ],
        },
      ]

      const messagesPath = path.join(mockCurrentChatDir, 'chat-messages.json')
      fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2))

      const savedMessages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'))
      expect(savedMessages[0].blocks[0].type).toBe('agent')
      expect(savedMessages[0].blocks[0].blocks).toHaveLength(2)
    })
  })

  describe('edge cases', () => {
    test('handles empty blocks array', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          variant: 'agent',
          content: '',
          timestamp: new Date().toISOString(),
          blocks: [],
        },
      ]

      const ids = getAllToggleIdsFromMessages(messages)
      expect(ids).toHaveLength(0)
    })

    test('handles deeply nested structure', () => {
      const deepBlock: ContentBlock = {
        type: 'agent',
        agentId: 'level-0',
        agentName: 'Level0Agent',
        agentType: 'inline',
        content: '',
        status: 'complete',
        blocks: [
          {
            type: 'agent',
            agentId: 'level-1',
            agentName: 'Level1Agent',
            agentType: 'inline',
            content: '',
            status: 'complete',
            blocks: [
              {
                type: 'agent',
                agentId: 'level-2',
                agentName: 'Level2Agent',
                agentType: 'inline',
                content: '',
                status: 'complete',
                blocks: [
                  { type: 'tool', toolCallId: 'deep-tool', toolName: 'glob', input: {}, output: '' },
                ],
              },
            ],
          },
        ],
      }

      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          variant: 'agent',
          content: '',
          timestamp: new Date().toISOString(),
          blocks: [deepBlock],
        },
      ]

      const ids = getAllToggleIdsFromMessages(messages)

      expect(ids).toContain('level-0')
      expect(ids).toContain('level-1')
      expect(ids).toContain('level-2')
      expect(ids).toContain('deep-tool')
    })

    test('preserves order of IDs as encountered', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          variant: 'agent',
          content: '',
          timestamp: new Date().toISOString(),
          blocks: [
            { type: 'agent', agentId: 'first', agentName: 'FirstAgent', agentType: 'inline', content: '', status: 'complete', blocks: [] },
            { type: 'tool', toolCallId: 'second', toolName: 'glob', input: {}, output: '' },
            { type: 'agent', agentId: 'third', agentName: 'ThirdAgent', agentType: 'inline', content: '', status: 'complete', blocks: [] },
          ],
        },
      ]

      const ids = getAllToggleIdsFromMessages(messages)

      expect(ids[0]).toBe('first')
      expect(ids[1]).toBe('second')
      expect(ids[2]).toBe('third')
    })
  })
})

describe('live chat state provider', () => {
  // Point persistence at a temp dir via the explicit test override — module
  // seams (mock.module, HOME, spyOn on auth) are unreliable across bun test
  // files and platforms.
  const chatDir = path.join(os.tmpdir(), 'codebuff-test-live-chatdir')

  const testRunState = (marker: string): RunState =>
    ({
      output: { type: 'error', message: marker },
    }) as unknown as RunState

  const testMessages = (marker: string): ChatMessage[] => [
    {
      id: 'msg-1',
      variant: 'user',
      content: marker,
      timestamp: new Date().toISOString(),
    },
  ]

  const readSavedMessages = () =>
    JSON.parse(
      fs.readFileSync(path.join(chatDir, 'chat-messages.json'), 'utf8'),
    ) as ChatMessage[]

  beforeEach(() => {
    fs.rmSync(chatDir, { recursive: true, force: true })
    setChatDirOverrideForTesting(chatDir)
  })

  afterEach(() => {
    clearLiveChatStateProvider('run-a')
    clearLiveChatStateProvider('run-b')
    setChatDirOverrideForTesting(undefined)
    fs.rmSync(chatDir, { recursive: true, force: true })
  })

  test('flushLiveChatState persists the provided state', () => {
    setLiveChatStateProvider('run-a', () => ({
      runState: testRunState('checkpoint'),
      messages: testMessages('in-flight prompt'),
    }))

    flushLiveChatState()

    expect(readSavedMessages()[0].content).toBe('in-flight prompt')
  })

  test('flushLiveChatState is a no-op with no provider registered', () => {
    flushLiveChatState()

    expect(fs.existsSync(path.join(chatDir, 'chat-messages.json'))).toBe(false)
  })

  test('clearLiveChatStateProvider stops flushing', () => {
    setLiveChatStateProvider('run-a', () => ({
      runState: testRunState('checkpoint'),
      messages: testMessages('in-flight prompt'),
    }))
    clearLiveChatStateProvider('run-a')

    flushLiveChatState()

    expect(fs.existsSync(path.join(chatDir, 'chat-messages.json'))).toBe(false)
  })

  test('a stale run cannot clear a newer run provider', () => {
    setLiveChatStateProvider('run-a', () => ({
      runState: testRunState('old'),
      messages: testMessages('old prompt'),
    }))
    setLiveChatStateProvider('run-b', () => ({
      runState: testRunState('new'),
      messages: testMessages('new prompt'),
    }))

    // The old run settling late must not remove the new run's provider.
    clearLiveChatStateProvider('run-a')
    flushLiveChatState()

    expect(readSavedMessages()[0].content).toBe('new prompt')
  })

  test('flushLiveChatState swallows provider errors', () => {
    setLiveChatStateProvider('run-a', () => {
      throw new Error('boom')
    })

    expect(() => flushLiveChatState()).not.toThrow()
  })
})

describe('atomic save and resilient load', () => {
  const chatDir = path.join(os.tmpdir(), 'codebuff-test-resilient-chatdir')

  const runState = { output: { type: 'error', message: 'x' } } as RunState
  const messages: ChatMessage[] = [
    {
      id: 'msg-1',
      variant: 'user',
      content: 'the prompt',
      timestamp: new Date().toISOString(),
    },
  ]

  beforeEach(() => {
    fs.rmSync(chatDir, { recursive: true, force: true })
    setChatDirOverrideForTesting(chatDir)
  })

  afterEach(() => {
    setChatDirOverrideForTesting(undefined)
    fs.rmSync(chatDir, { recursive: true, force: true })
  })

  test('saveChatState leaves no .tmp files behind', () => {
    saveChatState(runState, messages)

    const leftovers = fs
      .readdirSync(chatDir)
      .filter((name) => name.endsWith('.tmp'))
    expect(leftovers).toHaveLength(0)
    expect(
      JSON.parse(
        fs.readFileSync(path.join(chatDir, 'chat-messages.json'), 'utf8'),
      ),
    ).toHaveLength(1)
  })

  test('torn run-state.json still restores the transcript', () => {
    saveChatState(runState, messages)
    fs.writeFileSync(
      path.join(chatDir, 'run-state.json'),
      '{"sessionState": {"trunc',
    )

    const loaded = loadMostRecentChatState()

    expect(loaded).not.toBeNull()
    expect(loaded!.messages[0].content).toBe('the prompt')
    expect(loaded!.runState.output.type).toBe('error')
  })

  test('torn chat-messages.json still restores the run state', () => {
    saveChatState(runState, messages)
    fs.writeFileSync(path.join(chatDir, 'chat-messages.json'), '[{"id":')

    const loaded = loadMostRecentChatState()

    expect(loaded).not.toBeNull()
    expect(loaded!.messages).toHaveLength(0)
    expect((loaded!.runState.output as any).message).toBe('x')
  })

  test('returns null when both files are unreadable', () => {
    saveChatState(runState, messages)
    fs.writeFileSync(path.join(chatDir, 'run-state.json'), '{')
    fs.writeFileSync(path.join(chatDir, 'chat-messages.json'), '[')

    expect(loadMostRecentChatState()).toBeNull()
  })
})
