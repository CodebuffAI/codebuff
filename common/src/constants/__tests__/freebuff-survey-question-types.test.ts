import { describe, expect, test } from 'bun:test'
import {
  isValidSponsoredSurveyAnswer,
  sponsoredSurveyQuestionSchema,
  SPONSORED_SURVEY_LIMITS,
} from '../freebuff-sponsored-survey'

const ranking = {
  prompt: 'Rank these features',
  kind: 'ranking',
  options: [
    { id: 'a', label: 'Search' },
    { id: 'b', label: 'Chat' },
    { id: 'c', label: 'Export' },
  ],
}
const text = { prompt: 'What would you improve?', kind: 'text', options: [] }

describe('ranking and written survey answers', () => {
  test('validates all four question types and their option requirements', () => {
    for (const kind of ['single', 'multi', 'ranking']) {
      expect(
        sponsoredSurveyQuestionSchema.safeParse({ ...ranking, kind }).success,
      ).toBe(true)
      expect(
        sponsoredSurveyQuestionSchema.safeParse({
          ...ranking,
          kind,
          options: [],
        }).success,
      ).toBe(false)
    }
    expect(sponsoredSurveyQuestionSchema.safeParse(text).success).toBe(true)
    expect(
      sponsoredSurveyQuestionSchema.safeParse({ ...ranking, kind: 'text' })
        .success,
    ).toBe(false)
    expect(
      sponsoredSurveyQuestionSchema.safeParse({
        ...ranking,
        options: [
          { ...ranking.options[0], exclusive: true },
          ranking.options[1],
        ],
      }).success,
    ).toBe(false)
  })

  test('rankings must be complete permutations with no text attached', () => {
    expect(isValidSponsoredSurveyAnswer(ranking, ['c', 'a', 'b'])).toBe(true)
    for (const ids of [
      [],
      ['a'],
      ['a', 'a', 'b'],
      ['a', 'b', 'unknown'],
      ['a', 'b', 'c', 'a'],
    ]) {
      expect(isValidSponsoredSurveyAnswer(ranking, ids)).toBe(false)
    }
    expect(
      isValidSponsoredSurveyAnswer(ranking, ['c', 'a', 'b'], 'extra'),
    ).toBe(false)
    expect(
      isValidSponsoredSurveyAnswer(
        { ...ranking, kind: 'single' },
        ['a'],
        'extra',
      ),
    ).toBe(false)
  })

  test('text answers must be nonblank, bounded and have no selected options', () => {
    expect(
      isValidSponsoredSurveyAnswer(
        text,
        [],
        '  Better search\nwith filters.  ',
      ),
    ).toBe(true)
    expect(
      isValidSponsoredSurveyAnswer(
        text,
        [],
        'a'.repeat(SPONSORED_SURVEY_LIMITS.textAnswerMax),
      ),
    ).toBe(true)
    for (const answer of [
      undefined,
      '',
      ' \n\t',
      'bad\u0000text',
      'a'.repeat(SPONSORED_SURVEY_LIMITS.textAnswerMax + 1),
    ]) {
      expect(isValidSponsoredSurveyAnswer(text, [], answer)).toBe(false)
    }
    expect(isValidSponsoredSurveyAnswer(text, ['a'], 'Better search')).toBe(
      false,
    )
  })
})
