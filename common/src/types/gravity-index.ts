import z from 'zod/v4'

import { jsonObjectSchema } from './json'

const searchInputSchema = z.object({
  action: z.literal('search').describe('Search for the best service.'),
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(1000, 'Query cannot exceed 1000 characters')
    .describe(
      `What the user needs, including stack, constraints, and required capabilities when known. Example: "serverless database with branching for a Next.js app".`,
    ),
  search_id: z
    .string()
    .optional()
    .describe('Continue a previous Gravity Index search as a follow-up.'),
  context: jsonObjectSchema
    .optional()
    .describe(
      'Optional structured JSON context about the project, stack, or constraints.',
    ),
})

const browseInputSchema = z.object({
  action: z
    .literal('browse')
    .describe('Browse catalog services by category and/or keyword.'),
  category: z
    .string()
    .optional()
    .describe(
      'Optional category filter, e.g. Database, Auth, Payments, Hosting, Email, Cache, Monitoring, Analytics, AI, Storage, CMS, Search, Realtime, Background Jobs, Infrastructure, CRM, Support, Productivity, Commerce, Video, Webhooks, SMS.',
    ),
  q: z
    .string()
    .optional()
    .describe('Optional keyword filter, e.g. sendgrid or postgres.'),
})

const listCategoriesInputSchema = z.object({
  action: z
    .literal('list_categories')
    .describe('List every category with service counts.'),
})

const getServiceInputSchema = z.object({
  action: z
    .literal('get_service')
    .describe('Fetch full detail for a single service by slug.'),
  slug: z
    .string()
    .min(1, 'Slug cannot be empty')
    .describe('Service slug, e.g. supabase, stripe, sendgrid.'),
})

const reportIntegrationInputSchema = z.object({
  action: z
    .literal('report_integration')
    .describe('Report that an integration from a prior search was done.'),
  search_id: z
    .string()
    .min(1, 'search_id cannot be empty')
    .describe('search_id from the earlier search result.'),
  integrated_slug: z
    .string()
    .min(1, 'integrated_slug cannot be empty')
    .describe('Slug of the service that was actually integrated.'),
})

const runtimeAttributionFields = {
  external_session_id: z
    .string()
    .optional()
    .describe(
      'Stable Codebuff session ID for Gravity API key attribution. Codebuff usually fills this automatically.',
    ),
  metadata: jsonObjectSchema
    .optional()
    .describe(
      'Non-sensitive API key metadata for Gravity attribution and debugging. Codebuff usually fills this automatically.',
    ),
}

export const gravityIndexInputSchema = z
  .discriminatedUnion('action', [
    searchInputSchema,
    browseInputSchema,
    listCategoriesInputSchema,
    getServiceInputSchema,
    reportIntegrationInputSchema,
  ])
  .describe(`Use the Gravity Index tool discovery and install API.`)

export const gravityIndexApiInputSchema = z
  .discriminatedUnion('action', [
    searchInputSchema.extend(runtimeAttributionFields),
    browseInputSchema,
    listCategoriesInputSchema,
    getServiceInputSchema,
    reportIntegrationInputSchema.extend(runtimeAttributionFields),
  ])
  .describe(`Use the Gravity Index tool discovery and install API.`)

export type GravityIndexInput = z.infer<typeof gravityIndexApiInputSchema>
