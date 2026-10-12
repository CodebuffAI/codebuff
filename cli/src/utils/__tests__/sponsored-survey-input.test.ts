import { expect, test } from 'bun:test'
import { sponsoredOfferToSurveyState } from '../sponsored-survey-api'
import {
  numberedOptions,
  profileSurveyInputForKey,
  transitionProfileSurvey,
} from '../profile-survey-machine'

const offer = {
  campaignId: 'c',
  sponsorName: 'Acme',
  resumeAt: 0,
  rewardFreebucks: 0,
  questions: [
    {
      id: 'q',
      prompt: 'Your feedback?',
      position: 0,
      kind: 'text',
      options: [],
    },
  ],
}

test('text entry needs explicit focus and respects bounds, deletion and cancellation', () => {
  let state = sponsoredOfferToSurveyState(offer, 0)!
  const context = () => ({
    question: state.questions[state.step]!,
    textEditing: state.textEditing,
  })
  expect(
    profileSurveyInputForKey({ name: 'a', sequence: 'a' }, context()),
  ).toBeNull()
  const apply = (input: Parameters<typeof transitionProfileSurvey>[1]) => {
    state = transitionProfileSurvey(state, input).state
  }
  apply(profileSurveyInputForKey({ name: 'return' }, context(), 1)!)
  expect(
    profileSurveyInputForKey({ name: 'c', ctrl: true }, context()),
  ).toBeNull()
  apply(profileSurveyInputForKey({ name: '1', sequence: '1' }, context(), 2)!)
  expect(state.textAnswer).toBe('1')
  apply({ type: 'text', text: '😀', now: 3 })
  apply(profileSurveyInputForKey({ name: 'backspace' }, context(), 4)!)
  expect(state.textAnswer).toBe('1')
  apply({ type: 'text', text: 'a'.repeat(2000), now: 5 })
  expect(state.textAnswer).toBe('1')
  apply({ type: 'escape', now: 6 })
  expect(state.status).toBe('asking')
  expect(state.textEditing).toBe(false)
  expect(state.textAnswer).toBe('1')
  apply({ type: 'enter', now: 7 })
  apply({ type: 'enter', now: 8 })
  expect(state.textAnswers?.q).toBe('1')
  expect(state.status).toBe('finishing')
})

test('ranking can reach all twelve options using digits and a–c', () => {
  let state = sponsoredOfferToSurveyState(
    {
      ...offer,
      questions: [
        {
          ...offer.questions[0]!,
          kind: 'ranking',
          options: Array.from({ length: 12 }, (_, i) => ({
            id: `o${i + 1}`,
            label: `Option ${i + 1}`,
          })),
        },
      ],
    },
    0,
  )!
  const question = state.questions[0]!
  expect(numberedOptions(question)).toHaveLength(12)
  for (const char of [
    'c',
    'b',
    'a',
    '9',
    '8',
    '7',
    '6',
    '5',
    '4',
    '3',
    '2',
    '1',
  ]) {
    const input = profileSurveyInputForKey(
      { name: char, sequence: char },
      { question },
      1000,
    )!
    state = transitionProfileSurvey(state, input).state
  }
  const result = transitionProfileSurvey(state, { type: 'enter', now: 3000 })
  expect(result.effects[0]).toMatchObject({
    optionIds: Array.from({ length: 12 }, (_, i) => `o${12 - i}`),
  })
})
