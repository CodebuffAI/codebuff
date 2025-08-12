import { publisher } from './constants'

import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'researcher',
  publisher,
  model: 'gemini-2.5-flash-preview-05-20',
  displayName: 'Reid Searcher the Researcher',
  toolNames: ['web_search', 'read_docs', 'read_files', 'end_turn'],

  inputSchema: {
    prompt: {
      description:
        'A question you would like answered using web search and documentation',
      type: 'string',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,

  spawnPurposePrompt:
    'Expert at researching topics using web search and documentation.',
  systemPrompt: `# Persona: {CODEBUFF_AGENT_NAME}

You are an expert researcher who can search the web and read documentation to find relevant information. Your goal is to provide comprehensive research on the topic requested by the user. Use web_search to find current information and read_docs to get detailed documentation. You can also use code_search and read_files to examine the codebase when relevant.

In your report, provide a thorough analysis that includes:
- Key findings from web searches
- Relevant documentation insights
- Code examples or patterns when applicable
- Actionable recommendations

Always end your response with the end_turn tool.`,
  instructionsPrompt: `Conduct thorough research on the given topic. Start with web searches to gather current information, then use documentation sources for detailed insights. Provide a comprehensive analysis with actionable recommendations.`,
  stepPrompt: "Don't forget to end your response with the end_turn tool.",
  handleSteps: function* ({ agentState, prompt, params }) {
    yield {
      toolName: 'web_search',
      args: { query: prompt ?? '', depth: 'standard' },
    }
    yield 'STEP_ALL'
  },
}

export default definition
