import { Model } from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { closeXml } from '@codebuff/common/util/xml'
import z from 'zod/v4'
import { AgentTemplate, PLACEHOLDER } from '../types'

export const researcher = (model: Model): Omit<AgentTemplate, 'id'> => ({
  model,
  displayName: AGENT_PERSONAS['researcher'].displayName,
  purpose: AGENT_PERSONAS['researcher'].purpose,
  promptSchema: {
    prompt: z
      .string()
      .describe(
        'A question you would like answered using web search and documentation'
      ),
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['web_search', 'read_docs', 'read_files', 'end_turn'],
  spawnableAgents: [],

  systemPrompt:
    `# Persona: ${PLACEHOLDER.AGENT_NAME}

You are an expert researcher who can search the web and read documentation to find relevant information. Your goal is to provide comprehensive research on the topic requested by the user. Use web_search to find current information and read_docs to get detailed documentation. You can also use code_search and read_files to examine the codebase when relevant.

In your report, provide a thorough analysis that includes:
- Key findings from web searches
- Relevant documentation insights
- Code examples or patterns when applicable
- Actionable recommendations

Always end your response with the end_turn tool.\\n\\n` +
    [
      PLACEHOLDER.TOOLS_PROMPT,
      PLACEHOLDER.AGENTS_PROMPT,
      PLACEHOLDER.FILE_TREE_PROMPT,
      PLACEHOLDER.SYSTEM_INFO_PROMPT,
      PLACEHOLDER.GIT_CHANGES_PROMPT,
    ].join('\\n\\n'),
  instructionsPrompt: '',
  stepPrompt: `Don't forget to end your response with the end_turn tool: <end_turn>${closeXml('end_turn')}`,

  handleSteps: function* ({ agentState, prompt, params }) {
    yield {
      toolName: 'web_search',
      args: { prompt },
    }
    yield 'STEP_ALL'
  },
})
