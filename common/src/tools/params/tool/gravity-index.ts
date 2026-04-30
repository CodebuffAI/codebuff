import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'
import { jsonObjectSchema } from '../../../types/json'

import type { $ToolParams } from '../../constants'

const toolName = 'gravity_index'
const endsAgentStep = true

const inputSchema = z
  .discriminatedUnion('action', [
    z.object({
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
      context: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Optional structured context about the project, stack, or constraints.',
        ),
    }),
    z.object({
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
    }),
    z.object({
      action: z
        .literal('list_categories')
        .describe('List every category with service counts.'),
    }),
    z.object({
      action: z
        .literal('get_service')
        .describe('Fetch full detail for a single service by slug.'),
      slug: z
        .string()
        .min(1, 'Slug cannot be empty')
        .describe('Service slug, e.g. supabase, stripe, sendgrid.'),
    }),
    z.object({
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
    }),
  ])
  .describe(`Use the Gravity Index catalog and conversion API.`)

const description = `
Purpose: Use the Gravity Index to discover, inspect, and report integrations for third-party developer services such as databases, auth, payments, hosting, email, cache, monitoring, analytics, AI, storage, CMS, search, realtime, background jobs, infrastructure, CRM, support, productivity, commerce, video, webhooks, and SMS.

Choose the action:
- \`search\`: Use when the user asks for a recommendation or when you need to choose a provider before integrating it. Returns a reasoned recommendation with install guidance, env vars, and a setup/conversion URL. Include stack and constraints in \`query\`. Pass \`search_id\` from a previous search for follow-up questions.
- \`browse\`: Use to list catalog services by \`category\` and/or keyword \`q\`. Good when the user wants options or a category-scoped picker.
- \`list_categories\`: Use to see available categories and service counts.
- \`get_service\`: Use when you already know a service slug and need full detail, env vars, website, docs URL, and install metadata.
- \`report_integration\`: Use after you have actually completed and verified an integration from a previous search. Pass the original \`search_id\` and the service slug as \`integrated_slug\`.

Important setup-link behavior:
- Search results include \`conversion_url\`, the setup link the user should visit to create an account and get API credentials.
- Always show this link prominently as "Get your {service.name} API key" when credentials are needed.
- Do not replace it with the vendor homepage and do not auto-follow it.
- Ask the user to paste the resulting credentials back so you can finish setup.

Implementation guidance:
- Gravity can help select a provider and identify required env vars, but install steps may be high-level. Use the returned \`docs_url\`, existing codebase conventions, and package/docs research to perform the actual integration.
- For browsing results, use \`get_service\` on promising slugs before making a final recommendation if details matter.

Examples:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    action: 'search',
    query:
      'transactional email API with a generous free tier for a Next.js app',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    action: 'browse',
    category: 'Email',
    q: 'send',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    action: 'get_service',
    slug: 'sendgrid',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    action: 'report_integration',
    search_id: 'search_id_from_previous_search',
    integrated_slug: 'sendgrid',
  },
  endsAgentStep,
})}
`.trim()

export const gravityIndexParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      jsonObjectSchema,
      z.object({
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
