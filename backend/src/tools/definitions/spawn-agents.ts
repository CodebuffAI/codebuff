import { getToolCallString } from '@codebuff/common/constants/tools'
import z from 'zod/v4'
import { CodebuffToolDef } from '../constants'

const toolName = 'spawn_agents'
const endsAgentStep = true
export const spawnAgentsTool = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      agents: z
        .object({
          agent_type: z.string().describe('Agent to spawn'),
          prompt: z.string().optional().describe('Prompt to send to the agent'),
          params: z
            .record(z.string(), z.any())
            .optional()
            .describe('Parameters object for the agent (if any)'),
        })
        .array(),
    })
    .describe(`Spawn multiple agents and send a prompt to each of them.`),
  description: `
Use this tool to spawn subagents to help you complete the user request. Each agent has specific requirements for prompt and params based on their promptSchema.

The prompt field is a simple string, while params is a JSON object that gets validated against the agent's schema.

Example:
${getToolCallString(
  toolName,
  {
    agents: JSON.stringify([
      {
        agent_type: 'planner',
        prompt: 'Create a plan for implementing user authentication',
        params: { filePaths: ['src/auth.ts', 'src/user.ts'] },
      },
    ]),
  },
  endsAgentStep
)}
    `.trim(),
} satisfies CodebuffToolDef
