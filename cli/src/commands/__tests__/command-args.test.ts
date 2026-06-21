import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { setProjectRoot } from '../../project-files'
import { useFeedbackStore } from '../../state/feedback-store'
import {
  COMMAND_REGISTRY,
  defineCommand,
  defineCommandWithArgs,
} from '../command-registry'
import { listPlanSessions } from '../plan-artifacts'

import type { RouterParams } from '../command-registry'

/**
 * Tests for the command factory pattern.
 *
 * The factory pattern ensures commands handle arguments correctly:
 * - defineCommand: creates commands that gracefully ignore arguments
 * - defineCommandWithArgs: creates commands that receive and handle arguments
 */
describe('command factory pattern', () => {
  const createMockParams = (
    overrides: Partial<RouterParams> = {},
  ): RouterParams =>
    ({
      abortControllerRef: { current: null },
      agentMode: 'DEFAULT',
      inputRef: { current: null },
      inputValue: '/test',
      isChainInProgressRef: { current: false },
      isStreaming: false,
      streamMessageIdRef: { current: null },
      addToQueue: mock(() => {}),
      clearMessages: mock(() => {}),
      saveToHistory: mock(() => {}),
      scrollToLatest: mock(() => {}),
      sendMessage: mock(async () => {}),
      setCanProcessQueue: mock(() => {}),
      setInputFocused: mock(() => {}),
      setInputValue: mock(() => {}),
      setMessages: mock(() => {}),
      stopStreaming: mock(() => {}),
      ...overrides,
    }) as RouterParams

  describe('defineCommand (gracefully ignores args)', () => {
    test('calls handler when no args provided', () => {
      const handler = mock(() => {})
      const cmd = defineCommand({
        name: 'test',
        handler,
      })

      const params = createMockParams()
      cmd.handler(params, '')

      expect(handler).toHaveBeenCalledWith(params)
    })

    test('calls handler even when args are provided (gracefully ignores)', () => {
      const handler = mock(() => {})
      const cmd = defineCommand({
        name: 'test',
        handler,
      })

      const params = createMockParams()
      cmd.handler(params, 'some unexpected args')

      // Handler should still be called - args are ignored
      expect(handler).toHaveBeenCalledWith(params)
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

    test('sets acceptsArgs to false', () => {
      const cmd = defineCommand({
        name: 'test',
        handler: () => {},
      })

      expect(cmd.acceptsArgs).toBe(false)
    })
  })

  describe('defineCommandWithArgs', () => {
    test('passes args to handler', () => {
      const handler = mock(() => {})
      const cmd = defineCommandWithArgs({
        name: 'test',
        handler,
      })

      const params = createMockParams()
      cmd.handler(params, 'some args')

      expect(handler).toHaveBeenCalledWith(params, 'some args')
    })

    test('passes empty args to handler', () => {
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

    test('sets acceptsArgs to true', () => {
      const cmd = defineCommandWithArgs({
        name: 'test',
        handler: () => {},
      })

      expect(cmd.acceptsArgs).toBe(true)
    })
  })

  describe('COMMAND_REGISTRY commands', () => {
    const noArgsCommands = COMMAND_REGISTRY.filter((cmd) => !cmd.acceptsArgs)
    const withArgsCommands = COMMAND_REGISTRY.filter((cmd) => cmd.acceptsArgs)

    test('there are commands that ignore args', () => {
      expect(noArgsCommands.length).toBeGreaterThan(0)
    })

    test('there are commands that accept args', () => {
      expect(withArgsCommands.length).toBeGreaterThan(0)
    })

    test('expected commands ignore args', () => {
      const expectedNoArgs = ['exit', 'help', 'init']
      for (const name of expectedNoArgs) {
        const cmd = COMMAND_REGISTRY.find((c) => c.name === name)
        expect(cmd, `Command ${name} should exist`).toBeDefined()
        expect(cmd?.acceptsArgs, `Command ${name} should not accept args`).toBe(
          false,
        )
      }
    })

    test('expected commands accept args', () => {
      // mode:* commands also accept args now
      const expectedWithArgs = [
        'feedback',
        'bash',
        'image',
        'publish',
        'new',
        'resume-plan',
        'update-plan',
        'plan-status',
        'lessons',
        'mode:default',
        'mode:plan',
        'mode:execute_plan',
      ]
      for (const name of expectedWithArgs) {
        const cmd = COMMAND_REGISTRY.find((c) => c.name === name)
        expect(cmd, `Command ${name} should exist`).toBeDefined()
        expect(cmd?.acceptsArgs, `Command ${name} should accept args`).toBe(
          true,
        )
      }
    })

    test('mode commands accept args to send as first message', () => {
      const modeCommands = COMMAND_REGISTRY.filter((cmd) =>
        cmd.name.startsWith('mode:'),
      )
      expect(modeCommands.length).toBeGreaterThan(0)
      for (const cmd of modeCommands) {
        expect(
          cmd.acceptsArgs,
          `Mode command ${cmd.name} should accept args`,
        ).toBe(true)
      }
    })
  })

  describe('new command arg handling', () => {
    test('clears messages and sends arg as first message when args provided', () => {
      const newCmd = COMMAND_REGISTRY.find((c) => c.name === 'new')
      expect(newCmd).toBeDefined()

      const sendMessage = mock(async () => {})
      const setMessages = mock(() => {})
      const clearMessages = mock(() => {})
      const setCanProcessQueue = mock(() => {})

      const params = createMockParams({
        inputValue: '/new hello world',
        sendMessage,
        setMessages,
        clearMessages,
        setCanProcessQueue,
      })

      newCmd!.handler(params, 'hello world')

      // Should clear messages
      expect(setMessages).toHaveBeenCalled()
      expect(clearMessages).toHaveBeenCalled()

      // Should re-enable queue and send message
      expect(setCanProcessQueue).toHaveBeenCalledWith(true)
      expect(sendMessage).toHaveBeenCalledWith({
        content: 'hello world',
        agentMode: 'DEFAULT',
      })
    })

    test('clears messages without sending when no args provided', () => {
      const newCmd = COMMAND_REGISTRY.find((c) => c.name === 'new')
      expect(newCmd).toBeDefined()

      const sendMessage = mock(async () => {})
      const setMessages = mock(() => {})
      const clearMessages = mock(() => {})
      const setCanProcessQueue = mock(() => {})

      const params = createMockParams({
        inputValue: '/new',
        sendMessage,
        setMessages,
        clearMessages,
        setCanProcessQueue,
      })

      newCmd!.handler(params, '')

      // Should clear messages
      expect(setMessages).toHaveBeenCalled()
      expect(clearMessages).toHaveBeenCalled()

      // Should disable queue and NOT send message
      expect(setCanProcessQueue).toHaveBeenCalledWith(false)
      expect(sendMessage).not.toHaveBeenCalled()
    })
  })

  describe('durable plan command arg handling', () => {
    let tmpRoot: string

    const writeArtifact = (slug: string, name: string, body: string) => {
      const dir = path.join(tmpRoot, '.agents', 'sessions', slug)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, name), body, 'utf8')
    }

    beforeEach(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-cmd-'))
      setProjectRoot(tmpRoot)
    })

    afterEach(() => {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    })

    test('plan sends a plan-mode create prompt when args are provided', () => {
      const planCmd = COMMAND_REGISTRY.find((c) => c.name === 'plan')
      expect(planCmd).toBeDefined()

      const sendMessage = mock(async () => {})
      const params = createMockParams({
        inputValue: '/plan build auth',
        sendMessage,
      })

      planCmd!.handler(params, 'build auth')

      expect(sendMessage).toHaveBeenCalledWith({
        content: expect.stringContaining('build auth'),
        agentMode: 'PLAN',
      })
    })

    test('resume-plan reads artifacts into the prompt', () => {
      writeArtifact('auth-refresh', 'PLAN.md', '# Plan\n- [ ] task one')
      writeArtifact('auth-refresh', 'STATUS.md', 'in progress: task one')

      const resumeCmd = COMMAND_REGISTRY.find((c) => c.name === 'resume-plan')
      expect(resumeCmd).toBeDefined()

      const sendMessage = mock(async () => {})
      const params = createMockParams({
        inputValue: '/resume-plan auth-refresh',
        sendMessage,
      })

      resumeCmd!.handler(params, 'auth-refresh')

      expect(sendMessage).toHaveBeenCalledTimes(1)
      const calls = sendMessage.mock.calls as unknown as Array<[
        { content: string; agentMode: string },
      ]>
      const call = calls[0][0]
      expect(call.agentMode).toBe('EXECUTE_PLAN')
      expect(call.content).toContain('.agents/sessions/auth-refresh')
      expect(call.content).toContain('in progress: task one')
      expect(call.content).toContain('# Plan')
      expect(call.content).toContain('update_plan_status')
    })

    test('resume-plan with missing session does not send', () => {
      const resumeCmd = COMMAND_REGISTRY.find((c) => c.name === 'resume-plan')
      const sendMessage = mock(async () => {})
      const setMessages = mock(() => {})
      const params = createMockParams({
        inputValue: '/resume-plan missing-slug',
        sendMessage,
        setMessages,
      })

      resumeCmd!.handler(params, 'missing-slug')

      expect(sendMessage).not.toHaveBeenCalled()
      expect(setMessages).toHaveBeenCalled()
    })

    test('update-plan includes note and artifact content in prompt', () => {
      writeArtifact('foo', 'SPEC.md', 'spec body')
      writeArtifact('foo', 'PLAN.md', 'plan body')

      const updateCmd = COMMAND_REGISTRY.find((c) => c.name === 'update-plan')
      const sendMessage = mock(async () => {})
      const params = createMockParams({
        inputValue: '/update-plan .agents/sessions/foo API changed',
        sendMessage,
      })

      updateCmd!.handler(params, '.agents/sessions/foo API changed')

      const calls = sendMessage.mock.calls as unknown as Array<[
        { content: string; agentMode: string },
      ]>
      const call = calls[0][0]
      expect(call.content).toContain('User note/context: API changed')
      expect(call.content).toContain('spec body')
      expect(call.content).toContain('plan body')
      expect(call.content).toContain('update_plan_status')
      expect(call.content).toContain('create_plan')
    })

    test('lessons includes note and artifact content in prompt', () => {
      writeArtifact('foo', 'PLAN.md', 'plan body')

      const lessonsCmd = COMMAND_REGISTRY.find((c) => c.name === 'lessons')
      const sendMessage = mock(async () => {})
      const params = createMockParams({
        inputValue: '/lessons foo always run tests',
        sendMessage,
      })

      lessonsCmd!.handler(params, 'foo always run tests')

      const calls = sendMessage.mock.calls as unknown as Array<[
        { content: string; agentMode: string },
      ]>
      const call = calls[0][0]
      expect(call.content).toContain(
        'User note/context to incorporate: always run tests',
      )
      expect(call.content).toContain('plan body')
      expect(call.content).toContain('update_plan_status')
    })

    test('plan-status displays local status without sending to agent', () => {
      writeArtifact('foo', 'STATUS.md', 'currently: ready for review')
      writeArtifact('foo', 'PLAN.md', 'plan body')

      const statusCmd = COMMAND_REGISTRY.find((c) => c.name === 'plan-status')
      const sendMessage = mock(async () => {})
      const setMessages = mock(() => {})
      const params = createMockParams({
        inputValue: '/plan-status foo',
        sendMessage,
        setMessages,
      })

      statusCmd!.handler(params, 'foo')

      expect(sendMessage).not.toHaveBeenCalled()
      expect(setMessages).toHaveBeenCalled()
      const setMessagesCalls = setMessages.mock.calls as unknown as Array<[
        (prev: unknown[]) => Array<{ content: string }>,
      ]>
      const updater = setMessagesCalls[0][0]
      const next = updater([])
      const systemMessage = next[next.length - 1]
      expect(systemMessage.content).toContain('currently: ready for review')
      expect(systemMessage.content).toContain('.agents/sessions/foo/PLAN.md')
      expect(systemMessage.content).toContain('Missing: SPEC.md, LESSONS.md')
    })

    test('durable plan commands with missing args open plan session picker', () => {
      const commandNames = [
        'resume-plan',
        'update-plan',
        'plan-status',
        'lessons',
      ]

      for (const name of commandNames) {
        const cmd = COMMAND_REGISTRY.find((c) => c.name === name)
        expect(cmd).toBeDefined()

        const sendMessage = mock(async () => {})
        const setMessages = mock(() => {})
        const saveToHistory = mock(() => {})
        const setInputValue = mock(() => {})
        const params = createMockParams({
          inputValue: `/${name}`,
          sendMessage,
          setMessages,
          saveToHistory,
          setInputValue,
        })

        const result = cmd!.handler(params, '')

        expect(result).toEqual({ openPlanSessionPicker: name })
        expect(sendMessage).not.toHaveBeenCalled()
        expect(setMessages).not.toHaveBeenCalled()
        expect(saveToHistory).toHaveBeenCalledTimes(1)
        expect(saveToHistory).toHaveBeenCalledWith(`/${name}`)
        expect(setInputValue).toHaveBeenCalledWith({
          text: '',
          cursorPosition: 0,
          lastEditDueToNav: false,
        })
      }
    })

    test('listPlanSessions returns sessions with plan artifacts only', () => {
      writeArtifact('with-plan', 'PLAN.md', 'plan body')
      writeArtifact('with-status', 'STATUS.md', 'status body')
      fs.mkdirSync(path.join(tmpRoot, '.agents', 'sessions', 'empty'), {
        recursive: true,
      })

      const sessions = listPlanSessions()

      expect(sessions.map((session) => session.slug).sort()).toEqual([
        'with-plan',
        'with-status',
      ])
      expect(sessions).toContainEqual(
        expect.objectContaining({
          slug: 'with-plan',
          sessionDir: '.agents/sessions/with-plan',
          artifacts: ['PLAN.md'],
        }),
      )
    })
  })

  describe('feedback command arg handling', () => {
    test('pre-populates feedback text when args are provided', () => {
      const feedbackCmd = COMMAND_REGISTRY.find((c) => c.name === 'feedback')
      expect(feedbackCmd).toBeDefined()

      // Reset the feedback store
      useFeedbackStore.getState().reset()

      const params = createMockParams({ inputValue: '/feedback my bug report' })
      feedbackCmd!.handler(params, 'my bug report')

      // Check that feedback text was pre-populated
      const state = useFeedbackStore.getState()
      expect(state.feedbackText).toBe('my bug report')
      expect(state.feedbackCursor).toBe('my bug report'.length)
    })

    test('opens feedback mode without pre-populating when no args', () => {
      const feedbackCmd = COMMAND_REGISTRY.find((c) => c.name === 'feedback')
      expect(feedbackCmd).toBeDefined()

      // Reset the feedback store
      useFeedbackStore.getState().reset()

      const params = createMockParams({ inputValue: '/feedback' })
      const result = feedbackCmd!.handler(params, '')

      // Should return openFeedbackMode
      expect(result).toEqual({ openFeedbackMode: true })

      // Feedback text should remain empty
      const state = useFeedbackStore.getState()
      expect(state.feedbackText).toBe('')
    })

    test('returns openFeedbackMode even with args', () => {
      const feedbackCmd = COMMAND_REGISTRY.find((c) => c.name === 'feedback')
      expect(feedbackCmd).toBeDefined()

      // Reset the feedback store
      useFeedbackStore.getState().reset()

      const params = createMockParams({ inputValue: '/feedback test' })
      const result = feedbackCmd!.handler(params, 'test')

      // Should still return openFeedbackMode
      expect(result).toEqual({ openFeedbackMode: true })
    })
  })
})
