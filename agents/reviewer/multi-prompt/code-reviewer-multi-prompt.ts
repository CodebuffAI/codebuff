import { publisher } from '../../constants'

import type { AgentStepContext, ToolCall } from '../../types/agent-definition'
import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

/**
 * Creates a multi-prompt code reviewer agent that spawns one code-reviewer per prompt.
 * Each prompt specifies a slightly different review focus or perspective.
 * Combines all review outputs into a single comprehensive review.
 */
export function createCodeReviewerMultiPrompt(): Omit<
  SecretAgentDefinition,
  'id'
> {
  return {
    publisher,
    model: 'anthropic/claude-opus-4.5',
    displayName: 'Multi-Prompt Code Reviewer',
    spawnerPrompt:
      'Reviews code by spawning multiple code-reviewer agents with different focus prompts, then combines all review outputs into a comprehensive review. Make sure to read relevant files before spawning this agent. Pass an input array of short prompts specifying several different review focuses or perspectives.',

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    toolNames: ['spawn_agents', 'set_output'],
    spawnableAgents: ['code-reviewer'],

    inputSchema: {
      params: {
        type: 'object',
        properties: {
          prompts: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Array of 3-5 short prompts, each specifying a different review focus or perspective. Example: ["api design", "frontend changes", "correctness and edge cases", "code style and readability", "performance implications", "security concerns"]',
          },
        },
        required: ['prompts'],
      },
    },
    outputMode: 'structured_output',

    handleSteps: handleStepsMultiPrompt,
  }
}

function* handleStepsMultiPrompt({
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const prompts = (params?.prompts as string[] | undefined) ?? []

  if (prompts.length === 0) {
    yield {
      toolName: 'set_output',
      input: {
        error:
          'No prompts provided. Please pass an array of review focus prompts.',
      },
    } satisfies ToolCall<'set_output'>
    return
  }

  // Spawn one code-reviewer per prompt
  const reviewerAgents: { agent_type: string; prompt: string }[] = prompts.map(
    (prompt) => ({
      agent_type: 'code-reviewer',
      prompt: `Review focus: ${prompt}`,
    }),
  )

  // Spawn all reviewer agents
  const { toolResult: reviewerResults } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: reviewerAgents,
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  // Extract spawn results - each is last_message output (string content)
  const spawnedReviews = extractSpawnResults<string>(reviewerResults)

  // Combine all reviews with their focus areas
  const combinedReviews = spawnedReviews
    .map((review, index) => {
      const focus = prompts[index] ?? 'unknown'
      if (!review || (typeof review === 'object' && 'errorMessage' in review)) {
        return `## Review Focus: ${focus}\n\nError: ${(review as { errorMessage?: string })?.errorMessage ?? 'Unknown error'}`
      }
      return `## Review Focus: ${focus}\n\n${review}`
    })
    .join('\n\n---\n\n')

  // Set output with the combined reviews
  yield {
    toolName: 'set_output',
    input: {
      reviews: spawnedReviews,
      combinedReview: combinedReviews,
      promptCount: prompts.length,
    },
    includeToolCall: false,
  } satisfies ToolCall<'set_output'>

  /**
   * Extracts the array of subagent results from spawn_agents tool output.
   * For code-reviewer agents with outputMode: 'last_message', the value is the message content.
   */
  function extractSpawnResults<T>(
    results: { type: string; value?: unknown }[] | undefined,
  ): (T | { errorMessage: string })[] {
    if (!results || results.length === 0) return []

    const jsonResult = results.find((r) => r.type === 'json')
    if (!jsonResult?.value) return []

    const spawnedResults = Array.isArray(jsonResult.value)
      ? jsonResult.value
      : [jsonResult.value]

    const extracted: (T | { errorMessage: string })[] = []
    for (const result of spawnedResults) {
      const innerValue = result?.value
      if (
        innerValue &&
        typeof innerValue === 'object' &&
        'value' in innerValue
      ) {
        extracted.push(innerValue.value as T)
      } else if (
        innerValue &&
        typeof innerValue === 'object' &&
        'errorMessage' in innerValue
      ) {
        extracted.push({ errorMessage: String(innerValue.errorMessage) })
      } else if (innerValue != null) {
        extracted.push(innerValue as T)
      }
    }
    return extracted
  }
}

const definition = {
  ...createCodeReviewerMultiPrompt(),
  id: 'code-reviewer-multi-prompt',
}
export default definition
