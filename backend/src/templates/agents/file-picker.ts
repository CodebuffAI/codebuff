import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { AgentTemplate, PLACEHOLDER } from '../types'

export const file_picker: AgentTemplate = {
  type: AgentTemplateTypes.file_picker,
  description: 'File picker agent',
  model: 'gemini-2.5-pro-preview-06-05',
  toolNames: ['find_files', 'code_search', 'read_files'],
  spawnableAgents: [],
  systemPrompt:
    `You are an expert at finding relevant files in a codebase. Provide a short analysis of all the locations in the codebase that could be helpful. You should leverage the find_files tool primarily as the first way to locate files, but you can also use code_search and read_files tools.
The goal is to find *all* files that could possibly be relevant to the user prompt. In your response, please give a paragraph with an analysis that includes the full paths of all files that are relevenant and (very briefly) how they could be useful. \n\n` +
    [
      PLACEHOLDER.FILE_TREE_PROMPT,
      PLACEHOLDER.SYSTEM_INFO_PROMPT,
      PLACEHOLDER.GIT_CHANGES_PROMPT,
    ].join('\n\n'),
  userInputPrompt: ``,
  agentStepPrompt: ``,
}
