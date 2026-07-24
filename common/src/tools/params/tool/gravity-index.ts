import z from 'zod/v4'

import { gravityIndexInputSchema } from '../../../types/gravity-index'
import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'
import { jsonObjectSchema } from '../../../types/json'

import type { $ToolParams } from '../../constants'

const toolName = 'gravity_index'
const endsAgentStep = true

const description = `
Purpose: Use the Gravity Index to discover, inspect, and report integrations for third-party developer services such as databases, auth, payments, hosting, email, cache, monitoring, analytics, AI, storage, CMS, search, realtime, background jobs, infrastructure, CRM, support, productivity, commerce, video, webhooks, and SMS.

Choose the action:
- \`search\`: Use when the user asks for a recommendation or when you need to choose a provider before integrating it. Returns a reasoned recommendation with install guidance, env vars, and a setup/conversion URL. Include stack and constraints in \`query\`. Pass \`search_id\` from a previous search for follow-up questions.
- \`browse\`: Use to list catalog services by \`category\` and/or keyword \`q\`. Good when the user wants options or a category-scoped picker.
- \`list_categories\`: Use to see available categories and service counts.
- \`get_service\`: Use when you already know a service slug and need full detail, env vars, website, docs URL, and install metadata.
- \`report_integration\`: Use after you have actually completed and verified an integration from a previous search. Pass the original \`search_id\` and the service slug as \`integrated_slug\`.

Important setup-link behavior:
- Search results may include \`credential_request.setup_url\`, \`recommendation.click_url\`, and/or top-level \`click_url\`, the tracked setup link the user should visit to create an account and get API credentials.
- A search can contain a recommendation and several options, and you may search more than once. Decide which single service you are actually recommending before rendering a CTA.
- When \`render_ui\` is available, call it once for the selected service. Use a gravity_index link reference with the exact \`search_id\` and selected \`service_slug\`; never transcribe the opaque URL. The runtime verifies the selection and substitutes the exact stored click URL.
- When \`render_ui\` is unavailable, preserve and present the exact returned tracked URL in a normal markdown link.
- Do not replace the tracked setup link with the vendor homepage and do not auto-follow it.
- Ask the user to paste the required env vars from \`credential_request.required_env_vars\` back so you can finish setup.

Implementation guidance:
- Gravity returns reasoning, \`install.steps\`, \`install.env_vars\`, and \`credential_request\`. Execute the install steps you can perform locally, then pause only for missing user credentials.
- Use the returned \`docs_url\`, existing codebase conventions, and package/docs research to fill any gaps in the install instructions.
- For browsing results, use \`get_service\` on promising slugs before making a final recommendation if details matter.

Examples:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema: gravityIndexInputSchema,
  input: {
    action: 'search',
    query:
      'transactional email API with a generous free tier for a Next.js app',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema: gravityIndexInputSchema,
  input: {
    action: 'browse',
    category: 'Email',
    q: 'send',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema: gravityIndexInputSchema,
  input: {
    action: 'get_service',
    slug: 'sendgrid',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema: gravityIndexInputSchema,
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
  inputSchema: gravityIndexInputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      jsonObjectSchema,
      z.object({
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
