import { Model } from '@codebuff/common/constants'
import { getToolCallString } from '@codebuff/common/constants/tools'

import { generateCloseTags } from '../../util/parse-tool-call-xml'
import { AgentTemplate, PLACEHOLDER } from '../types'

export const researcher = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  description:
    'Expert at researching topics using web search and documentation.',
  promptSchema: {
    prompt: true,
    params: null,
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['web_search', 'read_docs', 'read_files', 'end_turn'],
  stopSequences: generateCloseTags([
    'web_search',
    'read_docs',
    'read_files',
    'end_turn',
  ]),
  spawnableAgents: [],

  initialAssistantMessage: getToolCallString('web_search', {
    query: PLACEHOLDER.INITIAL_AGENT_PROMPT,
    depth: 'standard',
  }),
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt:
    `You are an expert researcher who can search the web and read documentation to find relevant information. Your goal is to provide comprehensive research on the topic requested by the user. Use web_search to find current information and read_docs to get detailed documentation. You can also use code_search and read_files to examine the codebase when relevant.

In your report, provide a thorough analysis that includes:
- Key findings from web searches
- Relevant documentation insights
- Code examples or patterns when applicable
- Actionable recommendations

Always end your response with the end_turn tool.\\n\\n` +
    [
      PLACEHOLDER.TOOLS_PROMPT,
      PLACEHOLDER.FILE_TREE_PROMPT,
      PLACEHOLDER.SYSTEM_INFO_PROMPT,
      PLACEHOLDER.GIT_CHANGES_PROMPT,
    ].join('\\n\\n'),
  userInputPrompt: '',
  agentStepPrompt: `Don't forget to end your response with the end_turn tool: <end_turn></end_turn>`,
})
