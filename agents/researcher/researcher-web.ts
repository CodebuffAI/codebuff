import { publisher } from '../constants'

import type { ToolCall } from '../types/agent-definition'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'researcher-web',
  publisher,
  model: 'google/gemini-3.1-flash-lite-preview',
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
    // Keep helpers inside handleSteps because built-in agents serialize this
    // function without top-level lexical bindings.
    const match = prompt?.match(/https?:\/\/[^\s)\]>"']+/)
    const url = match?.[0].replace(/[.,;:!?]+$/, '')
    const { toolResult } = yield {
      toolName: 'web_search' as const,
      input: url
        ? { url, include_links: true, max_links: 40 }
        : { query: prompt || undefined, depth: 'standard' as const },
      includeToolCall: false,
    } satisfies ToolCall<'web_search'>

    const results = (toolResult
      ?.filter((r) => r.type === 'json')
      ?.map((r) => r.value)?.[0] ?? {}) as {
        result: string | undefined
        errorMessage: string | undefined
        links?: Array<{ href: string; text: string }>
      }
    const linkText =
      results.links && results.links.length > 0
        ? `\n\nLinks:\n${results.links
            .map((link) => `- ${link.text ? `${link.text}: ` : ''}${link.href}`)
            .join('\n')}`
        : ''

    yield {
      type: 'STEP_TEXT',
      text: (results.result ?? results.errorMessage ?? '') + linkText,
    }
  },
}

export default definition
