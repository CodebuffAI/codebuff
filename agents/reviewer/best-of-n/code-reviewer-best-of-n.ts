import { publisher } from '../../constants'

import type {
  AgentStepContext,
  StepText,
  ToolCall,
} from '../../types/agent-definition'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../../types/secret-agent-definition'

export function createCodeReviewerBestOfN(
  model: 'sonnet' | 'gpt-5' | 'gemini',
): Omit<SecretAgentDefinition, 'id'> {
  const isGpt5 = model === 'gpt-5'
  const isGemini = model === 'gemini'

  return {
    publisher,
    model: isGpt5
      ? 'openai/gpt-5.1'
      : isGemini
        ? 'google/gemini-3-pro-preview'
        : 'anthropic/claude-sonnet-4.5',
    displayName: isGpt5
      ? 'Best-of-N GPT-5 Code Reviewer'
      : isGemini
        ? 'Best-of-N Gemini Code Reviewer'
        : 'Best-of-N Fast Code Reviewer',
    spawnerPrompt:
      'Reviews code by orchestrating multiple reviewer agents to generate review proposals, selects the best one, and provides the final review. Do not specify an input prompt for this agent; it reads the context from the message history.',

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    toolNames: ['spawn_agents'],
    spawnableAgents: [
      isGemini ? 'code-reviewer-selector-gemini' : 'code-reviewer-selector',
    ],

    inputSchema: {
      params: {
        type: 'object',
        properties: {
          n: {
            type: 'number',
            description:
              'Number of parallel reviewer agents to spawn. Defaults to 5. Use fewer for simple reviews and max of 10 for complex reviews.',
          },
        },
      },
    },
    outputMode: 'last_message',

    instructionsPrompt: `You are one agent within the code-reviewer-best-of-n. You were spawned to generate a comprehensive code review for the recent changes.

Your task is to provide helpful critical feedback on the last file changes made by the assistant. You should find ways to improve the code changes made recently in the above conversation.

Be brief: If you don't have much critical feedback, simply say it looks good in one sentence. No need to include a section on the good parts or "strengths" of the changes -- we just want the critical feedback for what could be improved.

NOTE: You cannot make any changes directly! Nor cany you spawn any other agents, or use any tools. You can only suggest changes.

# Guidelines

- Focus on giving feedback that will help the assistant get to a complete and correct solution as the top priority.
- Make sure all the requirements in the user's message are addressed. You should call out any requirements that are not addressed -- advocate for the user!
- Try to keep any changes to the codebase as minimal as possible.
- Simplify any logic that can be simplified.
- Where a function can be reused, reuse it and do not create a new one.
- Make sure that no new dead code is introduced.
- Make sure there are no missing imports.
- Make sure no sections were deleted that weren't supposed to be deleted.
- Make sure the new code matches the style of the existing code.
- Make sure there are no unnecessary try/catch blocks. Prefer to remove those.
- Look for logical errors in the code.
- Look for missed cases in the code.
- Look for any other bugs.
- Look for opportunities to improve the code's readability.

**Important**: Do not use any tools! You are only reviewing!

For reference, here is the original user request:
<user_message>
${PLACEHOLDER.USER_INPUT_PROMPT}
</user_message>

${
  isGpt5
    ? `Now, give your review. Be concise and focus on the most important issues that need to be addressed.`
    : `
You can also use tags interspersed throughout your review to think about the best way to analyze the changes. Keep these thoughts very brief. You may not need to use think tags at all.

<example>


[ Brief thoughts about the changes made ]


Your critical feedback here...


[ Thoughts about a specific issue ]


More feedback...

</example>`
}

Be extremely concise and focus on the most important issues that need to be addressed.`,

    handleSteps: isGpt5 ? handleStepsGpt5 : isGemini ? handleStepsGemini : handleStepsSonnet,
  }
}

function* handleStepsSonnet({
  agentState,
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const selectorAgent = 'code-reviewer-selector'
  const n = Math.min(10, Math.max(1, (params?.n as number | undefined) ?? 5))

  // Use GENERATE_N to generate n review outputs
  const { nResponses = [] } = yield {
    type: 'GENERATE_N',
    n,
  }

  // Extract all the reviews
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const reviews = nResponses.map((content, index) => ({
    id: letters[index],
    content,
  }))

  // Spawn selector with reviews as params
  const { toolResult: selectorResult } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: selectorAgent,
          params: { reviews },
        },
      ],
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const selectorOutput = extractSpawnResults<{
    reviewId: string
  }>(selectorResult)[0]

  function extractSpawnResults<T>(
    results: any[] | undefined,
  ): (T | { errorMessage: string })[] {
    if (!results) return []
    const spawnedResults = results
      .filter((result) => result.type === 'json')
      .map((result) => result.value)
      .flat() as {
      agentType: string
      value: { value?: T; errorMessage?: string }
    }[]
    return spawnedResults.map(
      (result) =>
        result.value.value ??
        ({
          errorMessage:
            result.value.errorMessage ?? 'Error extracting spawn results',
        } as { errorMessage: string }),
    )
  }

  if ('errorMessage' in selectorOutput) {
    yield {
      type: 'STEP_TEXT',
      text: selectorOutput.errorMessage,
    } satisfies StepText
    return
  }
  const { reviewId } = selectorOutput
  const chosenReview = reviews.find((review) => review.id === reviewId)
  if (!chosenReview) {
    yield {
      type: 'STEP_TEXT',
      text: 'Failed to find chosen review.',
    } satisfies StepText
    return
  }

  yield {
    type: 'STEP_TEXT',
    text: chosenReview.content,
  } satisfies StepText
}

