import { describe, test, expect } from 'bun:test'

import { filterAndScorePrompts } from '../prompt-history-search-screen'

describe('filterAndScorePrompts', () => {
  test('empty query returns all items capped at the limit', () => {
    const prompts = [
      'first prompt',
      'second prompt',
      'third prompt',
      '!ls -la',
      'fix the bug in auth',
    ]
    const result = filterAndScorePrompts(prompts, '', 3)
    // Empty query preserves input order (most-recent-first) and caps at limit.
    expect(result).toEqual(['first prompt', 'second prompt', 'third prompt'])

    // Limit larger than the list returns everything.
    const all = filterAndScorePrompts(prompts, '', 200)
    expect(all).toEqual(prompts)
  })

  test('a query that is a subsequence filters and scores correctly (best match first)', () => {
    const prompts = [
      'fix the authentication bug',
      'fix bug',
      'refactor the utils module',
      'fix the broken auth tests',
    ]
    // 'fix auth' is a subsequence of several prompts. The most compact,
    // best-scoring match ('fix the broken auth tests' or
    // 'fix the authentication bug') should rank ahead of 'fix bug' which
    // does not contain 'auth' at all and is filtered out.
    const result = filterAndScorePrompts(prompts, 'fix auth', 10)

    // 'fix bug' has no 'auth' -> excluded.
    expect(result).not.toContain('fix bug')
    // 'refactor the utils module' has no 'fix'/'auth' subsequence -> excluded.
    expect(result).not.toContain('refactor the utils module')

    // Remaining two both match; best score comes first.
    expect(result).toHaveLength(2)
    expect(result).toContain('fix the authentication bug')
    expect(result).toContain('fix the broken auth tests')

    // Verify ordering: the first result has a better (lower) fuzzyMatch score.
    const { fuzzyMatch } = require('../../utils/fuzzy-match')
    const firstScore = fuzzyMatch(result[0], 'fix auth')!.score
    const secondScore = fuzzyMatch(result[1], 'fix auth')!.score
    expect(firstScore).toBeLessThanOrEqual(secondScore)
  })

  test('a query matching no prompts returns an empty list', () => {
    const prompts = ['hello world', 'fix the bug', 'run tests']
    const result = filterAndScorePrompts(prompts, 'zzzqqqxxx', 10)
    expect(result).toEqual([])
  })

  test('respects the limit when there are more matches than the cap', () => {
    const prompts = Array.from({ length: 50 }, (_, i) => `prompt ${i}`)
    const result = filterAndScorePrompts(prompts, 'prompt', 5)
    expect(result).toHaveLength(5)
  })

  test('query is case-insensitive', () => {
    const prompts = ['Fix The Bug', 'run tests']
    const lower = filterAndScorePrompts(prompts, 'fix', 10)
    const upper = filterAndScorePrompts(prompts, 'FIX', 10)
    expect(lower).toEqual(upper)
    expect(lower).toContain('Fix The Bug')
  })

  test('handles prompts with bash command prefix as-is', () => {
    const prompts = ['!git status', '!ls -la', 'normal prompt']
    const result = filterAndScorePrompts(prompts, 'git', 10)
    expect(result).toEqual(['!git status'])
  })
})
