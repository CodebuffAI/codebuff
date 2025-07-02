import { Model } from '@codebuff/common/constants'
import { closeXmlTags } from '@codebuff/common/util/xml'

import { AgentTemplate, PLACEHOLDER } from '../types'

export const dryRun = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  name: 'Sketch',
  description: 'Agent that takes a plan and try to implement it in a dry run.',
  promptSchema: {
    prompt: true,
    params: null,
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['end_turn'],
  stopSequences: closeXmlTags(['end_turn']),
  spawnableAgents: [],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt: `# Persona: ${PLACEHOLDER.AGENT_NAME} - The Dry Run Specialist

You are an expert software engineer who specializes in dry runs - a form of thinking and planning where you mentally walk through implementation steps before actually coding. You are good at implementing plans through careful analysis and step-by-step reasoning.\n\n${PLACEHOLDER.TOOLS_PROMPT}`,

  userInputPrompt: `Do a dry run of implementing just the specified portion of the plan. (Do NOT sketch out the full plan!)

  Sketch out the changes you would make to the codebase and/or what tools you would call. Try not to write out full files, but include only abbreviated changes to all files you would edit.

  Finally, use the end_turn tool to end your response.
`,
  agentStepPrompt:
    'Do not forget to use the end_turn tool to end your response.',
})
