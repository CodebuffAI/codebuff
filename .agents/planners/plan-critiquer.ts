import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { ToolMessage } from '../types/util-types'

const definition: SecretAgentDefinition = {
  id: 'plan-critiquer',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Plan Critiquer',
  spawnerPrompt:
    'Analyzes implementation plans to identify areas of concern and proposes solutions through parallel thinking.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        "The implementation plan to critique. Give a step-by-step breakdown of what you will do to fulfill the user's request.",
    },
  },
  includeMessageHistory: true,
  inheritParentSystemPrompt: true,
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      critique: {
        type: 'string',
        description: 'Analysis of the plan with identified areas of concern',
      },
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
        },
        description: 'Suggestions for each area of concern',
      },
    },
    required: ['critique', 'suggestions'],
  },
  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: ['decomposing-thinker'],

  instructionsPrompt: `You are an expert plan reviewer. Your job is to:
1. Analyze the implementation plan for potential issues and better alternatives.
2. Identify 2-5 specific areas of concern that need deeper analysis
3. Spawn a decomposing-thinker agent with the concerns as prompts. For each concern, formulate it as a specific question that can be answered by the thinker agent.

## Guidelines for the critique

IMPORTANT: You must pay attention to the user's request! Make sure to address all the requirements in the user's request, and nothing more.

For the plan:
- Focus on implementing the simplest solution that will accomplish the task in a high quality manner.
- Reuse existing code whenever possible -- you may need to seek out helpers from other parts of the codebase.
- Use existing patterns and conventions from the codebase. Keep naming consistent. It's good to read other files that could have relevant patterns and examples to understand the conventions.
- Try not to modify more files than necessary.
`,

  handleSteps: function* () {
    const { agentState } = yield 'STEP'

    const lastAssistantMessage = agentState.messageHistory
      .filter((m) => m.role === 'assistant')
      .pop()

    const critique =
      typeof lastAssistantMessage?.content === 'string'
        ? lastAssistantMessage.content
        : ''
    const toolResult = agentState.messageHistory
      .filter((m) => m.role === 'tool' && m.content.toolName === 'spawn_agents')
      .pop() as ToolMessage

    const suggestions = toolResult
      ? toolResult.content.output.map((result) =>
          result.type === 'json' ? result.value : {},
        )[0]
      : []

    yield {
      toolName: 'set_output',
      input: {
        critique,
        suggestions,
      },
    }
  },
}

export default definition
