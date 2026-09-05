import { describe, expect, test } from 'bun:test'

import {
  accentSpanIssue,
  accentWordCandidates,
  countAccentSpans,
  hasAccentSpan,
  setAccentWord,
  splitAccentSpan,
  stripAccentSpan,
} from '../ads/accent-span'

describe('splitAccentSpan', () => {
  test('splits the mockup headline around its accent', () => {
    expect(splitAccentSpan('Your next idea. *Live.*')).toEqual({
      before: 'Your next idea. ',
      accent: 'Live.',
      after: '',
      plain: 'Your next idea. Live.',
    })
  })

  test('an accent in the middle keeps both sides', () => {
    const parts = splitAccentSpan('Ship *fast* today')
    expect(parts.before).toBe('Ship ')
    expect(parts.accent).toBe('fast')
    expect(parts.after).toBe(' today')
  })

  test('a title with no markup is entirely plain', () => {
    expect(splitAccentSpan('Ship faster with Acme')).toEqual({
      before: 'Ship faster with Acme',
      accent: '',
      after: '',
      plain: 'Ship faster with Acme',
    })
  })

  test('answers "no accent" for a title it will not vouch for', () => {
    // Two spans are refused at the console. A row that predates the rule must
    // still draw — as ordinary copy, never as markup.
    const parts = splitAccentSpan('*Two* accents *here*')
    expect(parts.accent).toBe('')
    expect(parts.before).toBe('Two accents here')
    expect(parts.plain).not.toContain('*')
  })

  test('is stable across calls (no leaked regex lastIndex)', () => {
    const title = 'Your next idea. *Live.*'
    expect(splitAccentSpan(title)).toEqual(splitAccentSpan(title))
    expect(hasAccentSpan(title)).toBeTrue()
    expect(hasAccentSpan(title)).toBeTrue()
  })
})

describe('stripAccentSpan', () => {
  test('every non-accent surface receives the plain string', () => {
    expect(stripAccentSpan('Your next idea. *Live.*')).toBe(
      'Your next idea. Live.',
    )
    expect(stripAccentSpan('*Two* accents *here*')).toBe('Two accents here')
  })

  test('leaves a lone asterisk the advertiser meant to write', () => {
    expect(stripAccentSpan('3 * 4 faster')).toBe('3 * 4 faster')
  })

  test('counts spans', () => {
    expect(countAccentSpans('none')).toBe(0)
    expect(countAccentSpans('*one*')).toBe(1)
    expect(countAccentSpans('*one* and *two*')).toBe(2)
  })
})

describe('accentSpanIssue', () => {
  test('accepts none and exactly one', () => {
    expect(accentSpanIssue('Ship faster')).toBeNull()
    expect(accentSpanIssue('Your next idea. *Live.*')).toBeNull()
  })

  test('rejects a title with two spans, with a message', () => {
    const issue = accentSpanIssue('*Two* accents *here*')
    expect(issue).toContain('one word only')
  })

  test('rejects an unclosed span', () => {
    expect(accentSpanIssue('Your next idea. *Live.')).toContain(
      'second asterisk',
    )
  })
})

describe('setAccentWord', () => {
  test('accents the first whole-word occurrence', () => {
    expect(setAccentWord('Live it live', 'Live')).toBe('*Live* it live')
  })

  test('replaces an existing accent rather than adding a second', () => {
    expect(setAccentWord('Your next idea. *Live.*', 'idea.')).toBe(
      'Your next *idea.* Live.',
    )
    expect(countAccentSpans(setAccentWord('*a* b c', 'c'))).toBe(1)
  })

  test('clearing removes the markers', () => {
    expect(setAccentWord('Your next idea. *Live.*', null)).toBe(
      'Your next idea. Live.',
    )
  })

  test('a word the title does not contain leaves the plain title alone', () => {
    expect(setAccentWord('Ship faster', 'nope')).toBe('Ship faster')
  })

  test('candidates keep punctuation attached, as the mockup does', () => {
    expect(accentWordCandidates('Your next idea. *Live.*')).toEqual([
      { text: 'Your', at: 0 },
      { text: 'next', at: 5 },
      { text: 'idea.', at: 10 },
      { text: 'Live.', at: 16 },
    ])
  })
})
