import { expect, test } from 'bun:test'
import {
  surveyForecastQuerySchema,
  surveyResponseForecast,
  type SurveyForecastHistory,
  type SurveyForecastInput,
} from '../freebuff-survey-forecast'

const input: SurveyForecastInput = {
  questions: 3,
  budgetCents: 50_000,
  days: 14,
  speed: 'standard',
}
const history: SurveyForecastHistory = {
  audience: [
    { country: 'US', tier: 'tier1', users: 1000 },
    { country: 'IN', tier: 'tier4', users: 5000 },
  ],
  samples: [1, 2, 3, 4].flatMap((n) => [
    {
      campaignId: `s${n}`,
      bucket: 'S' as const,
      speed: 'standard' as const,
      days: 14,
      country: 'US',
      completes: n * 10,
      spendCents: n * 5000,
    },
    {
      campaignId: `s${n}`,
      bucket: 'S' as const,
      speed: 'standard' as const,
      days: 14,
      country: 'IN',
      completes: n * 100,
      spendCents: n * 5000,
    },
  ]),
}

function range(over: Partial<SurveyForecastInput> = {}, data = history) {
  const result = surveyResponseForecast({ ...input, ...over }, data)
  if (result.status !== 'ready') throw new Error('Expected a forecast')
  expect(result.minResponses).toBeLessThanOrEqual(result.maxResponses)
  return result
}

test('budget limits responses, increasing duration cannot exceed the available budget', () => {
  const cheap = range({ budgetCents: 1000 })
  expect(cheap.maxResponses).toBeLessThan(range().maxResponses)
  expect(range({ budgetCents: 1000, days: 90 }).maxResponses).toBe(
    cheap.maxResponses,
  )
})
test('geography and duration change expected reach', () => {
  expect(range({ countries: ['US'] }).maxResponses).toBeLessThan(
    range({ countries: ['IN'] }).maxResponses,
  )
  expect(range({ days: 1 }).maxResponses).toBeLessThan(
    range({ days: 14 }).maxResponses,
  )
})
test('the range is capped by the unique recently active audience', () => {
  expect(
    range(
      { budgetCents: 1_000_000, days: 90 },
      { ...history, audience: [{ country: 'US', tier: 'tier1', users: 40 }] },
    ).maxResponses,
  ).toBe(40)
})
test('zero-response comparable campaigns lower the forecast instead of disappearing', () => {
  const zeros = Array.from({ length: 10 }, (_, n) => ({
    ...history.samples[0]!,
    campaignId: `zero-${n}`,
    completes: 0,
    spendCents: 0,
  }))
  expect(
    range({}, { ...history, samples: [...history.samples, ...zeros] })
      .minResponses,
  ).toBe(0)
})
test('sparse markets, missing history, other buckets and speeds have no fabricated range', () => {
  for (const candidate of [
    { countries: ['GB'] },
    { questions: 8 },
    { speed: 'expedited' as const },
  ])
    expect(surveyResponseForecast({ ...input, ...candidate }, history)).toEqual(
      { status: 'unavailable', reason: 'insufficient_data' },
    )
  expect(surveyResponseForecast(input, null).status).toBe('unavailable')
  expect(
    surveyResponseForecast(input, {
      ...history,
      samples: history.samples.slice(0, 4),
    }).status,
  ).toBe('unavailable')
})
test('custom pricing does not invent an estimate; lab forecasts are labeled', () => {
  expect(surveyResponseForecast({ ...input, questions: 21 }, history)).toEqual({
    status: 'unavailable',
    reason: 'custom_length',
  })
  expect(surveyResponseForecast(input, history, 'fixture')).toMatchObject({
    status: 'ready',
    source: 'fixture',
  })
})
test('request bounds reject zero or unbounded budgets and durations', () => {
  for (const candidate of [
    { days: 0 },
    { days: 91 },
    { budgetCents: 0 },
    { questions: 41 },
    { countries: ['us'] },
  ])
    expect(
      surveyForecastQuerySchema.safeParse({ ...input, ...candidate }).success,
    ).toBe(false)
})

test('excluding a country forecasts only the remaining known audience', () => {
  expect(range({ countries: ['US'], countryMode: 'exclude' })).toEqual(
    range({ countries: ['IN'] }),
  )
})
