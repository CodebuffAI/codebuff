import { describe, expect, test } from 'bun:test'

import {
  computeResponseAds,
  isAnswerMessage,
  isPromptMessage,
} from '../use-gravity-ad'
import {
  responseAdNodePositions,
  RESPONSE_AD_NODE_STEP,
} from '../../utils/response-ad-positions'

import type { AdResponse, PromptAdBatch } from '../use-gravity-ad'
import type { ChatMessage } from '../../types/chat'

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'user-1',
  variant: 'user',
  content: 'hello',
  timestamp: '',
  ...over,
})

// Batch auctions are triggered by (and the first ad is anchored to) genuine
// user prompts — not bash `!command` echoes or slash-command echoes.
describe('isPromptMessage', () => {
  test('accepts a top-level user prompt', () => {
    expect(isPromptMessage(msg({}))).toBe(true)
  })

  test('rejects bash command echoes (metadata.bashCwd)', () => {
    expect(
      isPromptMessage(msg({ metadata: { bashCwd: '/tmp' } })),
    ).toBe(false)
  })

  test('rejects slash-command echoes', () => {
    expect(isPromptMessage(msg({ content: '/theme' }))).toBe(false)
    expect(isPromptMessage(msg({ content: '  /help' }))).toBe(false)
  })

  test('rejects non-user variants and nested messages', () => {
    expect(isPromptMessage(msg({ variant: 'ai' }))).toBe(false)
    expect(isPromptMessage(msg({ parentId: 'ai-0' }))).toBe(false)
  })
})

// Only genuine streamed LLM answers (id 'ai-…', top-level) receive the
// interspersed remainder of a prompt batch — not bash echoes or system notices.
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

// A fake ad; only impUrl matters for identity in these assertions.
const ad = (n: number): AdResponse => ({
  adText: `ad ${n}`,
  title: `title ${n}`,
  cta: 'cta',
  url: `https://example.com/${n}`,
  favicon: '',
  clickUrl: `https://example.com/click/${n}`,
  impUrl: `imp-${n}`,
  provider: 'gravity',
})

const prompt = (id: string): ChatMessage => msg({ id })
const answer = (id: string): ChatMessage =>
  msg({ id, variant: 'ai', content: '' })

describe('computeResponseAds', () => {
  const batch = (promptMessageId: string, ...ns: number[]): PromptAdBatch => ({
    promptMessageId,
    ads: ns.map(ad),
  })

  test('hands the whole batch to the answer that follows the prompt', () => {
    const responseAds = computeResponseAds({
      messages: [prompt('user-1'), answer('ai-1')],
      batches: [batch('user-1', 1, 2, 3, 4)],
    })
    expect(responseAds).toEqual({ 'ai-1': [ad(1), ad(2), ad(3), ad(4)] })
  })

  test('assigns nothing until the answer message exists', () => {
    const responseAds = computeResponseAds({
      messages: [prompt('user-1')],
      batches: [batch('user-1', 1, 2, 3, 4)],
    })
    expect(responseAds).toEqual({})
  })

  test('keeps each batch scoped to its own exchange', () => {
    const responseAds = computeResponseAds({
      messages: [
        prompt('user-1'),
        answer('ai-1'),
        prompt('user-2'),
        answer('ai-2'),
      ],
      batches: [batch('user-1', 1, 2), batch('user-2', 3, 4)],
    })
    expect(responseAds).toEqual({
      'ai-1': [ad(1), ad(2)],
      'ai-2': [ad(3), ad(4)],
    })
  })

  test('empty batches assign nothing', () => {
    const responseAds = computeResponseAds({
      messages: [prompt('user-1'), answer('ai-1')],
      batches: [batch('user-1')],
    })
    expect(responseAds).toEqual({})
  })

  test('skips bash echoes and system notices when finding the answer', () => {
    const responseAds = computeResponseAds({
      messages: [
        prompt('user-1'),
        msg({ id: 'sys-1', variant: 'ai', content: 'notice' }),
        answer('ai-1'),
      ],
      batches: [batch('user-1', 1, 2)],
    })
    expect(responseAds).toEqual({ 'ai-1': [ad(1), ad(2)] })
  })

  test('a new prompt clears any unconsumed ads', () => {
    // user-1's ads never found an answer; they must not leak into user-2's
    // exchange (whose own batch is absent here).
    const responseAds = computeResponseAds({
      messages: [prompt('user-1'), prompt('user-2'), answer('ai-1')],
      batches: [batch('user-1', 1, 2)],
    })
    expect(responseAds).toEqual({})
  })

  test('is a pure function of transcript + batches (stable across re-renders)', () => {
    const args = {
      messages: [prompt('user-1'), answer('ai-1')],
      batches: [batch('user-1', 1, 2, 3, 4)],
    }
    expect(computeResponseAds(args)).toEqual(computeResponseAds(args))
  })
})

describe('responseAdNodePositions', () => {
  test('places nothing in a response too short to intersperse', () => {
    expect(
      responseAdNodePositions({ nodeCount: 0, adCount: 3 }),
    ).toEqual([])
    expect(
      responseAdNodePositions({ nodeCount: 1, adCount: 3 }),
    ).toEqual([])
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

  test('default step keeps ads sparse: one per RESPONSE_AD_NODE_STEP nodes', () => {
    expect(RESPONSE_AD_NODE_STEP).toBe(4)
    expect(responseAdNodePositions({ nodeCount: 4, adCount: 4 })).toEqual([])
    expect(responseAdNodePositions({ nodeCount: 5, adCount: 4 })).toEqual([3])
    expect(responseAdNodePositions({ nodeCount: 9, adCount: 4 })).toEqual([
      3, 7,
    ])
    expect(responseAdNodePositions({ nodeCount: 17, adCount: 4 })).toEqual([
      3, 7, 11, 15,
    ])
  })

  test('never places more ads than provided', () => {
    expect(
      responseAdNodePositions({ nodeCount: 20, adCount: 2, step: 2 }),
    ).toEqual([1, 3])
    expect(
      responseAdNodePositions({ nodeCount: 20, adCount: 0 }),
    ).toEqual([])
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
