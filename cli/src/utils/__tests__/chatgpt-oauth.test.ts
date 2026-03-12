import { afterEach, describe, expect, mock, test } from 'bun:test'

import {
  exchangeChatGptCodeForTokens,
  startChatGptOAuthFlow,
} from '../chatgpt-oauth'

describe('chatgpt-oauth utility', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('token exchange error is sanitized and does not include response body', async () => {
    startChatGptOAuthFlow()

    globalThis.fetch = mock(async () => {
      return {
        ok: false,
        status: 401,
        text: async () =>
          'invalid_grant access_token=secret-token refresh_token=secret-refresh',
      } as unknown as Response
    }) as unknown as typeof fetch

    const error = await exchangeChatGptCodeForTokens('auth-code').catch((e) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('status 401')
    expect(error.message).not.toContain('secret-token')
    expect(error.message).not.toContain('secret-refresh')
    expect(error.message).not.toContain('invalid_grant')
  })
})
