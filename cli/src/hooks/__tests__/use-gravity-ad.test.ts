import { describe, expect, test } from 'bun:test'

import {
  computeInlineAdAdditions,
  inlineAdAnchorIds,
  isCompletedAnswer,
} from '../use-gravity-ad'

import type { AdResponse, PlacedAd } from '../use-gravity-ad'
import type { ChatMessage } from '../../types/chat'

// Inline ads anchor to completed assistant answers: by default the first one
// (offset 0), then every other one after it (step 2). The argument is the
// ordered list of those answers' message ids.
describe('inlineAdAnchorIds', () => {
  test('places nothing before the first completed answer', () => {
    expect(inlineAdAnchorIds([])).toEqual([])
  })

  test('places the first ad right after the first completed answer', () => {
    expect(inlineAdAnchorIds(['a'])).toEqual(['a'])
    expect(inlineAdAnchorIds(['a', 'b'])).toEqual(['a'])
  })

  test('then spaces one ad every other completed answer', () => {
    expect(inlineAdAnchorIds(['a', 'b', 'c'])).toEqual(['a', 'c'])
    expect(inlineAdAnchorIds(['a', 'b', 'c', 'd'])).toEqual(['a', 'c'])
    expect(inlineAdAnchorIds(['a', 'b', 'c', 'd', 'e'])).toEqual(['a', 'c', 'e'])
  })

  test('honors custom pacing knobs', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    // Delay the first ad and widen the spacing.
    expect(inlineAdAnchorIds(ids, { firstOffset: 1, step: 3 })).toEqual([
      'b',
      'e',
    ])
    // An ad after every completed answer.
    expect(inlineAdAnchorIds(ids, { step: 1 })).toEqual(ids)
    // A non-positive step is clamped to 1 (never loops forever).
    expect(inlineAdAnchorIds(['a', 'b'], { step: 0 })).toEqual(['a', 'b'])
  })
})

