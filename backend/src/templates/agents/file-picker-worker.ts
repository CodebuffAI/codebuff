import { Model } from '@codebuff/common/constants'
import { getToolCallString } from '@codebuff/common/constants/tools'
import { AgentTemplate, PLACEHOLDER } from '../types'

export const filePickerWorker = (
  model: Model
): Omit<AgentTemplate, 'type'> => ({
  model,
  description: 'Expert at finding relevant files in a codebase.',
  promptSchema: {
    prompt: true,
    params: null,
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['find_files', 'end_turn'],
  stopSequences: ['</end_turn>'],
  spawnableAgents: [],

  initialAssistantMessage: (prompt) =>
    getToolCallString('find_files', {
      description: prompt,
    }),
  initialAssistantPrefix: '',
  stepAssistantPrefix: '',

  systemPrompt:
    `You are an expert at finding relevant files in a codebase. You use the find_files tool once and explain the results in a very concise way.\n\n` +
    [
      PLACEHOLDER.TOOLS_PROMPT,
      PLACEHOLDER.FILE_TREE_PROMPT,
      PLACEHOLDER.SYSTEM_INFO_PROMPT,
      PLACEHOLDER.GIT_CHANGES_PROMPT,
    ].join('\n\n'),

  userInputPrompt: `Provide an extremely concise analysis of the locations in the codebase that could be helpful. Focus on the files that are most relevant to the user prompt. List out the paths of the relevant files and mention how they could be useful in a maximum of 12 words each.`,

  agentStepPrompt:
    'When you finish your response you must use the end_turn tool to end your response.',
})
