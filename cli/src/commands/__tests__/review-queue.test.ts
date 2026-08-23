import { afterEach, describe, expect, mock, test } from 'bun:test'

import { buildReviewPrompt } from '../prompt-builders'
import { routeUserPrompt } from '../router'
import { useChatStore } from '../../state/chat-store'

import type { RouterParams } from '../command-registry'

const createMockParams = (
  overrides: Partial<RouterParams> = {},
): RouterParams => ({
  agentMode: 'DEFAULT',
  inputRef: { current: null },
  inputValue: 'focus on the authentication flow',
  isChainInProgressRef: { current: false },
  isStreaming: false,
  logoutMutation: {} as RouterParams['logoutMutation'],
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
  ...overrides,
})

describe('custom review routing', () => {
  afterEach(() => {
    useChatStore.getState().reset()
  })

  test('queues a custom review while a response is in progress', async () => {
    const attachment = {
      kind: 'text' as const,
      id: 'requirements',
      content: 'Review the login requirements.',
      preview: 'Review the login requirements.',
      charCount: 32,
    }
    const addToQueue = mock(() => {})
    const sendMessage = mock(async () => {})
    useChatStore.setState({
      inputMode: 'review',
      pendingAttachments: [attachment],
    })

    const params = createMockParams({
      addToQueue,
      isStreaming: true,
      sendMessage,
    })

    await routeUserPrompt(params)

    expect(addToQueue).toHaveBeenCalledWith(
      buildReviewPrompt('custom', params.inputValue),
      [attachment],
    )
    expect(sendMessage).not.toHaveBeenCalled()
    expect(useChatStore.getState().pendingAttachments).toEqual([])
  })

  test('sends a custom review immediately when idle', async () => {
    const addToQueue = mock(() => {})
    const sendMessage = mock(async () => {})
    useChatStore.setState({ inputMode: 'review' })

    const params = createMockParams({ addToQueue, sendMessage })

    await routeUserPrompt(params)

    expect(sendMessage).toHaveBeenCalledWith({
      content: buildReviewPrompt('custom', params.inputValue),
      agentMode: params.agentMode,
    })
    expect(addToQueue).not.toHaveBeenCalled()
  })
})
