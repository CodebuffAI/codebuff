import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { userMessage } from '@codebuff/common/util/messages'
import { COMPACTED_CONTEXT_POINTER } from '@codebuff/agent-runtime/util/messages'
import { countTokensJson } from '@codebuff/agent-runtime/util/token-counter'
import { describe, expect, mock, spyOn, test } from 'bun:test'

import {
  getMessagesForModelContext,
  getProviderContextLimitFromError,
} from '../llm'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('getMessagesForModelContext', () => {
  test('uses the default trim limit when context window is unknown', () => {
    const messages: Message[] = [userMessage('short context')]

    const result = getMessagesForModelContext({
      messages,
      logger,
    })

    expect(result).toBe(messages)
  })

  test('trims messages using the resolved model context window', () => {
    const messages: Message[] = [
      userMessage('old context '.repeat(10_000)),
      userMessage('middle context '.repeat(10_000)),
      userMessage('recent context '.repeat(10_000)),
    ]

    const largeContextResult = getMessagesForModelContext({
      messages,
      contextWindowTokens: 200_000,
      logger,
    })
    const smallContextResult = getMessagesForModelContext({
      messages,
      contextWindowTokens: 2_000,
      logger,
    })

    const smallContextJson = JSON.stringify(smallContextResult)

    expect(largeContextResult).toHaveLength(messages.length)
    expect(largeContextResult).toBe(messages)
    expect(smallContextResult).not.toEqual(messages)
    expect(smallContextJson).toContain(COMPACTED_CONTEXT_POINTER)
    expect(smallContextJson).not.toContain('old context old context')
  })

  test('reserves part of the model context window for non-message request overhead', () => {
    const messages: Message[] = [userMessage('reserve-sensitive '.repeat(600))]
    const rawMessageTokens = countTokensJson(messages)

    const result = getMessagesForModelContext({
      messages,
      contextWindowTokens: rawMessageTokens + 512,
      logger,
    })

    expect(result).not.toEqual(messages)
    expect(JSON.stringify(result)).toContain(COMPACTED_CONTEXT_POINTER)
  })

  test('emits cache_emergency_trim telemetry when request-time trim drops messages (M4.3)', () => {
    const messages: Message[] = [
      userMessage('old context '.repeat(10_000)),
      userMessage('middle context '.repeat(10_000)),
      userMessage('recent context '.repeat(10_000)),
    ]

    const warnSpy = spyOn(logger, 'warn').mockImplementation(() => {})

    try {
      // Large context window -> no trim, no telemetry
      getMessagesForModelContext({
        messages,
        contextWindowTokens: 1_000_000,
        logger,
      })
      expect(warnSpy).not.toHaveBeenCalled()

      // Tiny context window -> trim fires, telemetry emitted
      const result = getMessagesForModelContext({
        messages,
        contextWindowTokens: 2_000,
        logger,
      })

      expect(warnSpy).toHaveBeenCalledTimes(1)
      const call = warnSpy.mock.calls[0]
      const payload = call[0] as Record<string, unknown>
      expect(payload.eventId).toBe(AnalyticsEvent.CACHE_EMERGENCY_TRIM)
      expect(payload.contextWindowTokens).toBe(2_000)
      expect(payload.triggerBudgetTokens).toBe(1_000)
      expect(payload.targetBudgetTokens).toBe(1_000)
      expect(payload.reason).toContain('provider-safe request budget')
      expect(payload.inputMessageCount).toBe(messages.length)
      expect(payload.outputMessageCount).toBe(result.length)
      expect(payload.tokensDropped).toBeGreaterThan(0)
      const message = call[1] as string
      expect(message).toContain('cache_emergency_trim')
    } finally {
      warnSpy.mockRestore()
    }
  })

  test('does not emit cache_emergency_trim telemetry when no trim occurs (M4.3)', () => {
    const messages: Message[] = [userMessage('short context')]
    const warnSpy = spyOn(logger, 'warn').mockImplementation(() => {})

    try {
      getMessagesForModelContext({
        messages,
        contextWindowTokens: 200_000,
        logger,
      })
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  test('honors an adaptive provider message-limit override', () => {
    const messages: Message[] = [
      userMessage('oversized context '.repeat(8_000)),
    ]
    const result = getMessagesForModelContext({
      messages,
      contextWindowTokens: 1_000_000,
      maxTotalTokensOverride: 2_000,
      logger,
    })

    expect(result).not.toEqual(messages)
    expect(JSON.stringify(result)).toContain(COMPACTED_CONTEXT_POINTER)
  })

  test('extracts provider context limits from oversized-prompt errors', () => {
    expect(
      getProviderContextLimitFromError(
        new Error('prompt is too long: 200548 tokens > 200000 maximum'),
      ),
    ).toBe(200_000)
    expect(
      getProviderContextLimitFromError({
        responseBody: 'maximum context length is 128000 tokens',
      }),
    ).toBe(128_000)
    expect(getProviderContextLimitFromError(new Error('rate limited'))).toBe(
      undefined,
    )
  })
})
