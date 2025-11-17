import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { ToolCall } from '../types/agent-definition'
import { publisher } from '../constants'

const definition: SecretAgentDefinition = {
  id: 'researcher-web',
  publisher,
  model: 'x-ai/grok-4-fast',
  displayName: 'Weeb',
  spawnerPrompt: `Browses the web to find relevant information.`,
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A question you would like answered using web search',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['web_search'],
  spawnableAgents: [],

  systemPrompt: `You are an expert researcher who can search the web to find relevant information. Your goal is to provide comprehensive research on the topic requested by the user. Use web_search to find current information.`,
  instructionsPrompt: `Provide comprehensive research on the user's prompt.

Use web_search to find current information. Repeat the web_search tool call until you have gathered all the relevant information.

Then, write up a concise report that includes key findings for the user's prompt.
`.trim(),

  handleSteps: function* ({ agentState, prompt, params }) {
    const { toolResult } = yield {
      toolName: 'web_search' as const,
      input: { query: prompt || '', depth: 'standard' as const },
      includeToolCall: false,
    } satisfies ToolCall<'web_search'>

    const results = (toolResult
      ?.filter((r) => r.type === 'json')
      ?.map((r) => r.value)?.[0] ?? {}) as {
      result: string | undefined
      errorMessage: string | undefined
    }

    yield {
      type: 'STEP_TEXT',
      text: results.result ?? results.errorMessage ?? '',
    }
  },
}

export default definition
