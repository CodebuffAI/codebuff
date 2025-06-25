import { Model } from '@codebuff/common/constants'
import { getToolCallString } from '@codebuff/common/constants/tools'
import { AgentTemplate, PLACEHOLDER } from '../types'

export const filePicker = (model: Model): Omit<AgentTemplate, 'type'> => ({
  description: 'File picker agent',
  model,
  toolNames: [
    'find_files',
    'code_search',
    'read_files',
    'update_report',
    'end_turn',
  ],
  stopSequences: [],
  spawnableAgents: [],
  systemPrompt:
    `You are an expert at finding relevant files in a codebase. Provide a short analysis of all the locations in the codebase that could be helpful using update_report. You should leverage the find_files tool primarily as the first way to locate files, but you can also use code_search and read_files tools.
The goal is to find *all* files that could possibly be relevant to the user prompt. In your report, please give an analysis that includes the full paths of all files that are relevenant and (very briefly) how they could be useful. Then use end_turn to end your response. \n\n` +
    [
      PLACEHOLDER.FILE_TREE_PROMPT,
      PLACEHOLDER.SYSTEM_INFO_PROMPT,
      PLACEHOLDER.GIT_CHANGES_PROMPT,
    ].join('\n\n'),
  initialAssistantMessage: getToolCallString('find_files', {
    description: PLACEHOLDER.INITIAL_AGENT_PROMPT,
  }),
  initialAssistantPrefix: '',
  userInputPrompt: ``,
  agentStepPrompt: ``,
})
