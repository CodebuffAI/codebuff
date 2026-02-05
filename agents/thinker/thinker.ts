import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'thinker',
  publisher,
  model: 'anthropic/claude-opus-4.6',
  displayName: 'Theo the Theorizer',
  spawnerPrompt:
    'Does deep thinking given the current conversation history and a specific prompt to focus on. Use this to help you solve a specific problem. It is better to gather any relevant context before spawning this agent.',
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
You are a thinker agent. Use the <think> tag to think deeply about the user request.

When satisfied, write out a brief response to the user's request. The parent agent will see your response -- no need to call any tools. DO NOT call the set_output tool, as that will be done for you.
`.trim(),

  handleSteps: function* () {
    const { agentState } = yield 'STEP'

    // Find the last assistant message
    const lastAssistantMessage = [...agentState.messageHistory]
      .reverse()
      .find((m) => m.role === 'assistant')

    if (!lastAssistantMessage) {
      const errorMsg = 'Error: No assistant message found in conversation history'
      // Using console.error because agents run in a sandboxed environment without access to structured logger
      console.error('Thinker agent:', errorMsg)
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
