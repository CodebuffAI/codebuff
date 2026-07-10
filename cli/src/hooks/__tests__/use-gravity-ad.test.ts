import { describe, expect, test } from 'bun:test'

import {
  claimAdImpression,
  isAnswerMessage,
  isInlineAdEligibleAnswer,
} from '../use-gravity-ad'
import {
  responseAdNodePositions,
  responseAdSlotCount,
  RESPONSE_AD_NODE_STEP,
} from '../../utils/response-ad-positions'

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

describe('responseAdNodePositions', () => {
  test('places nothing in a response too short to intersperse', () => {
    expect(responseAdNodePositions({ nodeCount: 0, adCount: 3 })).toEqual([])
    expect(responseAdNodePositions({ nodeCount: 1, adCount: 3 })).toEqual([])
    // Two nodes: the slot after node 1 would trail the response, so skip it.
    expect(
      responseAdNodePositions({ nodeCount: 2, adCount: 3, step: 2 }),
    ).toEqual([])
  })

  test('spaces ads every STEP nodes, strictly between nodes', () => {
    expect(
      responseAdNodePositions({ nodeCount: 3, adCount: 4, step: 2 }),
    ).toEqual([1])
    expect(
      responseAdNodePositions({ nodeCount: 5, adCount: 4, step: 2 }),
    ).toEqual([1, 3])
    expect(
      responseAdNodePositions({ nodeCount: 7, adCount: 4, step: 2 }),
    ).toEqual([1, 3, 5])
    expect(
      responseAdNodePositions({ nodeCount: 9, adCount: 4, step: 2 }),
    ).toEqual([1, 3, 5, 7])
  })

  test('default step offers one slot per couple of rendered nodes', () => {
    expect(RESPONSE_AD_NODE_STEP).toBe(2)
    expect(responseAdNodePositions({ nodeCount: 2, adCount: 4 })).toEqual([])
    expect(responseAdNodePositions({ nodeCount: 3, adCount: 4 })).toEqual([1])
    expect(responseAdNodePositions({ nodeCount: 5, adCount: 4 })).toEqual([
      1, 3,
    ])
    expect(responseAdNodePositions({ nodeCount: 9, adCount: 4 })).toEqual([
      1, 3, 5, 7,
    ])
  })

  test('eligible display slots are not capped at eight', () => {
    expect(responseAdSlotCount({ nodeCount: 2 })).toBe(0)
    expect(responseAdSlotCount({ nodeCount: 3 })).toBe(1)
    expect(responseAdSlotCount({ nodeCount: 21 })).toBe(10)
    expect(responseAdNodePositions({ nodeCount: 21, adCount: 10 })).toEqual([
      1, 3, 5, 7, 9, 11, 13, 15, 17, 19,
    ])
  })

  test('never places more ads than provided', () => {
    expect(
      responseAdNodePositions({ nodeCount: 20, adCount: 2, step: 2 }),
    ).toEqual([1, 3])
    expect(responseAdNodePositions({ nodeCount: 20, adCount: 0 })).toEqual([])
  })

  test('positions are stable as the streaming response appends nodes', () => {
    // Every earlier placement stays put as nodeCount grows.
    let prev: number[] = []
    for (let n = 0; n <= 12; n++) {
      const next = responseAdNodePositions({
        nodeCount: n,
        adCount: 3,
        step: RESPONSE_AD_NODE_STEP,
      })
      expect(next.slice(0, prev.length)).toEqual(prev)
      prev = next
    }
  })

  test('clamps a non-positive step to 1', () => {
    expect(
      responseAdNodePositions({ nodeCount: 4, adCount: 3, step: 0 }),
    ).toEqual([0, 1, 2])
  })
})
