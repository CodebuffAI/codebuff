import { z } from 'zod/v4'
import type { SponsoredProposalRow } from './sponsored-proposal-view'
import type { SponsoredSurveyOffer } from '../constants/freebuff-sponsored-survey-client'

/** Only the ad's visible content and identifiers belong in a user report. */
export const AdReportSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    url: z
      .string()
      .trim()
      .max(4096)
      .refine((value) => {
        try {
          const url = new URL(value)
          return (
            (url.protocol === 'https:' || url.protocol === 'http:') &&
            !url.username &&
            !url.password
          )
        } catch {
          return false
        }
      }, 'Expected an HTTP or HTTPS destination')
      .optional(),
    adText: z.string().trim().max(6000).optional(),
    provider: z.string().trim().max(64).optional(),
    surface: z.string().trim().max(80).optional(),
    placementId: z.string().trim().max(160).optional(),
    impUrl: z.string().trim().max(4096).optional(),
    campaignId: z.string().trim().min(1).max(200).optional(),
    proposalId: z.string().trim().min(1).max(200).optional(),
    questionId: z.string().trim().min(1).max(200).optional(),
  })
  .refine(
    (report) => report.url || report.campaignId || report.proposalId,
    'A destination, campaign, or proposal is required',
  )

export type AdReport = z.infer<typeof AdReportSchema>

/** Select explicitly: ad objects can also carry private targeting context. */
export function toAdReport(ad: AdReport & { clickUrl?: string }): AdReport {
  return {
    title:
      (typeof ad.title === 'string' ? ad.title.trim().slice(0, 300) : '') ||
      'Untitled ad',
    // Some served creatives contain only a tracked destination. Copy it as
    // report data; reporting must never follow it or record an ad click.
    url: ad.url?.trim() || ad.clickUrl?.trim() || undefined,
    adText: ad.adText?.slice(0, 6000),
    provider: ad.provider,
    surface: ad.surface,
    placementId: ad.placementId,
    impUrl: ad.impUrl,
    campaignId: ad.campaignId,
    proposalId: ad.proposalId,
    questionId: ad.questionId,
  }
}

/** An offer need not have a destination until accepted. Never include run context. */
export function toSponsoredProposalAdReport(
  proposal: Pick<
    SponsoredProposalRow,
    'headline' | 'body' | 'advertiser_name' | 'advertiser_cta_url'
  > & { _id: string },
  surface: string,
): AdReport {
  return toAdReport({
    title: (
      proposal.headline || `Sponsored by ${proposal.advertiser_name}`
    ).slice(0, 300),
    adText: proposal.body.slice(0, 6000),
    url: proposal.advertiser_cta_url || undefined,
    provider: 'first_party',
    surface,
    placementId: 'sponsored-proposal',
    proposalId: proposal._id,
  })
}

/** Only the advertiser's question and choices, never the respondent's answers. */
export function toSponsoredSurveyAdReport(
  survey: Pick<SponsoredSurveyOffer, 'campaignId' | 'sponsorName'>,
  surface: string,
  question?: {
    id: string
    prompt: string
    options: readonly { label: string }[]
  },
): AdReport {
  return toAdReport({
    title: `Sponsored survey by ${survey.sponsorName}`.slice(0, 300),
    adText: question
      ? [question.prompt, ...question.options.map((option) => option.label)]
          .join('\n')
          .slice(0, 6000)
      : undefined,
    provider: 'first_party',
    surface,
    placementId: 'sponsored-survey',
    campaignId: survey.campaignId,
    questionId: question?.id,
  })
}
