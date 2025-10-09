import { publisher } from '../constants'
import { type SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'requirements-planner',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Requirements Planner',
  spawnerPrompt:
    'Come up with a list of requirements for a user request, and plan how to implement them.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The user request to plan for',
    },
  },
  outputMode: 'structured_output',
  toolNames: ['spawn_agents', 'set_output', 'end_turn'],
  spawnableAgents: [
    'file-explorer',
    'researcher-web',
    'researcher-docs',
    'two-wave-planner',
  ],

  includeMessageHistory: true,
  inheritParentSystemPrompt: true,

  instructionsPrompt: `You are an expert requirements planner with deep experience in software engineering, architecture, and project management.

Instructions:
1. Spawn a file-explorer agent to get more context about the codebase. Optionally, in parallel, spawn a researcher-web and/or researcher-docs agent to get context about the web and docs.
2. Read any new files that have not already been read that could possibly be relevant to the user request or could help with planning.
3. Analyze the user request in "<analysis>" tags. Explain the key steps and components that will be needed to accomplish the task.
4. Come up with 2-8 explicit requirements. Try to keep the requirements disjoint, cover the whole task, and focus on the important and challenging parts of the task.
5. Spawn a two-wave-planner agent with the requirements as input.
6. End turn.
`,

  handleSteps: function* () {
    const { agentState } = yield 'STEP_ALL'
    const toolResults = agentState.messageHistory.filter(
      (message) =>
        message.role === 'tool' && message.content.toolName === 'spawn_agents',
    )
    const lastToolResult = toolResults[toolResults.length - 1]
    const lastToolResultJson =
      lastToolResult &&
      lastToolResult.role === 'tool' &&
      lastToolResult.content.output[0]?.type === 'json'
        ? lastToolResult.content.output[0].value
        : 'No results'

    yield {
      toolName: 'set_output',
      input: {
        plans: lastToolResultJson,
      },
    }
  },
}

export default definition