// Only genuine streamed LLM answers (id 'ai-…', completed, top-level) anchor
// ads — not bash echoes, system notices, mode dividers, or in-flight turns.
describe('isCompletedAnswer', () => {
  const msg = (over: Partial<ChatMessage>): ChatMessage => ({
    id: 'ai-1',
    variant: 'ai',
    content: '',
    timestamp: '',
    isComplete: true,
    ...over,
  })

  test('accepts a completed top-level streamed answer', () => {
    expect(isCompletedAnswer(msg({}))).toBe(true)
  })

  test('rejects a still-streaming answer', () => {
    expect(isCompletedAnswer(msg({ isComplete: false }))).toBe(false)
  })

  test('rejects bash `!command` echoes and system notices', () => {
    expect(isCompletedAnswer(msg({ id: 'bash-result-x' }))).toBe(false)
    expect(isCompletedAnswer(msg({ id: 'sys-1', isComplete: undefined }))).toBe(
      false,
    )
  })

  test('rejects non-ai variants and nested (sub-agent) messages', () => {
    expect(isCompletedAnswer(msg({ variant: 'user' }))).toBe(false)
    expect(isCompletedAnswer(msg({ parentId: 'ai-0' }))).toBe(false)
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

/** A drawAd that cycles a fixed pool, like nextFromChoiceCache does. */
function cyclingDraw(pool: AdResponse[]): () => AdResponse | null {
  let cursor = 0
  return () => {
    if (pool.length === 0) return null
    return pool[cursor++ % pool.length]!
  }
}

const anchors = (placed: PlacedAd[]): string[] =>
  placed.map((p) => p.afterMessageId)

describe('computeInlineAdAdditions', () => {
  test('first ad lands right after the first completed answer', () => {
    const additions = computeInlineAdAdditions({
      completedAnswerIds: ['a'],
      placedAds: [],
      drawAd: cyclingDraw([ad(1)]),
    })
    expect(anchors(additions)).toEqual(['a'])
    expect(additions[0]!.ad.impUrl).toBe('imp-1')
  })

  test('spaces ads every 2 answers across a longer transcript', () => {
    const additions = computeInlineAdAdditions({
      completedAnswerIds: ['a', 'b', 'c', 'd', 'e'],
      placedAds: [],
      drawAd: cyclingDraw([ad(1), ad(2), ad(3), ad(4)]),
    })
    expect(anchors(additions)).toEqual(['a', 'c', 'e'])
  })

  test('forwards custom pacing to the anchor calc', () => {
    const additions = computeInlineAdAdditions({
      completedAnswerIds: ['a', 'b', 'c', 'd', 'e'],
      placedAds: [],
      drawAd: cyclingDraw([ad(1), ad(2)]),
      pacing: { firstOffset: 1, step: 3 },
    })
    expect(anchors(additions)).toEqual(['b', 'e'])
  })

  test('is idempotent across re-renders — only new anchors are added', () => {
    const draw = cyclingDraw([ad(1), ad(2), ad(3)])

    // First pass: one completed answer -> one ad at 'a'.
    let placed = computeInlineAdAdditions({
      completedAnswerIds: ['a'],
      placedAds: [],
      drawAd: draw,
    })
    expect(anchors(placed)).toEqual(['a'])

    // Re-render with the SAME transcript adds nothing (no anchor churn).
    expect(
      computeInlineAdAdditions({
        completedAnswerIds: ['a'],
        placedAds: placed,
        drawAd: draw,
      }),
    ).toEqual([])

    // Transcript grows to a new spaced anchor -> only 'c' is added, 'a' stays put.
    const next = computeInlineAdAdditions({
      completedAnswerIds: ['a', 'b', 'c'],
      placedAds: placed,
      drawAd: draw,
    })
    expect(anchors(next)).toEqual(['c'])
  })

  test('never shows the same ad twice — stops when distinct ads run out', () => {
    // Pool of 2 ads, 3 due anchors -> only 2 get placed, no repeat.
    const additions = computeInlineAdAdditions({
      completedAnswerIds: ['a', 'b', 'c', 'd', 'e'],
      placedAds: [],
      drawAd: cyclingDraw([ad(1), ad(2)]),
    })
    expect(additions.map((p) => p.ad.impUrl)).toEqual(['imp-1', 'imp-2'])
    expect(anchors(additions)).toEqual(['a', 'c'])
  })

  test('does not reuse an ad already placed in a prior pass', () => {
    // 'a' already holds imp-1; the only cached ad is imp-1 -> 'c' stays empty.
    const placed: PlacedAd[] = [{ ad: ad(1), afterMessageId: 'a' }]
    const blocked = computeInlineAdAdditions({
      completedAnswerIds: ['a', 'b', 'c'],
      placedAds: placed,
      drawAd: cyclingDraw([ad(1)]),
    })
    expect(blocked).toEqual([])

    // Once a fresh ad is cached, 'c' fills with the distinct one.
    const filled = computeInlineAdAdditions({
      completedAnswerIds: ['a', 'b', 'c'],
      placedAds: placed,
      drawAd: cyclingDraw([ad(1), ad(2)]),
    })
    expect(anchors(filled)).toEqual(['c'])
    expect(filled[0]!.ad.impUrl).toBe('imp-2')
  })

  test('stops at an empty cache and fills the rest once it refills', () => {
    // Cache empty on the first pass: nothing is placed yet.
    const emptyPass = computeInlineAdAdditions({
      completedAnswerIds: ['a', 'b', 'c'],
      placedAds: [],
      drawAd: () => null,
    })
    expect(emptyPass).toEqual([])

    // Later pass (cache filled): both due anchors get filled.
    const filledPass = computeInlineAdAdditions({
      completedAnswerIds: ['a', 'b', 'c'],
      placedAds: emptyPass,
      drawAd: cyclingDraw([ad(1), ad(2)]),
    })
    expect(anchors(filledPass)).toEqual(['a', 'c'])
  })
})
