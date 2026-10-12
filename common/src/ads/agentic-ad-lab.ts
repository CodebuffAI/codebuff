import { z } from 'zod/v4'

export const labAdSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(200).optional(),
    advertiserName: z.string().trim().min(1).max(120),
    headline: z.string().trim().min(1).max(200),
    body: z.string().trim().max(2000),
    procedure: z.string().trim().min(1).max(30000),
    targeting: z.string().max(10000).default(''),
    signupUrl: z
      .string()
      .max(2000)
      .default('')
      .refine((value) => {
        if (!value) return true
        try {
          const url = new URL(value)
          return url.protocol === 'https:' && !url.username && !url.password
        } catch {
          return false
        }
      }, 'Use an HTTPS signup URL.'),
    /** The advertiser campaign (and ad) a Customize copy came from; variations keep it. */
    source: z
      .object({
        campaignId: z.string().min(1).max(120),
        creativeId: z.string().min(1).max(120).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
export type LabAd = z.infer<typeof labAdSchema>
const flightDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/**
 * A new draft campaign for an advertiser that runs this lab ad. The campaign
 * settings come from the dialog; `sourceCampaignId` optionally names one of
 * the advertiser's campaigns whose remaining settings (conversion goal,
 * frequency cap, the ad's CTA and brand colors) the draft copies.
 */
export const labPublishSchema = z
  .object({
    requestId: z.string().uuid(),
    draft: labAdSchema,
    advertiserId: z.string().min(1).max(120),
    sourceCampaignId: z.string().min(1).max(120).nullable(),
    name: z.string().trim().min(1).max(120),
    landingUrl: z.string().trim().min(1).max(2048),
    dailyCapCents: z.number().int().positive(),
    totalBudgetCents: z.number().int().positive().nullable(),
    flightStart: flightDay,
    flightEnd: flightDay.nullable(),
    countryTargeting: z
      .object({
        mode: z.enum(['include', 'exclude']),
        countries: z.array(z.string().min(2).max(2)).min(1).max(250),
      })
      .strict()
      .nullable(),
    copyAcceptanceCriteria: z.boolean(),
  })
  .strict()
export type LabPublishInput = z.infer<typeof labPublishSchema>
export type LabPublishAdvertiser = {
  id: string
  name: string
  websiteUrl: string
  campaigns: number
  agenticCampaigns: number
}
export type LabPublishCampaign = {
  id: string
  name: string
  status: string
  advertiserId: string
  advertiserName: string
  agentic: boolean
  landingUrl: string
  dailyCapCents: number
  totalBudgetCents: number | null
  placements: number
  startsAt: string | null
  endsAt: string | null
  countryTargeting: { mode: 'include' | 'exclude'; countries: string[] } | null
  hasAcceptanceCriteria: boolean
}
export type LabPublishResult = {
  campaignId: string
  campaignName: string
  advertiserName: string
  /** `pending_review` once submitted; `draft` when submission was refused. */
  status: string
  /** Why the campaign stayed a draft. */
  note?: string
}
export const labSelectionSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('creative'), id: z.string().min(1).max(120) })
    .strict(),
  z.object({ kind: z.literal('campaign'), id: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('draft'), id: z.string().uuid() }).strict(),
])
export type LabSelection = z.infer<typeof labSelectionSchema>
/**
 * What a batch may test: any selection, or a skill version (`<id>@<version>`,
 * shipped or Lab) run as the custom ad it renders. Settings never hold one.
 */
export const labBatchSelectionSchema = z.union([
  labSelectionSchema,
  z
    .object({
      kind: z.literal('skill'),
      id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*@[0-9A-Za-z.+-]{1,64}$/),
    })
    .strict(),
])
export type LabBatchSelection = z.infer<typeof labBatchSelectionSchema>
export type LabAdSearchPage = {
  items: Array<{
    id: string
    name: string
    campaignName: string
    advertiserName: string
    status: string
    deliveryPaused: boolean
  }>
  nextOffset: number | null
}
export type LabRepository = {
  projectId: string
  fullName: string
  branch: string
  /** Every chat starts at this commit instead of the branch tip. */
  commit?: string
}
export type LabSettings = {
  revision: number
  selection: LabSelection | null
  drafts: LabAd[]
  repositories: LabRepository[]
}
export type LabOffer = {
  id: string
  workspaceId: string
  projectId: string
  runId: string
  ad: LabAd
  state: 'offered' | 'accepted' | 'declined'
  signup: 'idle' | 'requested' | 'confirmed' | 'declined'
  /** The part of the account step that is up while `signup` is `requested`. */
  signupStage: LabSignupStage | null
  /** Set when Instant setup was tried and fell back to sign-up. */
  signupInstantFailed: boolean
  /** The tracked signup link, while the step is up; may hold an `{email}` slot. */
  signupUrl: string | null
  /**
   * The tester's own email while the step is up, for the Instant setup and
   * `{email}` questions; null when the account has none.
   */
  signupEmail: string | null
  signupExpiresAt: string | null
  runStatus: string | null
  runError: string | null
}
export type LabSignupStage = 'instant' | 'instant_pending' | 'account'
/** What `POST …/instant-setup` would answer Desktop: an assertion for one endpoint. */
export const labInstantSetupGrantSchema = z
  .object({
    assertion: z.string().min(1).max(8192),
    endpoint: z.string().url().max(2048),
    env: z.string().min(1).max(64),
    email: z.string().min(3).max(320),
    expiresAt: z.number().int().positive(),
  })
  .strict()
export type LabInstantSetupGrant = z.infer<typeof labInstantSetupGrantSchema>
/**
 * An account-step answer that carries a secret. It goes to the Cloud API
 * (`POST /cloud/runs/{runId}/lab-signup`), which seals it for the worker;
 * answers without a secret go through `agenticAdLab:answerSignup`.
 */
export const labSignupSecretSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('credentials'),
      values: z.record(z.string().min(1).max(64), z.string().max(4096)),
    })
    .strict(),
  z
    .object({ kind: z.literal('instant'), grant: labInstantSetupGrantSchema })
    .strict(),
])
export type LabSignupSecret = z.infer<typeof labSignupSecretSchema>
/** Accept only a GitHub repository, never a user-supplied fetch host or revision. */
export function publicRepositoryName(input: string): string | null {
  let name = input
    .trim()
    .replace(/\/$/, '')
    .replace(/\.git$/, '')
  if (name.startsWith('https://github.com/')) name = name.slice(19)
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(name) &&
    !name.split('/').some((part) => part === '.' || part === '..')
    ? name
    : null
}
/**
 * `owner/name@<full 40-hex commit>` pins a lab repository, so every chat on it
 * starts from the same code. Only a full SHA is accepted, never a branch or
 * other revision expression.
 */
export function publicRepositorySpec(
  input: string,
): { fullName: string; commit?: string } | null {
  const trimmed = input.trim()
  const at = trimmed.lastIndexOf('@')
  if (at === -1) {
    const fullName = publicRepositoryName(trimmed)
    return fullName ? { fullName } : null
  }
  const commit = trimmed.slice(at + 1).toLowerCase()
  const fullName = publicRepositoryName(trimmed.slice(0, at))
  return fullName && /^[a-f0-9]{40}$/.test(commit) ? { fullName, commit } : null
}
