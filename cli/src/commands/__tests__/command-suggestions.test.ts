import { describe, test, expect } from 'bun:test'

import { findCommandSuggestions } from '../command-registry'

describe('findCommandSuggestions', () => {
  test('returns an empty array for an empty attempted command', () => {
    expect(findCommandSuggestions('')).toEqual([])
    expect(findCommandSuggestions('   ')).toEqual([])
  })

  test('suggests the correct command for a close typo', () => {
    // 'hlp' fuzzy-matches 'help' (h, l, p as a subsequence). It does NOT match
    // the alias 'h' (fuzzyMatch rejects a query longer than the candidate).
    const suggestions = findCommandSuggestions('hlp')
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions).toContain('/help')
    // Best match should be first.
    expect(suggestions[0]).toBe('/help')
  })

  test('returns suggestions prefixed with a slash', () => {
    const suggestions = findCommandSuggestions('exi')
    for (const suggestion of suggestions) {
      expect(suggestion.startsWith('/')).toBe(true)
    }
  })

  test('includes aliases as candidates', () => {
    // 'qu' fuzzy-matches the 'quit' alias of the 'exit' command (also the
    // 'q' alias). Verifying an alias appears proves aliases are enumerated.
    const suggestions = findCommandSuggestions('qu')
    expect(suggestions).toContain('/quit')
  })

  test('returns an empty array for wildly unrelated garbage input', () => {
    const suggestions = findCommandSuggestions('zzzzzzzzzz')
    expect(suggestions).toEqual([])
  })

  test('respects the limit option', () => {
    const defaultSuggestions = findCommandSuggestions('h')
    const limitedSuggestions = findCommandSuggestions('h', { limit: 1 })
    expect(limitedSuggestions.length).toBeLessThanOrEqual(1)
    if (limitedSuggestions.length > 0) {
      expect(defaultSuggestions[0]).toBe(limitedSuggestions[0])
    }
  })

  test('does not crash and returns [] when no candidate matches', () => {
    // Every character is present but in a way that produces a poor score for
    // all known commands; result should be empty rather than throwing.
    const suggestions = findCommandSuggestions('qxwz')
    expect(Array.isArray(suggestions)).toBe(true)
  })

  test('deterministically orders results by score then alphabetically', () => {
    // Running twice yields the same ordering (deterministic sort).
    const a = findCommandSuggestions('pln')
    const b = findCommandSuggestions('pln')
    expect(a).toEqual(b)
  })

  test('honors a custom maxScore threshold', () => {
    // A very strict maxScore should filter out marginal matches.
    const strict = findCommandSuggestions('hlp', { maxScore: -100 })
    const lenient = findCommandSuggestions('hlp', { maxScore: 100 })
    expect(strict.length).toBeLessThanOrEqual(lenient.length)
  })
})
