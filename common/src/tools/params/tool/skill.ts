import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'skill'
const endsAgentStep = true

const inputSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .describe('The name of the skill to load'),
  })
  .describe(
    'Load a skill by name to get its full instructions. Skills provide reusable behaviors and instructions.',
  )

const outputValueSchema = z.object({
  name: z.string(),
  description: z.string(),
  content: z.string(),
  license: z.string().optional(),
})

/**
 * Placeholder marker that will be replaced with the actual available skills XML.
 * This is replaced at runtime when generating tool prompts.
 */
export const AVAILABLE_SKILLS_PLACEHOLDER = '{{AVAILABLE_SKILLS}}'

// Base description - the full description with available skills is generated dynamically
const baseDescription = `Load a skill by name to get its full instructions. Skills provide reusable behaviors and domain-specific knowledge that you can use to complete tasks.

The following are the only skills that are currently available (do not try to use any other skills):
${AVAILABLE_SKILLS_PLACEHOLDER}

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    name: 'git-release',
  },
  endsAgentStep,
})}
`

export const skillParams = {
  toolName,
  endsAgentStep,
  description: baseDescription.trim(),
  inputSchema,
  outputSchema: jsonToolResultSchema(outputValueSchema),
} satisfies $ToolParams
