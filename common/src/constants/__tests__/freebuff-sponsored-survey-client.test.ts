import { describe, expect, test } from 'bun:test'

import {
  createHttpSponsoredSurveyClient,
  isSponsoredAnswerReady,
  moveSponsoredRanking,
  sponsoredRewardLine,
  toggleSponsoredOption,
} from '../freebuff-sponsored-survey-client'

const MULTI = {
  id: 'q',
  position: 0,
  prompt: 'p',
  kind: 'multi',
  options: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'none', label: 'None', exclusive: true },
  ],
}
const SINGLE = { ...MULTI, kind: 'single' }

describe('sponsored survey client helpers', () => {
  test('toggle: exclusive clears the rest and vice versa', () => {
    expect(toggleSponsoredOption(MULTI, [], 'a')).toEqual(['a'])
    expect(toggleSponsoredOption(MULTI, ['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleSponsoredOption(MULTI, ['a', 'b'], 'none')).toEqual(['none'])
    expect(toggleSponsoredOption(MULTI, ['none'], 'a')).toEqual(['a'])
    expect(toggleSponsoredOption(MULTI, ['a'], 'a')).toEqual([])
    expect(toggleSponsoredOption(SINGLE, ['a'], 'b')).toEqual(['b'])
  })

  test('ready', () => {
    expect(isSponsoredAnswerReady(SINGLE, [])).toBe(false)
    expect(isSponsoredAnswerReady(SINGLE, ['a'])).toBe(true)
    expect(isSponsoredAnswerReady(SINGLE, ['a', 'b'])).toBe(false)
    expect(isSponsoredAnswerReady(MULTI, ['a', 'b'])).toBe(true)
    expect(isSponsoredAnswerReady(MULTI, ['a', 'none'])).toBe(false)
  })

  test('reward line only when there is a reward', () => {
    expect(sponsoredRewardLine(25)).toBe('Earn 5 hours')
    expect(sponsoredRewardLine(5)).toBe('Earn 1 hour')
    expect(sponsoredRewardLine(0)).toBeNull()
  })

  test('the HTTP client never rejects', async () => {
    const paths: string[] = []
    const client = createHttpSponsoredSurveyClient({
      get: async (path) => {
        paths.push(path)
        throw new Error('down')
      },
      post: async () => {
        throw new Error('down')
      },
    })
    expect(await client.getState('cli')).toEqual({ show: false })
    const url = new URL(paths[0]!, 'https://freebuff.test')
    expect(url.pathname).toBe('/api/sponsored-survey')
    expect(url.searchParams.get('surface')).toBe('cli')
    expect(url.searchParams.get('questionKinds')).toBe(
      'single,multi,ranking,text',
    )
    expect(
      await client.answer({
        action: 'answer',
        campaignId: 'c',
        questionId: 'q',
        optionIds: ['a'],
      }),
    ).toEqual({ ok: false, error: 'down' })
    expect(
      await client.dismiss({ action: 'dismiss', campaignId: 'c' }),
    ).toEqual({
      ok: false,
      error: 'down',
    })
  })

  test('ranking moves preserve all choices and stop at the boundaries', () => {
    const ids = ['a', 'b', 'c']
    expect(moveSponsoredRanking(ids, 2, -1)).toEqual(['a', 'c', 'b'])
    expect(moveSponsoredRanking(ids, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveSponsoredRanking(ids, 0, -1)).toEqual(ids)
    expect(moveSponsoredRanking(ids, 2, 1)).toEqual(ids)
    expect(ids).toEqual(['a', 'b', 'c'])
  })
})
