import type { AgentDecisionSchema } from './types'
import type { CodebuffClient } from '@codebuff/sdk'
import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'
import type { z } from 'zod/v4'

// Agent definition for prompting
const promptingAgentDefinition: AgentDefinition = {
  id: 'eval-prompting-agent',
  displayName: 'Evaluation Prompting Agent',
  model: 'openai/gpt-5-chat',
  toolNames: ['set_output', 'end_turn'],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The evaluation context and conversation history',
    },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      reasoning: {
        type: 'string',
        description: 'Detailed reasoning for the decision',
      },
      decision: {
        type: 'string',
        enum: ['continue', 'complete', 'halt'],
        description:
          'Whether to continue, complete, or halt the implementation',
      },
      next_prompt: {
        type: 'string',
        description:
          'The next prompt to send to Codebuff (required if decision is continue)',
      },
    },
    required: ['decision', 'reasoning'],
  },
  systemPrompt: `You are an expert software engineer tasked with implementing a specification using Codebuff, an AI coding assistant. Your goal is to prompt Codebuff to implement the spec correctly.

You cannot and should not make changes yourself. You have no access to tools. You are merely prompting a coding assistant to make changes on your behalf in order to implement the spec.`,
  instructionsPrompt: `Analyze the conversation history and determine whether to:
1. 'continue' - Generate a follow-up prompt for Codebuff the coding agent
2. 'complete' - The implementation is done and satisfies the spec  
3. 'halt' - The implementation is off track and unlikely to be completed

If deciding to continue, include a clear, focused prompt for Codebuff in next_prompt. Don't ask to see files or specific code, instead you should mostly describe the changes you want to make (based on the spec). It's fine to ask questions if you need to in order best implement the spec. But keep in mind you only have a few turns to implement the spec.

Explain your reasoning in detail.

You must use the set_output tool to output your reasoning, decision and next_prompt.`,
}

/**
 * Get the next evaluation prompt using the Codebuff SDK
 */
export async function getNextEvalPrompt({
  client,
  spec,
  conversationHistory,
  attemptsRemaining,
}: {
  client: CodebuffClient
  spec: string
  conversationHistory: string
  attemptsRemaining: number
}): Promise<z.infer<typeof AgentDecisionSchema>> {
  const prompt = `You are in a conversation with Codebuff, an AI coding assistant.
Your conversation with Codebuff so far:
<conversation>${conversationHistory}</conversation>
    
You need to implement the spec via prompting Codebuff the coding agent. You only have ${attemptsRemaining} turns left to implement the spec.

Current spec to implement:
<spec>${spec}</spec>

Note that files can only be changed with tools. If no tools are called, no files were changed.

Analyze the conversation and decide your next action.`

  let lastErrorMessage = ''
  const result = await client.run({
    agent: 'eval-prompting-agent',
    prompt,
    agentDefinitions: [promptingAgentDefinition],
    maxAgentSteps: 5,
    handleEvent: (event) => {
      console.log('event:', event)
      if (event.type === 'error') {
        lastErrorMessage = event.message
      }
    },
  })

  if (!result) {
    return {
      decision: 'halt',
      reasoning: `No valid response from prompting agent. Error:\n${lastErrorMessage}`,
      next_prompt: '',
    }
  }

  const output = result.sessionState.mainAgentState.output
  if (output) {
    return output as z.infer<typeof AgentDecisionSchema>
  }

  // Print this so we can debug when it doesn't output anything.
  console.error(
    'Error: no output from prompting agent. Message history:',
    result.sessionState.mainAgentState.messageHistory,
  )

  // Fallback response
  return {
    decision: 'halt' as const,
    reasoning: `No valid response from prompting agent.`,
    next_prompt: '',
  }
}
