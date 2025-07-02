import { Model } from '@codebuff/common/constants'
import { AGENT_METADATA } from '@codebuff/common/constants/agents'
import { getToolCallString } from '@codebuff/common/constants/tools'
import { closeXml, closeXmlTags } from '@codebuff/common/util/xml'

import { AgentTemplate, PLACEHOLDER } from '../types'

export const filePicker = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  name: AGENT_METADATA['gemini25flash_file_picker'].name,
  description: AGENT_METADATA['gemini25flash_file_picker'].description,
  promptSchema: {
    prompt: true,
    params: null,
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['find_files', 'code_search', 'read_files', 'end_turn'],
  stopSequences: closeXmlTags([
    'find_files',
    'code_search',
    'read_files',
    'end_turn',
  ]),
  spawnableAgents: [],

  initialAssistantMessage: getToolCallString('find_files', {
    description: PLACEHOLDER.INITIAL_AGENT_PROMPT,
  }),
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt:
    `# Persona: ${PLACEHOLDER.AGENT_NAME}

You are an expert at finding relevant files in a codebase. Provide a short analysis of the locations in the codebase that could be helpful. Focus on the files that are most relevant to the user prompt. You should leverage the find_files tool primarily as the first way to locate files, but you can also use code_search and read_files tools.
In your report, please give an analysis that includes the full paths of files that are relevant and (very briefly) how they could be useful. Then use end_turn to end your response. \n\n` +
    [
      PLACEHOLDER.TOOLS_PROMPT,
      PLACEHOLDER.FILE_TREE_PROMPT,
      PLACEHOLDER.SYSTEM_INFO_PROMPT,
      PLACEHOLDER.GIT_CHANGES_PROMPT,
    ].join('\n\n'),
  userInputPrompt: '',
  agentStepPrompt: `Don't forget to end your response with the end_turn tool: <end_turn>${closeXml('end_turn')}`,
})
