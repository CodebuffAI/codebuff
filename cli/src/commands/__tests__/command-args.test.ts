import { describe, test, expect, mock, beforeEach } from 'bun:test'

import {
  COMMAND_REGISTRY,
  findCommand,
  defineCommand,
  defineCommandWithArgs,
} from '../command-registry'

import type { RouterParams } from '../command-registry'

/**
 * Tests for the command factory pattern.
 * 
 * The factory pattern ensures commands handle arguments correctly:
 * - defineCommand: creates commands that reject arguments automatically
 * - defineCommandWithArgs: creates commands that receive and handle arguments
 */
describe('command factory pattern', () => {
  const createMockParams = (
    overrides: Partial<RouterParams> = {},
  ): RouterParams => ({
    abortControllerRef: { current: null },
    agentMode: 'DEFAULT',
    inputRef: { current: null },
    inputValue: '/test',
    isChainInProgressRef: { current: false },
    isStreaming: false,
    logoutMutation: {} as any,
    streamMessageIdRef: { current: null },
    addToQueue: mock(() => {}),
    clearMessages: mock(() => {}),
    saveToHistory: mock(() => {}),
    scrollToLatest: mock(() => {}),
    sendMessage: mock(async () => {}),
    setCanProcessQueue: mock(() => {}),
    setInputFocused: mock(() => {}),
    setInputValue: mock(() => {}),
    setIsAuthenticated: mock(() => {}),
    setMessages: mock(() => {}),
    setUser: mock(() => {}),
    stopStreaming: mock(() => {}),
    ...overrides,
  })

  describe('defineCommand (no args)', () => {
    test('creates a command that calls handler when no args provided', () => {
      const handler = mock(() => {})
      const cmd = defineCommand({
        name: 'test',
        handler,
      })

      const params = createMockParams()
      cmd.handler(params, '')

      expect(handler).toHaveBeenCalledWith(params)
    })

    test('creates a command that rejects args with error message', () => {
      const handler = mock(() => {})
      const setMessages = mock(() => {})
      const cmd = defineCommand({
        name: 'test',
        handler,
      })

      const params = createMockParams({ setMessages })
      cmd.handler(params, 'unexpected args')

      // Handler should NOT be called
      expect(handler).not.toHaveBeenCalled()
      // Error message should be shown
      expect(setMessages).toHaveBeenCalled()
    })

    test('sets aliases correctly', () => {
      const cmd = defineCommand({
        name: 'test',
        aliases: ['t', 'tst'],
        handler: () => {},
      })

      expect(cmd.aliases).toEqual(['t', 'tst'])
    })

    test('defaults to empty aliases when not provided', () => {
      const cmd = defineCommand({
        name: 'test',
        handler: () => {},
      })

      expect(cmd.aliases).toEqual([])
    })

    test('truncates long args in error message', () => {
      const handler = mock(() => {})
      let capturedMessage = ''
      const setMessages = mock((fn: any) => {
        const messages = fn([])
        capturedMessage = messages[1]?.content || ''
      })
      const cmd = defineCommand({
        name: 'test',
        handler,
      })

      const longArgs = 'a'.repeat(100)
      const params = createMockParams({ setMessages })
      cmd.handler(params, longArgs)

      expect(capturedMessage).toContain('...')
      expect(capturedMessage.length).toBeLessThan(longArgs.length + 100)
    })
  })

  describe('defineCommandWithArgs', () => {
    test('creates a command that passes args to handler', () => {
      const handler = mock(() => {})
      const cmd = defineCommandWithArgs({
        name: 'test',
        handler,
      })

      const params = createMockParams()
      cmd.handler(params, 'some args')

      expect(handler).toHaveBeenCalledWith(params, 'some args')
    })

    test('creates a command that passes empty args to handler', () => {
      const handler = mock(() => {})
      const cmd = defineCommandWithArgs({
        name: 'test',
        handler,
      })

      const params = createMockParams()
      cmd.handler(params, '')

      expect(handler).toHaveBeenCalledWith(params, '')
    })

    test('sets aliases correctly', () => {
      const cmd = defineCommandWithArgs({
        name: 'test',
        aliases: ['t', 'tst'],
        handler: () => {},
      })

      expect(cmd.aliases).toEqual(['t', 'tst'])
    })
  })

  describe('COMMAND_REGISTRY commands', () => {
    // Derive command categories from the acceptsArgs flag (set by factories)
    const noArgsCommands = COMMAND_REGISTRY.filter((cmd) => !cmd.acceptsArgs)
    const withArgsCommands = COMMAND_REGISTRY.filter((cmd) => cmd.acceptsArgs)

    test('there are commands that reject args', () => {
      expect(noArgsCommands.length).toBeGreaterThan(0)
    })

    test('there are commands that accept args', () => {
      expect(withArgsCommands.length).toBeGreaterThan(0)
    })

    for (const cmd of noArgsCommands) {
      test(`/${cmd.name} rejects arguments (acceptsArgs=false)`, () => {
        const setMessages = mock(() => {})
        const params = createMockParams({
          inputValue: `/${cmd.name} extra args`,
          setMessages,
        })

        cmd.handler(params, 'extra args')

        // Should show error message
        expect(setMessages).toHaveBeenCalled()
      })
    }

    for (const cmd of withArgsCommands) {
      test(`/${cmd.name} accepts arguments (acceptsArgs=true)`, () => {
        // Verify the command has acceptsArgs=true
        expect(cmd.acceptsArgs).toBe(true)
        // The actual behavior is tested in specific command tests
        expect(typeof cmd.handler).toBe('function')
      })
    }
  })
})
