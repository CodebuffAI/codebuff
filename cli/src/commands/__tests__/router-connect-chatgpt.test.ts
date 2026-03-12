import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import type { RouterParams } from '../command-registry'
import * as analytics from '../../utils/analytics'

const setInputMode = mock(() => {})
const setMessages = mock(() => {})
const saveToHistory = mock(() => {})
const setInputValue = mock(() => {})
const handleChatGptAuthCode = mock(async () => ({
  success: true,
  message: 'ok',
}))

mock.module('../../state/chat-store', () => ({
  useChatStore: {
    getState: () => ({
      inputMode: 'connect:chatgpt',
      setInputMode,
      pendingAttachments: [],
    }),
  },
}))

mock.module('../../components/chatgpt-connect-banner', () => ({
  handleChatGptAuthCode,
}))

mock.module('../../utils/analytics', () => ({
  ...analytics,
  trackEvent: () => {},
}))

mock.module('@codebuff/common/constants/chatgpt-oauth', () => ({
  CHATGPT_OAUTH_ENABLED: true,
}))

describe('routeUserPrompt connect:chatgpt mode', () => {
  beforeEach(() => {
    setInputMode.mockClear()
    setMessages.mockClear()
    saveToHistory.mockClear()
    setInputValue.mockClear()
    handleChatGptAuthCode.mockClear()
  })

  afterEach(() => {
    setInputMode.mockClear()
    setMessages.mockClear()
    saveToHistory.mockClear()
    setInputValue.mockClear()
    handleChatGptAuthCode.mockClear()
  })

  test('when in connect:chatgpt mode, it exchanges the auth code and updates messages', async () => {
    const { routeUserPrompt } = await import('../router')

    const params = {
      abortControllerRef: { current: null },
      agentMode: 'DEFAULT',
      inputRef: { current: null },
      inputValue: 'auth-code-123',
      isChainInProgressRef: { current: false },
      isStreaming: false,
      logoutMutation: {} as RouterParams['logoutMutation'],
      streamMessageIdRef: { current: null },
      addToQueue: () => {},
      clearMessages: () => {},
      saveToHistory,
      scrollToLatest: () => {},
      sendMessage: async () => {},
      setCanProcessQueue: () => {},
      setInputFocused: () => {},
      setInputValue,
      setIsAuthenticated: () => {},
      setMessages,
      setUser: () => {},
      stopStreaming: () => {},
    } satisfies RouterParams

    await routeUserPrompt(params)

    expect(handleChatGptAuthCode).toHaveBeenCalledWith('auth-code-123')
    expect(setMessages).toHaveBeenCalled()
    expect(setInputMode).toHaveBeenCalledWith('default')
  })
})
