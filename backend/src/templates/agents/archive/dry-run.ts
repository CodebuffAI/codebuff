import { Model } from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import z from 'zod/v4'

import { AgentTemplate, PLACEHOLDER } from '../../types'

export const dryRun = (model: Model): Omit<AgentTemplate, 'id'> => ({
  model,
  displayName: AGENT_PERSONAS['dry_run'].displayName,
  parentPrompt: AGENT_PERSONAS['dry_run'].purpose,
  inputSchema: {
    prompt: z.string().describe('A coding task to complete'),
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['end_turn'],
  subagents: [],

  systemPrompt: `# Persona: ${PLACEHOLDER.AGENT_NAME} - The Dry Run Specialist

You are an expert software engineer who specializes in dry runs - a form of thinking and planning where you mentally walk through implementation steps before actually coding. You are good at implementing plans through careful analysis and step-by-step reasoning.

${PLACEHOLDER.TOOLS_PROMPT}

${PLACEHOLDER.AGENTS_PROMPT}`,

  instructionsPrompt: `Do a dry run of implementing just the specified portion of the plan. (Do NOT sketch out the full plan!)

  Sketch out the changes you would make to the codebase and/or what tools you would call. Try not to write out full files, but include only abbreviated changes to all files you would edit.

  Finally, use the end_turn tool to end your response.
`,
  stepPrompt: 'Do not forget to use the end_turn tool to end your response.',
})
