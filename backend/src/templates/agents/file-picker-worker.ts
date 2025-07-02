import { Model } from '@codebuff/common/constants'
import { getToolCallString } from '@codebuff/common/constants/tools'
import { AgentTemplate, PLACEHOLDER } from '../types'
import { closeXmlTags } from '@codebuff/common/util/xml'

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
  stopSequences: closeXmlTags(['end_turn']),
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

  userInputPrompt:
    `Pick the most relevant files and list them out, each on a new line with <files> tags. And then use the end_turn tool. Do not write anything else. You should put the most relevant files first.

  E.g.:
  <example_response>
  <files>
  path/to/file1.js
  path/to/file2.js
  ...
  </files>${getToolCallString('end_turn', {})}
  </example_response>
  `.trim(),

  agentStepPrompt:
    'When you finish your response you must use the end_turn tool to end your response.',
})
