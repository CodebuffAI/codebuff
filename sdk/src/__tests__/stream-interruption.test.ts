import { describe, expect, it } from 'bun:test'

import {
  classifyStreamEndRecovery,
  classifyThrownStreamRecovery,
  streamFinishInfoOf,
} from '../impl/stream-interruption'

const noYields = { yieldedText: false, yieldedToolCall: false }

describe('classifyStreamEndRecovery', () => {
  it('classifies a stream that ended without any finish part as interrupted', () => {
    expect(
      classifyStreamEndRecovery({ aborted: false, finish: undefined, ...noYields })
        ?.source,
    ).toBe('stream-interrupted')
  })

  it('classifies the flush signature (unknown reason, no usage) as interrupted', () => {
    // The provider's TransformStream flush emits this shape when the HTTP
    // body ends without a finish_reason chunk — the connection-cut signature.
    expect(
      classifyStreamEndRecovery({
        aborted: false,
        finish: { finishReason: 'unknown', hasUsage: false },
        yieldedText: true,
        yieldedToolCall: false,
      })?.source,
    ).toBe('stream-interrupted')
  })

  it('classifies a reasoning-only length stop as output-limit', () => {
    const recovery = classifyStreamEndRecovery({
      aborted: false,
      finish: { finishReason: 'length', hasUsage: true },
      ...noYields,
    })
    expect(recovery?.source).toBe('output-limit')
    expect(recovery?.message).toContain('output token limit')
  })

  it('leaves a length stop after real output alone', () => {
    // The answer ran long — retrying would duplicate output.
    for (const yields of [
      { yieldedText: true, yieldedToolCall: false },
      { yieldedText: false, yieldedToolCall: true },
    ]) {
      expect(
        classifyStreamEndRecovery({
          aborted: false,
          finish: { finishReason: 'length', hasUsage: true },
          ...yields,
        }),
      ).toBeNull()
    }
  })

  it('never classifies a user-cancelled stream', () => {
    for (const finish of [
      undefined,
      { finishReason: 'unknown', hasUsage: false },
      { finishReason: 'length', hasUsage: true },
    ]) {
      expect(
        classifyStreamEndRecovery({ aborted: true, finish, ...noYields }),
      ).toBeNull()
    }
  })

  it('leaves normal completions alone', () => {
    for (const finishReason of ['stop', 'tool-calls', 'content-filter']) {
      for (const hasUsage of [true, false]) {
        expect(
          classifyStreamEndRecovery({
            aborted: false,
            finish: { finishReason, hasUsage },
            ...noYields,
          }),
        ).toBeNull()
      }
    }
  })

  it('leaves an unrecognized finish reason on a complete stream alone', () => {
    // Providers map nonstandard finish_reason strings to 'unknown', but a
    // complete stream still delivers usage in its final chunk — only the
    // combination of 'unknown' AND missing usage means truncation.
    expect(
      classifyStreamEndRecovery({
        aborted: false,
        finish: { finishReason: 'unknown', hasUsage: true },
        ...noYields,
      }),
    ).toBeNull()
  })
})

describe('streamFinishInfoOf', () => {
  it('counts any finite usage number as usage', () => {
    expect(
      streamFinishInfoOf({
        finishReason: 'stop',
        totalUsage: { outputTokens: 0 },
      }),
    ).toEqual({ finishReason: 'stop', hasUsage: true })
  })

  it('treats missing or NaN usage as absent', () => {
    expect(
      streamFinishInfoOf({ finishReason: 'unknown', totalUsage: {} }),
    ).toEqual({ finishReason: 'unknown', hasUsage: false })
    expect(
      streamFinishInfoOf({
        finishReason: 'unknown',
        totalUsage: { totalTokens: NaN },
      }),
    ).toEqual({ finishReason: 'unknown', hasUsage: false })
  })
})

describe('classifyThrownStreamRecovery', () => {
  it('classifies Bun socket-close exceptions as interrupted streams', () => {
    const error = new Error(
      'The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()',
    ) as Error & { code: string }
    error.code = 'ECONNRESET'

    expect(
      classifyThrownStreamRecovery({ aborted: false, error })?.source,
    ).toBe('stream-interrupted')
  })

  it('walks wrapped transport errors', () => {
    const cause = Object.assign(new Error('read failed'), {
      code: 'ConnectionClosed',
    })
    const error = new Error('Failed after 4 attempts', { cause })

    expect(
      classifyThrownStreamRecovery({ aborted: false, error })?.source,
    ).toBe('stream-interrupted')
  })

  it('does not recover cancellation or unrelated exceptions', () => {
    const networkError = Object.assign(new Error('read ECONNRESET'), {
      code: 'ECONNRESET',
    })
    expect(
      classifyThrownStreamRecovery({ aborted: true, error: networkError }),
    ).toBeNull()
    expect(
      classifyThrownStreamRecovery({
        aborted: false,
        error: new TypeError('Headers must be an object'),
      }),
    ).toBeNull()
  })
})
