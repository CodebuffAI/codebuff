import { Model } from '@codebuff/common/constants'
import { getToolCallString } from '@codebuff/common/constants/tools'
import { AgentTemplate, PLACEHOLDER } from '../types'

export const filePicker = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  description: 'Expert at finding relevant files in a codebase.',
  promptSchema: {
    prompt: true,
    params: null,
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: [
    'find_files',
    'code_search',
    'read_files',
    'update_report',
    'end_turn',
  ],
  stopSequences: [
    '</find_files>',
    '</code_search>',
    '</read_files>',
    '</end_turn>',
  ],
  spawnableAgents: [],

  initialAssistantMessage: getToolCallString('find_files', {
    description: PLACEHOLDER.INITIAL_AGENT_PROMPT,
  }),
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt:
    `You are an expert at finding relevant files in a codebase. Provide a short analysis of the locations in the codebase that could be helpful. Focus on the files that are most relevant to the user prompt. You should leverage the find_files tool primarily as the first way to locate files, but you can also use code_search and read_files tools. \n\n` +
    [
      PLACEHOLDER.TOOLS_PROMPT,
      PLACEHOLDER.FILE_TREE_PROMPT,
      PLACEHOLDER.SYSTEM_INFO_PROMPT,
      PLACEHOLDER.GIT_CHANGES_PROMPT,
    ].join('\n\n'),

  userInputPrompt: `In your response, please give an analysis that includes the full paths of files that are relevanant and (very briefly) how they could be useful. Then use update_report with the add_files parameter to add the most important files to the report. Then use end_turn to end your response.`,

  agentStepPrompt: `Don't forget to update the report with the most important files and end your response with the end_turn tool: <end_turn></end_turn>`,
})
