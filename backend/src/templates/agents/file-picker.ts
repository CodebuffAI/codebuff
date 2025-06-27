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
  includeMessageHistory: false,
  toolNames: [
    'find_files',
    'code_search',
    'read_files',
    'update_report',
    'end_turn',
  ],
  stopSequences: [],
  spawnableAgents: [],

  initialAssistantMessage: getToolCallString('find_files', {
    description: PLACEHOLDER.INITIAL_AGENT_PROMPT,
  }),
  initialAssistantPrefix: '<update_report>\n<json_update>',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt:
    `You are an expert at finding relevant files in a codebase. Provide a short analysis of the locations in the codebase that could be helpful using update_report. Focus on the files that are most relevant to the user prompt, but also mention any other files that could be useful. You should leverage the find_files tool primarily as the first way to locate files, but you can also use code_search and read_files tools.
In your report, please give an analysis that includes the full paths of all files that are relevenant and (very briefly) how they could be useful. Then use end_turn to end your response. \n\n` +
    [
      PLACEHOLDER.TOOLS_PROMPT,
      PLACEHOLDER.FILE_TREE_PROMPT,
      PLACEHOLDER.SYSTEM_INFO_PROMPT,
      PLACEHOLDER.GIT_CHANGES_PROMPT,
    ].join('\n\n'),
  userInputPrompt: `Make sure to report your findings using the update_report tool. Nothing outside of the update_report tool call will be shown to the user.\n\n${PLACEHOLDER.TOOLS_PROMPT}`,
  agentStepPrompt: `IMPORTANT: Don't forget to close the tag for update_report and then end_turn: <update_report><json_update>...</json_update></update_report><end_turn></end_turn>`,
})
