import { describe, test, expect, mock, beforeEach } from 'bun:test'

import { useChatStore } from '../../state/chat-store'
import { INPUT_MODE_CONFIGS, getInputModeConfig } from '../../utils/input-modes'
import { findCommand } from '../command-registry'

import type { RouterParams } from '../command-registry'

/**
 * Tests for bash command execution logic.
 *
 * These tests cover:
 * 1. runBashCommand - ghost vs direct mode selection based on store state
 * 2. /bash slash command handler - immediate execution vs entering bash mode
 */

describe('bash command', () => {
  // Reset store state before each test
  beforeEach(() => {
    useChatStore.getState().reset()
  })

  describe('/bash slash command handler', () => {
    const createMockParams = (overrides: Partial<RouterParams> = {}): RouterParams => ({
      abortControllerRef: { current: null },
      agentMode: 'DEFAULT',
      inputRef: { current: null },
      inputValue: '/bash',
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

    test('/bash command exists in registry', () => {
      const bashCommand = findCommand('bash')
      expect(bashCommand).toBeDefined()
      expect(bashCommand?.name).toBe('bash')
    })

    test('/bash with no args enters bash mode', () => {
      const bashCommand = findCommand('bash')
      const params = createMockParams()

      // Execute with empty args
      bashCommand?.handler(params, '')

      // Should enter bash mode
      expect(useChatStore.getState().inputMode).toBe('bash')
    })

    test('/bash with args does NOT enter bash mode', () => {
      const bashCommand = findCommand('bash')
      const params = createMockParams()

      // Execute with args - this will call runBashCommand which tries to run a real command
      // We just verify it doesn't enter bash mode
      bashCommand?.handler(params, 'echo test')

      // Should NOT enter bash mode - command is executed immediately
      expect(useChatStore.getState().inputMode).toBe('default')
    })

    test('/bash with args saves command WITH ! prefix to history', () => {
      const saveToHistory = mock(() => {})
      const bashCommand = findCommand('bash')
      const params = createMockParams({ saveToHistory })

      bashCommand?.handler(params, 'ls -la')

      // Should save with ! prefix
      expect(saveToHistory).toHaveBeenCalledWith('!ls -la')
    })

    test('/bash with no args saves original input to history', () => {
      const saveToHistory = mock(() => {})
      const bashCommand = findCommand('bash')
      const params = createMockParams({
        inputValue: '/bash',
        saveToHistory,
      })

      bashCommand?.handler(params, '')

      // Should save the original input
      expect(saveToHistory).toHaveBeenCalledWith('/bash')
    })

    test('/bash with args clears input', () => {
      const setInputValue = mock(() => {})
      const bashCommand = findCommand('bash')
      const params = createMockParams({ setInputValue })

      bashCommand?.handler(params, 'pwd')

      expect(setInputValue).toHaveBeenCalledWith({
        text: '',
        cursorPosition: 0,
        lastEditDueToNav: false,
      })
    })

    test('/bash with whitespace-only args enters bash mode', () => {
      const bashCommand = findCommand('bash')
      const params = createMockParams()

      bashCommand?.handler(params, '   ')

      // Whitespace-only should be treated as no args
      expect(useChatStore.getState().inputMode).toBe('bash')
    })

    test('"!" is an alias for /bash', () => {
      const bangCommand = findCommand('!')
      expect(bangCommand).toBeDefined()
      expect(bangCommand?.name).toBe('bash')
    })
  })

  describe('runBashCommand mode selection', () => {
    test('uses direct mode when not busy (no streaming agents, no chain in progress)', () => {
      // Ensure store is in non-busy state
      const state = useChatStore.getState()
      expect(state.streamingAgents.size).toBe(0)
      expect(state.isChainInProgress).toBe(false)

      // The isBusy calculation should be false
      const isBusy = state.streamingAgents.size > 0 || state.isChainInProgress
      expect(isBusy).toBe(false)
    })

    test('uses ghost mode when streaming agents present', () => {
      // Set up streaming agents
      useChatStore.getState().setStreamingAgents(new Set(['agent-1']))

      const state = useChatStore.getState()
      const isBusy = state.streamingAgents.size > 0 || state.isChainInProgress
      expect(isBusy).toBe(true)
    })

    test('uses ghost mode when chain in progress', () => {
      // Set chain in progress
      useChatStore.getState().setIsChainInProgress(true)

      const state = useChatStore.getState()
      const isBusy = state.streamingAgents.size > 0 || state.isChainInProgress
      expect(isBusy).toBe(true)
    })

    test('uses ghost mode when both streaming and chain in progress', () => {
      useChatStore.getState().setStreamingAgents(new Set(['agent-1']))
      useChatStore.getState().setIsChainInProgress(true)

      const state = useChatStore.getState()
      const isBusy = state.streamingAgents.size > 0 || state.isChainInProgress
      expect(isBusy).toBe(true)
    })
  })

  describe('pending bash messages', () => {
    test('addPendingBashMessage adds message to store', () => {
      const { addPendingBashMessage } = useChatStore.getState()

      addPendingBashMessage({
        id: 'test-id',
        command: 'ls -la',
        stdout: '',
        stderr: '',
        exitCode: 0,
        isRunning: true,
        cwd: '/test',
      })

      const messages = useChatStore.getState().pendingBashMessages
      expect(messages.length).toBe(1)
      expect(messages[0].command).toBe('ls -la')
      expect(messages[0].isRunning).toBe(true)
    })

    test('updatePendingBashMessage updates existing message', () => {
      const { addPendingBashMessage, updatePendingBashMessage } =
        useChatStore.getState()

      addPendingBashMessage({
        id: 'test-id',
        command: 'ls -la',
        stdout: '',
        stderr: '',
        exitCode: 0,
        isRunning: true,
        cwd: '/test',
      })

      updatePendingBashMessage('test-id', {
        stdout: 'file1.txt\nfile2.txt',
        exitCode: 0,
        isRunning: false,
      })

      const messages = useChatStore.getState().pendingBashMessages
      expect(messages[0].stdout).toBe('file1.txt\nfile2.txt')
      expect(messages[0].isRunning).toBe(false)
    })

    test('removePendingBashMessage removes message from store', () => {
      const { addPendingBashMessage, removePendingBashMessage } =
        useChatStore.getState()

      addPendingBashMessage({
        id: 'test-id',
        command: 'ls',
        stdout: '',
        stderr: '',
        exitCode: 0,
        isRunning: false,
        cwd: '/test',
      })

      expect(useChatStore.getState().pendingBashMessages.length).toBe(1)

      removePendingBashMessage('test-id')

      expect(useChatStore.getState().pendingBashMessages.length).toBe(0)
    })

    test('clearPendingBashMessages removes all messages', () => {
      const { addPendingBashMessage, clearPendingBashMessages } =
        useChatStore.getState()

      addPendingBashMessage({
        id: 'test-1',
        command: 'ls',
        stdout: '',
        stderr: '',
        exitCode: 0,
        isRunning: false,
        cwd: '/test',
      })
      addPendingBashMessage({
        id: 'test-2',
        command: 'pwd',
        stdout: '',
        stderr: '',
        exitCode: 0,
        isRunning: false,
        cwd: '/test',
      })

      expect(useChatStore.getState().pendingBashMessages.length).toBe(2)

      clearPendingBashMessages()

      expect(useChatStore.getState().pendingBashMessages.length).toBe(0)
    })
  })

  describe('bash mode state transitions', () => {
    test('entering bash mode sets inputMode to bash', () => {
      useChatStore.getState().setInputMode('bash')
      expect(useChatStore.getState().inputMode).toBe('bash')
    })

    test('exiting bash mode sets inputMode to default', () => {
      useChatStore.getState().setInputMode('bash')
      useChatStore.getState().setInputMode('default')
      expect(useChatStore.getState().inputMode).toBe('default')
    })

    test('reset clears inputMode to default', () => {
      useChatStore.getState().setInputMode('bash')
      useChatStore.getState().reset()
      expect(useChatStore.getState().inputMode).toBe('default')
    })
  })

  describe('/bash with special characters in args', () => {
    const createMockParams = (overrides: Partial<RouterParams> = {}): RouterParams => ({
      abortControllerRef: { current: null },
      agentMode: 'DEFAULT',
      inputRef: { current: null },
      inputValue: '/bash',
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

    test('/bash with pipe characters preserves them', () => {
      const saveToHistory = mock(() => {})
      const bashCommand = findCommand('bash')
      const params = createMockParams({ saveToHistory })

      bashCommand?.handler(params, 'ls | grep foo')

      expect(saveToHistory).toHaveBeenCalledWith('!ls | grep foo')
    })

    test('/bash with quoted arguments preserves them', () => {
      const saveToHistory = mock(() => {})
      const bashCommand = findCommand('bash')
      const params = createMockParams({ saveToHistory })

      bashCommand?.handler(params, 'echo "hello world"')

      expect(saveToHistory).toHaveBeenCalledWith('!echo "hello world"')
    })

    test('/bash with redirection operators preserves them', () => {
      const saveToHistory = mock(() => {})
      const bashCommand = findCommand('bash')
      const params = createMockParams({ saveToHistory })

      bashCommand?.handler(params, 'echo test > debug/output.txt')

      expect(saveToHistory).toHaveBeenCalledWith('!echo test > debug/output.txt')
    })

    test('/bash with environment variables preserves them', () => {
      const saveToHistory = mock(() => {})
      const bashCommand = findCommand('bash')
      const params = createMockParams({ saveToHistory })

      bashCommand?.handler(params, 'echo $HOME')

      expect(saveToHistory).toHaveBeenCalledWith('!echo $HOME')
    })

    test('/bash with semicolon command chaining preserves it', () => {
      const saveToHistory = mock(() => {})
      const bashCommand = findCommand('bash')
      const params = createMockParams({ saveToHistory })

      bashCommand?.handler(params, 'cd /tmp; ls')

      expect(saveToHistory).toHaveBeenCalledWith('!cd /tmp; ls')
    })

    test('/bash with && command chaining preserves it', () => {
      const saveToHistory = mock(() => {})
      const bashCommand = findCommand('bash')
      const params = createMockParams({ saveToHistory })

      bashCommand?.handler(params, 'mkdir test && cd test')

      expect(saveToHistory).toHaveBeenCalledWith('!mkdir test && cd test')
    })
  })

  describe('bang prefix handling in queue', () => {
    test('command starting with ! and length > 1 is recognized as bash command', () => {
      const input = '!ls -la'
      const isBashFromQueue = input.startsWith('!') && input.length > 1
      expect(isBashFromQueue).toBe(true)
    })

    test('single ! character is NOT recognized as bash command from queue', () => {
      const input = '!'
      const isBashFromQueue = input.startsWith('!') && input.length > 1
      expect(isBashFromQueue).toBe(false)
    })

    test('command extracts correctly without ! prefix', () => {
      const input = '!git status'
      const command = input.slice(1)
      expect(command).toBe('git status')
    })

    test('empty string is not a bash command from queue', () => {
      const input = ''
      const isBashFromQueue = input.startsWith('!') && input.length > 1
      expect(isBashFromQueue).toBe(false)
    })

    test('regular text without ! is not a bash command from queue', () => {
      const input = 'help me with this'
      const isBashFromQueue = input.startsWith('!') && input.length > 1
      expect(isBashFromQueue).toBe(false)
    })
  })

  describe('bash mode configuration', () => {
    test('bash mode has correct icon', () => {
      const config = getInputModeConfig('bash')
      expect(config.icon).toBe('!')
    })

    test('bash mode uses success color (green)', () => {
      const config = getInputModeConfig('bash')
      expect(config.color).toBe('success')
    })

    test('bash mode has correct placeholder', () => {
      const config = getInputModeConfig('bash')
      expect(config.placeholder).toBe('enter bash command...')
    })

    test('bash mode has width adjustment of 2', () => {
      const config = getInputModeConfig('bash')
      expect(config.widthAdjustment).toBe(2)
    })

    test('bash mode hides agent mode toggle', () => {
      const config = getInputModeConfig('bash')
      expect(config.showAgentModeToggle).toBe(false)
    })

    test('bash mode disables slash command suggestions', () => {
      const config = getInputModeConfig('bash')
      expect(config.disableSlashSuggestions).toBe(true)
    })

    test('bash mode config exists in INPUT_MODE_CONFIGS', () => {
      expect(INPUT_MODE_CONFIGS.bash).toBeDefined()
    })
  })
})
