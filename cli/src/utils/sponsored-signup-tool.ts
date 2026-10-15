import { LAB_SIGNUP_TOOL_DESCRIPTION } from '@codebuff/common/ads/agentic-ad-lab-run'
import { getCustomToolDefinition } from '@codebuff/sdk'
import { z } from 'zod'

import { SPONSORED_SIGNUP_TOOL_NAME } from './sponsored-account-step'

import type { SponsoredAccountResult } from './sponsored-account-step'
import type { CustomToolDefinition } from '@codebuff/sdk'

/**
 * `request_sponsored_signup` for a CLI sponsored run, the tool Desktop and the
 * Lab register: it takes no arguments, so the link, the question and the
 * form are the host's (`sponsored-account-step.ts`). It ends the agent step
 * and resolves once the user answered, skipped, or the run stopped. The
 * result never carries a credential's value.
 */
export function sponsoredSignupTool(
  request: () => Promise<SponsoredAccountResult>,
): CustomToolDefinition {
  return getCustomToolDefinition({
    toolName: SPONSORED_SIGNUP_TOOL_NAME,
    inputSchema: z.object({}),
    description: LAB_SIGNUP_TOOL_DESCRIPTION,
    endsAgentStep: true,
    exampleInputs: [{}],
    execute: async () => [{ type: 'json', value: await request() }],
  })
}