function* handleStepsGemini({
  agentState,
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const selectorAgent = 'code-reviewer-selector-gemini'
  const n = Math.min(10, Math.max(1, (params?.n as number | undefined) ?? 5))

  // Use GENERATE_N to generate n review outputs
  const { nResponses = [] } = yield {
    type: 'GENERATE_N',
    n,
  }

  // Extract all the reviews
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const reviews = nResponses.map((content, index) => ({
    id: letters[index],
    content,
  }))

  // Spawn selector with reviews as params
  const { toolResult: selectorResult } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: selectorAgent,
          params: { reviews },
        },
      ],
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const selectorOutput = extractSpawnResults<{
    reviewId: string
  }>(selectorResult)[0]

  function extractSpawnResults<T>(
    results: any[] | undefined,
  ): (T | { errorMessage: string })[] {
    if (!results) return []
    const spawnedResults = results
      .filter((result) => result.type === 'json')
      .map((result) => result.value)
      .flat() as {
      agentType: string
      value: { value?: T; errorMessage?: string }
    }[]
    return spawnedResults.map(
      (result) =>
        result.value.value ??
        ({
          errorMessage:
            result.value.errorMessage ?? 'Error extracting spawn results',
        } as { errorMessage: string }),
    )
  }

  if ('errorMessage' in selectorOutput) {
    yield {
      type: 'STEP_TEXT',
      text: selectorOutput.errorMessage,
    } satisfies StepText
    return
  }
  const { reviewId } = selectorOutput
  const chosenReview = reviews.find((review) => review.id === reviewId)
  if (!chosenReview) {
    yield {
      type: 'STEP_TEXT',
      text: 'Failed to find chosen review.',
    } satisfies StepText
    return
  }

  yield {
    type: 'STEP_TEXT',
    text: chosenReview.content,
  } satisfies StepText
}

function* handleStepsGpt5({
  agentState,
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const selectorAgent = 'code-reviewer-selector'
  const n = Math.min(10, Math.max(1, (params?.n as number | undefined) ?? 5))

  // Use GENERATE_N to generate n review outputs
  const { nResponses = [] } = yield {
    type: 'GENERATE_N',
    n,
  }

  // Extract all the reviews
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const reviews = nResponses.map((content, index) => ({
    id: letters[index],
    content,
  }))

  // Spawn selector with reviews as params
  const { toolResult: selectorResult } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: selectorAgent,
          params: { reviews },
        },
      ],
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const selectorOutput = extractSpawnResults<{
    reviewId: string
    reasoning: string
  }>(selectorResult)[0]

  function extractSpawnResults<T>(
    results: any[] | undefined,
  ): (T | { errorMessage: string })[] {
    if (!results) return []
    const spawnedResults = results
      .filter((result) => result.type === 'json')
      .map((result) => result.value)
      .flat() as {
      agentType: string
      value: { value?: T; errorMessage?: string }
    }[]
    return spawnedResults.map(
      (result) =>
        result.value.value ??
        ({
          errorMessage:
            result.value.errorMessage ?? 'Error extracting spawn results',
        } as { errorMessage: string }),
    )
  }

  if ('errorMessage' in selectorOutput) {
    yield {
      type: 'STEP_TEXT',
      text: selectorOutput.errorMessage,
    } satisfies StepText
    return
  }
  const { reviewId } = selectorOutput
  const chosenReview = reviews.find((review) => review.id === reviewId)
  if (!chosenReview) {
    yield {
      type: 'STEP_TEXT',
      text: 'Failed to find chosen review.',
    } satisfies StepText
    return
  }

  yield {
    type: 'STEP_TEXT',
    text: chosenReview.content,
  } satisfies StepText
}

const definition = {
  ...createCodeReviewerBestOfN('sonnet'),
  id: 'code-reviewer-best-of-n',
}
export default definition
