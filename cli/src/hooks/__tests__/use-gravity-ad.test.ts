import { describe, expect, test } from 'bun:test'

import {
  claimAdImpression,
  isAnswerMessage,
  isInlineAdEligibleAnswer,
} from '../use-gravity-ad'

import type { ChatMessage } from '../../types/chat'

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'user-1',
  variant: 'user',
  content: 'hello',
  timestamp: '',
  ...over,
})

// Only genuine streamed LLM answers (id 'ai-…', top-level) receive
// interspersed ads — not bash echoes or system notices.
describe('isAnswerMessage', () => {
  const aiMsg = (over: Partial<ChatMessage>): ChatMessage =>
    msg({ id: 'ai-1', variant: 'ai', content: '', ...over })

  test('accepts a top-level streamed answer (even mid-stream)', () => {
    expect(isAnswerMessage(aiMsg({}))).toBe(true)
    expect(isAnswerMessage(aiMsg({ isComplete: false }))).toBe(true)
  })

  test('rejects bash echoes, system notices, and nested messages', () => {
    expect(isAnswerMessage(aiMsg({ id: 'bash-result-x' }))).toBe(false)
    expect(isAnswerMessage(aiMsg({ id: 'sys-1' }))).toBe(false)
    expect(isAnswerMessage(aiMsg({ parentId: 'ai-0' }))).toBe(false)
    expect(isAnswerMessage(msg({}))).toBe(false)
  })
})

describe('isInlineAdEligibleAnswer', () => {
  test('only accepts live response shells', () => {
    expect(
      isInlineAdEligibleAnswer(
        msg({
          id: 'ai-live',
          variant: 'ai',
          metadata: { allowInlineAds: true },
        }),
      ),
    ).toBe(true)
    expect(
      isInlineAdEligibleAnswer(msg({ id: 'ai-restored', variant: 'ai' })),
    ).toBe(false)
    expect(
      isInlineAdEligibleAnswer(
        msg({
          id: 'sys-1',
          variant: 'ai',
          metadata: { allowInlineAds: true },
        }),
      ),
    ).toBe(false)
  })
})

describe('claimAdImpression', () => {
  test('claims each distinct ad once even when its card is repeated', () => {
    const fired = new Set<string>()

    expect(claimAdImpression(fired, 'imp-1')).toBe(true)
    expect(claimAdImpression(fired, 'imp-2')).toBe(true)
    expect(claimAdImpression(fired, 'imp-1')).toBe(false)
    expect(fired).toEqual(new Set(['imp-1', 'imp-2']))
  })
})
