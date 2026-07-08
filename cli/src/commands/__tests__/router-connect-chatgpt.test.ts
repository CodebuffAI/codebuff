import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import { useChatStore } from '../../state/chat-store'

import type { RouterParams } from '../command-registry'

const saveToHistory = mock(() => {})
const setInputValue = mock(() => {})
const setMessages = mock(() => {})
const handleChatGptAuthCode = mock(async () => ({
  success: true,
  message: 'ok',
}))

mock.module('../../components/chatgpt-connect-banner', () => ({
  handleChatGptAuthCode,
}))

mock.module('@codebuff/common/constants/chatgpt-oauth', () => ({
  CHATGPT_OAUTH_ENABLED: true,
  CHATGPT_OAUTH_CLIENT_ID: 'test-client-id',
  CHATGPT_OAUTH_AUTHORIZE_URL: 'https://auth.openai.com/oauth/authorize',
  CHATGPT_OAUTH_TOKEN_URL: 'https://auth.openai.com/oauth/token',
  CHATGPT_OAUTH_REDIRECT_URI: 'http://localhost:1455/auth/callback',
  CHATGPT_BACKEND_BASE_URL: 'https://chatgpt.com/backend-api',
  CHATGPT_OAUTH_TOKEN_ENV_VAR: 'CODEBUFF_CHATGPT_OAUTH_TOKEN',
  OPENBUFF_CHATGPT_OAUTH_TOKEN_ENV_VAR: 'OPENBUFF_CHATGPT_OAUTH_TOKEN',
  OPENROUTER_TO_OPENAI_MODEL_MAP: {},
  CHATGPT_OAUTH_OPENAI_MODEL_ALLOWLIST: [],
  isOpenAIProviderModel: (model: string) => model.startsWith('openai/'),
  isChatGptOAuthModelAllowed: () => false,
  toOpenAIModelId: (model: string) => model,
}))

describe('routeUserPrompt connect:chatgpt mode', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
    useChatStore.getState().setInputMode('connect:chatgpt')
    saveToHistory.mockClear()
    setInputValue.mockClear()
    setMessages.mockClear()
    handleChatGptAuthCode.mockClear()
  })

  afterEach(() => {
    useChatStore.getState().reset()
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
      streamMessageIdRef: { current: null },
      addToQueue: () => {},
      clearMessages: () => {},
      saveToHistory,
      scrollToLatest: () => {},
      sendMessage: async () => {},
      setCanProcessQueue: () => {},
      setInputFocused: () => {},
      setInputValue,
      setMessages,
      stopStreaming: () => {},
    } satisfies RouterParams

    await routeUserPrompt(params)

    expect(handleChatGptAuthCode).toHaveBeenCalledWith('auth-code-123')
    expect(setMessages).toHaveBeenCalled()
    expect(useChatStore.getState().inputMode).toBe('default')
  })
})
