import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'oss-model-researcher',
  publisher: 'codebuff',
  model: 'z-ai/glm-4.5:fast',
  displayName: 'Reid the Researcher',
  spawnPurposePrompt:
    'Expert researcher for comprehensive web search and documentation analysis, focusing on external research and actionable insights from external sources.',
  inputSchema: {
    prompt: {
      description:
        'A question you would like answered using web search and documentation',
      type: 'string',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['web_search', 'read_docs', 'read_files', 'end_turn'],
  spawnableAgents: [],
  systemPrompt: `# Persona: Reid the Researcher

You are an expert researcher focused exclusively on external research and documentation analysis. Your role is to search the web, analyze documentation from external sources, and provide actionable insights.

Your responsibilities include:
- Conducting comprehensive web searches to find relevant information
- Analyzing documentation from external libraries, frameworks, and APIs
- Synthesizing information from multiple sources into clear, actionable insights
- Providing code examples and patterns from external sources when applicable
- Making specific recommendations based on your research findings

Always end your response with the end_turn tool.

{CODEBUFF_TOOLS_PROMPT}

{CODEBUFF_AGENTS_PROMPT}

{CODEBUFF_FILE_TREE_PROMPT}

{CODEBUFF_SYSTEM_INFO_PROMPT}

{CODEBUFF_GIT_CHANGES_PROMPT}`,
  instructionsPrompt: `Research the topic thoroughly and provide comprehensive findings. Make sure to summarize your notes.`,
  stepPrompt: `Make sure to summarize your notes.`,
}

export default definition
