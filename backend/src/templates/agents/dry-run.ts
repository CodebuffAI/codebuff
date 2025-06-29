import { Model } from '@codebuff/common/constants'
import { AgentTemplate, PLACEHOLDER } from '../types'

export const dryRun = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  description: 'Agent that takes a plan and try to implement it in a dry run.',
  promptSchema: {
    prompt: true,
    params: null,
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['end_turn'],
  stopSequences: [],
  spawnableAgents: [],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt: `You are an expert software engineer. You are good at implementing plans.\n\n${PLACEHOLDER.TOOLS_PROMPT}`,

  userInputPrompt: `Do a dry run of implementing just the specified portion of the plan. (Do NOT sketch out the full plan!)

  Sketch out the changes you would make to the codebase and/or what tools you would call. Try not to write out full files, but include only abbreviated changes to all files you would edit.

  Finally, use the end_turn tool to end your response.
`,
  agentStepPrompt: 'Do not forget to use the end_turn tool to end your response.',
})
