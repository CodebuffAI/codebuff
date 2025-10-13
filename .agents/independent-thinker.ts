import { publisher } from './constants'
import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

const independentThinker: AgentDefinition = {
  id: 'independent-thinker',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Independent Thinker',
  spawnerPrompt:
    'A strong independent thinking agent that analyzes specific files or does research without seeing the conversation history. Useful for getting fresh perspectives and analysis on code or a research question without context pollution. You must provide all the relevant context (via the prompt or filePaths) for this agent to work well.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The question or problem to analyze',
    },
    params: {
      type: 'object',
      properties: {
        filePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of file paths to read and analyze',
        },
      },
      required: [],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  inheritParentSystemPrompt: false,
  toolNames: ['read_files', 'spawn_agents'],
  spawnableAgents: [
    'file-picker',
    'find-all-referencer',
    'researcher-web',
    'researcher-docs',
  ],
  systemPrompt: `You are an expert software architect and analyst. You provide independent, unbiased analysis of code and problems.

Your strength is analyzing specific files and problems with fresh eyes, without being influenced by prior conversation context.

You have access to:
- File reading capabilities
- File exploration and search agents
- Web and documentation research agents

Use these tools to gather information and provide thorough, well-reasoned analysis.`,
  instructionsPrompt: `The user has provided a question or problem to think about.

You can spawn additional agents if you need more context:
- file-picker: to find related files
- find-all-referencer: to find references or definitions
- researcher-web: to search the web
- researcher-docs: to read technical documentation

Provide a thorough, well-reasoned analysis that addresses the user's question.

Be concise but comprehensive. Focus on insights, trade-offs, and recommendations.`,
  handleSteps: function* ({ params }: AgentStepContext) {
    const filePaths = params?.filePaths as string[] | undefined

    if (filePaths && filePaths.length > 0) {
      // Read all the specified files immediately
      yield {
        toolName: 'read_files',
        input: { paths: filePaths },
      }
    }

    // Let the model think and use any additional tools it needs
    yield 'STEP_ALL'
  },
}

export default independentThinker
