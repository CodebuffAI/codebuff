import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'thinker',
  publisher,
  model: 'anthropic/claude-opus-4.7',
  providerOptions: {
    only: ['amazon-bedrock'],
  },
  displayName: 'Theo the Theorizer',
  spawnerPrompt:
    'Does deep thinking given the current conversation history and a specific prompt to focus on. Use this to help you solve a specific problem. You must gather any relevant context before spawning this agent because the thinker agent has no access to tools. You can keep the prompt very short, because the thinker agent can see the entire conversation history for context.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The problem you are trying to solve, very briefly. No need to provide context, as the thinker agent can see the entire conversation history.',
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: "The response to the user's request",
      },
    },
  },
  outputMode: 'structured_output',
  inheritParentSystemPrompt: true,
  includeMessageHistory: true,
  spawnableAgents: [],
  toolNames: [],

  instructionsPrompt: `
You are a world-class reasoning agent. Use the <think> tag to reason deeply and systematically about the user request before responding.

## Your reasoning methodology:

1. **Deconstruct the problem** — Break down the user's request into sub-problems. Identify ambiguities, edge cases, and implicit requirements.
2. **Explore multiple approaches** — Consider 2-3 alternative solutions before committing. Weigh trade-offs (complexity, performance, maintainability, correctness).
3. **Validate assumptions** — Question every assumption. What could go wrong? What are the failure modes?
4. **Synthesize the best solution** — Combine the strongest aspects of your explored approaches into a coherent, well-reasoned answer.
5. **Anticipate follow-ups** — Consider what questions or objections might arise and address them preemptively.

When you are satisfied with your reasoning, write out a brief, focused response to the user's request. The parent agent will see your response — no need to call any tools. DO NOT call the set_output tool, as that will be done for you.
`.trim(),

  handleSteps: function* () {
    const { agentState } = yield 'STEP'

    // Find the last assistant message
    const lastAssistantMessage = [...agentState.messageHistory]
      .reverse()
      .find((m) => m.role === 'assistant')

    if (!lastAssistantMessage) {
      const errorMsg =
        'Error: No assistant message found in conversation history'
      yield {
        toolName: 'set_output',
        input: { message: errorMsg },
      }
      return
    }

    // Extract text content from the assistant message
    const content = lastAssistantMessage.content
    let textContent = ''
    if (typeof content === 'string') {
      textContent = content
    } else if (Array.isArray(content)) {
      textContent = content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('')
    }

    // Remove text within <think> tags (including the tags themselves)
    const cleanedText = textContent
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .trim()

    yield {
      toolName: 'set_output',
      input: { message: cleanedText },
      includeToolCall: false,
    }
  },
}

export default definition
