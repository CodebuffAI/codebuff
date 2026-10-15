import { z } from 'zod/v4'
import {
  SPONSORED_SURVEY_LIMITS,
  SPONSORED_SURVEY_MAX_QUESTIONS,
  SPONSORED_SURVEY_SPEEDS,
  sponsoredSurveyAdvertiserTargetingSchema,
  sponsoredSurveyLengthBucket,
  type SponsoredSurveyCountryTier,
  type SponsoredSurveyLengthBucket,
  type SponsoredSurveySpeed,
} from './freebuff-sponsored-survey'

export const surveyForecastQuerySchema = z.object({
  questions: z.coerce.number().int().min(1).max(SPONSORED_SURVEY_MAX_QUESTIONS),
  budgetCents: z.coerce
    .number()
    .int()
    .min(1)
    .max(SPONSORED_SURVEY_LIMITS.budgetCentsMax),
  days: z.coerce.number().int().min(1).max(90),
  speed: z.enum(SPONSORED_SURVEY_SPEEDS).default('standard'),
  countries: sponsoredSurveyAdvertiserTargetingSchema.shape.countries,
  countryMode: sponsoredSurveyAdvertiserTargetingSchema.shape.countryMode,
})
export type SurveyForecastInput = z.infer<typeof surveyForecastQuerySchema>
export const surveyForecastSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    minResponses: z.number().int().nonnegative(),
    maxResponses: z.number().int().nonnegative(),
    source: z.enum(['measured', 'fixture']),
  }),
  z.object({
    status: z.literal('unavailable'),
    reason: z.enum(['insufficient_data', 'custom_length']),
  }),
])
export type SurveyForecast = z.infer<typeof surveyForecastSchema>

export type SurveyForecastHistory = {
  audience: {
    country: string | null
    tier: SponsoredSurveyCountryTier
    users: number
  }[]
  samples: {
    campaignId: string
    bucket: SponsoredSurveyLengthBucket
    speed: SponsoredSurveySpeed
    days: number
    country: string | null
    completes: number
    spendCents: number
  }[]
}

/** Empirical interquartile range of comparable campaigns, limited by budget
 * and the recently active eligible audience. No synthetic completion rate or
 * global-country fallback: sparse markets explicitly have no forecast. */
export function surveyResponseForecast(
  input: SurveyForecastInput,
  history: SurveyForecastHistory | null,
  source: 'measured' | 'fixture' = 'measured',
): SurveyForecast {
  const bucket = sponsoredSurveyLengthBucket(input.questions)
  if (bucket === 'custom')
    return { status: 'unavailable', reason: 'custom_length' }
  const unavailable: SurveyForecast = {
    status: 'unavailable',
    reason: 'insufficient_data',
  }
  if (!history) return unavailable
  const included = (country: string | null) =>
    !input.countries ||
    (country !== null &&
      (input.countryMode === 'exclude'
        ? !input.countries.includes(country)
        : input.countries.includes(country)))
  const audience = history.audience
    .filter((row) => included(row.country))
    .reduce((sum, row) => sum + row.users, 0)
  const campaigns = new Map<
    string,
    { completes: number; spend: number; days: number }
  >()
  for (const row of history.samples) {
    if (
      row.bucket !== bucket ||
      row.speed !== input.speed ||
      !included(row.country) ||
      row.days <= 0
    )
      continue
    const current = campaigns.get(row.campaignId) ?? {
      completes: 0,
      spend: 0,
      days: row.days,
    }
    current.completes += row.completes
    current.spend += row.spendCents
    campaigns.set(row.campaignId, current)
  }
  const samples = [...campaigns.values()].filter(
    (row) => row.completes > 0 && row.spend > 0,
  )
  if (
    samples.length < 3 ||
    samples.reduce((sum, row) => sum + row.completes, 0) < 30 ||
    audience < 30
  )
    return unavailable
  const quantile = (values: number[], q: number) => {
    const sorted = values.sort((a, b) => a - b)
    const index = (sorted.length - 1) * q
    const low = Math.floor(index)
    return (
      sorted[low]! + (sorted[Math.ceil(index)]! - sorted[low]!) * (index - low)
    )
  }
  const costs = samples.map((row) => row.spend / row.completes)
  const rates = [...campaigns.values()].map((row) => row.completes / row.days)
  const minResponses = Math.max(
    0,
    Math.floor(
      Math.min(
        input.budgetCents / quantile(costs, 0.75),
        quantile(rates, 0.25) * input.days,
        audience,
      ),
    ),
  )
  const maxResponses = Math.max(
    minResponses,
    Math.floor(
      Math.min(
        input.budgetCents / quantile(costs, 0.25),
        quantile(rates, 0.75) * input.days,
        audience,
      ),
    ),
  )
  return { status: 'ready', minResponses, maxResponses, source }
}
