import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'thinker',
  publisher,
  // Thinker does deep, extended-reasoning single-step work. Raise the
  // wall-clock bound above the 20-min shared default so genuinely long
  // reasoning isn't cut off, but keep it bounded to avoid unbounded hangs
  // on a stuck LLM stream.
  defaultTimeoutMs: 30 * 60 * 1000,
  displayName: 'Theo the Theorizer',
  spawnerPrompt:
    'Makes a focused architecture, design, or root-cause decision from a self-contained evidence packet. It has no repository tools and does not inherit conversation history, so include evidence, constraints, options, and unknowns.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A self-contained decision packet: decision to make, confirmed evidence, constraints, competing options, risks, and unknowns.',
    },
    params: {
      type: 'object' as const,
      properties: {
        // M2.3: optional depth hint lets the spawner dial reasoning effort.
        depth: {
          type: 'string' as const,
          enum: ['shallow', 'deep'] as const,
          description:
            'Optional reasoning-depth hint. "shallow" asks for a concise, first-principles answer with a short thinking chain; "deep" (default) asks for extended reasoning before the final answer.',
        },
        // M2.3: optional outputSchemaHint lets the spawner request a specific
        // shape for the `message` content. The runtime contract stays
        // { message: string }; this hint only guides how the model formats
        // that string (e.g. serialize a JSON object into it).
        outputSchemaHint: {
          type: 'string' as const,
          description:
            'Optional description of the desired shape of the `message` content (e.g. "a JSON object with fields: summary, risks, recommendation"). The thinker still returns { message: string }; this hint only guides how the message string is formatted.',
        },
      },
      required: [] as const,
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
  inheritParentSystemPrompt: false,
  includeMessageHistory: false,
  spawnableAgents: [],
  toolNames: ['set_output'],

  instructionsPrompt: `
You are a thinker agent. Reason only from the self-contained decision packet in the current prompt. Do not assume access to parent conversation history or operational state. Use the <think> tag to think deeply about the request.

When satisfied, write out a brief response to the user's request. The parent agent will see your response -- DO NOT call any tools, including set_output. Structured output is captured automatically for you.

If the caller passed params.depth === 'shallow', keep your thinking chain short and lead with the answer. If params.depth === 'deep' (or omitted), reason thoroughly before the final answer.
If the caller passed params.outputSchemaHint, format your final message content to match that shape (e.g. valid JSON with the requested fields). The runtime still wraps your output as { message: string }, so serialize structured content into that string.
`.trim(),

  handleSteps: function* ({
    params,
  }: {
    params?: { depth?: string; outputSchemaHint?: string }
  }) {
    // M2.3: depth/outputSchemaHint are surfaced to the model via the
    // instructionsPrompt; the handleSteps body only needs agentState. Params
    // are accepted (so the signature matches the input schema) but not
    // consumed here because the model reads them during generation.
    void params
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
