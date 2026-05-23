import { publisher } from '../../constants'

import type { AgentStepContext, ToolCall } from '../../types/agent-definition'
import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

/**
 * Creates a multi-prompt editor agent that spawns one implementor per prompt.
 * Each prompt specifies a slightly different implementation strategy/approach.
 * Uses propose_* tools to draft changes, then applies the chosen implementation.
 */
export function createMultiPromptEditor(): Omit<SecretAgentDefinition, 'id'> {
  return {
    publisher,
    model: 'anthropic/claude-opus-4.7',
    providerOptions: {
      only: ['amazon-bedrock'],
    },
    displayName: 'Multi-Prompt Editor',
    spawnerPrompt:
      'Edits code by spawning multiple implementor agents with different strategy prompts, selects the best implementation, and applies the changes. It also returns further suggested improvements which you should take seriously and act on. Pass as input an array of short prompts specifying different implementation approaches or strategies. Make sure to read any files intended to be edited before spawning this agent.',

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    toolNames: [
      'spawn_agents',
      'str_replace',
      'write_file',
      'set_messages',
      'set_output',
    ],
    spawnableAgents: [
      'best-of-n-selector2',
      'editor-implementor-proposal-1',
      'editor-implementor-proposal-2',
      'editor-implementor-proposal-3',
      'editor-implementor-proposal-4',
      'editor-implementor-proposal-5',
      'editor-implementor-opus',
      'editor-implementor-gpt-5',
    ],

    inputSchema: {
      params: {
        type: 'object',
        properties: {
          prompts: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Array of short prompts, each specifying a slightly different implementation strategy or approach. Example: ["use a cache for the data", "don\t cache anything", "make the minimal possible changes", "modularize your solution by creating new files"]',
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
  agentState,
  params,
}: AgentStepContext): ReturnType<
  NonNullable<SecretAgentDefinition['handleSteps']>
> {
  const prompts = (params?.prompts as string[] | undefined) ?? []

  if (prompts.length === 0) {
    yield {
      toolName: 'set_output',
      input: {
        error: 'No prompts provided. Please pass an array of strategy prompts.',
      },
    } satisfies ToolCall<'set_output'>
    return
  }

  // Only keep messages up to just before the last user role message (skips input prompt, instructions prompt).
  const { messageHistory: initialMessageHistory } = agentState
  let userMessageIndex = initialMessageHistory.length

  while (userMessageIndex > 0) {
    const message = initialMessageHistory[userMessageIndex - 1]
    if (message.role === 'user') {
      userMessageIndex--
    } else {
      break
    }
  }
  const updatedMessageHistory = initialMessageHistory.slice(0, userMessageIndex)
  yield {
    toolName: 'set_messages',
    input: {
      messages: updatedMessageHistory,
    },
    includeToolCall: false,
  } satisfies ToolCall<'set_messages'>

  const proposalAgentTypes = [
    'editor-implementor-proposal-1',
    'editor-implementor-proposal-2',
    'editor-implementor-proposal-3',
    'editor-implementor-proposal-4',
    'editor-implementor-proposal-5',
  ] as const

  type ProposalResult = {
    toolCalls: { toolName: string; input: any }[]
    toolResults: any[]
    unifiedDiffs: string
  }

  // Spawn proposal implementors sequentially. The parallel batch was fast with
  // the hosted backend, but local OpenAI-compatible/OAuth providers often have
  // low per-account concurrency; when one stream stalls the whole Promise.all
  // batch waits forever. Sequential spawning is slower but much more reliable,
  // and the per-proposal retry below prevents one flaky model call from losing
  // the entire best-of-N run.
  const spawnedImplementations: ProposalResult[] = []
  const maxProposalAttempts = 2

  for (const [index, prompt] of prompts.entries()) {
    const agentType =
      proposalAgentTypes[index] ??
      proposalAgentTypes[proposalAgentTypes.length - 1]
    let lastResult: ProposalResult | { errorMessage: string } | undefined

    for (let attempt = 0; attempt < maxProposalAttempts; attempt++) {
      const { toolResult: implementorResults } = yield {
        toolName: 'spawn_agents',
        input: {
          agents: [
            {
              agent_type: agentType,
              prompt:
                attempt === 0
                  ? `Strategy: ${prompt}`
                  : `Retry Strategy: ${prompt}\n\nThe previous proposal attempt did not return usable edit tool calls. Produce the implementation now by calling propose_str_replace or propose_write_file. Do not narrate or continue thinking.`,
            },
          ],
        },
        includeToolCall: false,
      } satisfies ToolCall<'spawn_agents'>

      lastResult = extractSpawnResults<ProposalResult | { errorMessage: string }>(
        implementorResults,
      )[0]

      if (isUsableProposal(lastResult)) {
        break
      }
    }

    spawnedImplementations.push(
      lastResult && 'toolCalls' in lastResult
        ? lastResult
        : {
            toolCalls: [],
            toolResults: [],
            unifiedDiffs:
              'errorMessage' in (lastResult ?? {})
                ? `Error: ${(lastResult as { errorMessage: string }).errorMessage}`
                : 'Error: proposal failed to return a usable implementation',
          },
    )
  }

  // Build implementations for selector using the unified diffs
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const implementations = spawnedImplementations.map((result, index) => {
    if (!result || (typeof result === 'object' && 'errorMessage' in result)) {
      return {
        id: letters[index],
        strategy: prompts[index] ?? 'unknown',
        content: `Error: ${(result as any)?.errorMessage ?? 'Unknown error'}`,
        toolCalls: [] as { toolName: string; input: any }[],
      }
    }

    return {
      id: letters[index],
      strategy: prompts[index] ?? 'unknown',
      content: result.unifiedDiffs || 'No changes proposed',
      toolCalls: result.toolCalls ?? [],
    }
  })

  // Spawn selector with implementations (showing unified diffs for review)
  const { toolResult: selectorResult } = yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: 'best-of-n-selector2',
          params: {
            implementations: implementations.map((impl) => ({
              id: impl.id,
              strategy: impl.strategy,
              content: impl.content,
            })),
          },
        },
      ],
    },
    includeToolCall: false,
  } satisfies ToolCall<'spawn_agents'>

  const selectorOutput = extractSpawnResults<{
    implementationId: string
    reason: string
    suggestedImprovements: string
  }>(selectorResult)[0]

  const fallbackImplementation = implementations.find(
    (implementation) => implementation.toolCalls.length > 0,
  )

  if (!selectorOutput || !('implementationId' in selectorOutput)) {
    if (fallbackImplementation) {
      yield* applyImplementation({
        chosenImplementation: fallbackImplementation,
        reason:
          'Selector failed to return an implementation; applied the first usable proposal instead.',
        suggestedImprovements:
          'The selector model failed. Check its provider quota/credentials or route editor-selector to a local/OpenAI-compatible model.',
      })
      return
    }

    yield {
      toolName: 'set_output',
      input: {
        error:
          'Selector failed to return an implementation, and no proposal returned usable edit tool calls.',
      },
    } satisfies ToolCall<'set_output'>
    return
  }

  const { implementationId } = selectorOutput
  let chosenImplementation = implementations.find(
    (implementation) => implementation.id === implementationId,
  )

  if (!chosenImplementation) {
    if (fallbackImplementation) {
      yield* applyImplementation({
        chosenImplementation: fallbackImplementation,
        reason: `Selector chose unknown implementation ${implementationId}; applied the first usable proposal instead.`,
        suggestedImprovements: selectorOutput.suggestedImprovements,
      })
      return
    }

    yield {
      toolName: 'set_output',
      input: {
        error: `Failed to find chosen implementation: ${implementationId}`,
      },
    } satisfies ToolCall<'set_output'>
    return
  }

  if (chosenImplementation.toolCalls.length === 0 && fallbackImplementation) {
    chosenImplementation = fallbackImplementation
  }

  // Extract suggested improvements from selector output
  const { reason, suggestedImprovements } = selectorOutput

  yield* applyImplementation({
    chosenImplementation,
    reason:
      chosenImplementation.id === implementationId
        ? reason
        : `${reason}\n\nSelector chose an unusable implementation, so the first usable proposal was applied instead.`,
    suggestedImprovements,
  })

  /**
   * Extracts the array of subagent results from spawn_agents tool output.
   */
  function extractSpawnResults<T>(results: any[] | undefined): T[] {
    if (!results || results.length === 0) return []

    const jsonResult = results.find((r) => r.type === 'json')
    if (!jsonResult?.value) return []

    const spawnedResults = Array.isArray(jsonResult.value)
      ? jsonResult.value
      : [jsonResult.value]

    return spawnedResults
      .map((result: any) => result?.value)
      .map((result: any) =>
        result && 'value' in result ? result.value : result,
      )
      .filter(Boolean)
  }

  function isUsableProposal(
    result: ProposalResult | { errorMessage: string } | undefined,
  ): result is ProposalResult {
    return Boolean(
      result &&
        'toolCalls' in result &&
        Array.isArray(result.toolCalls) &&
        result.toolCalls.length > 0 &&
        typeof result.unifiedDiffs === 'string' &&
        result.unifiedDiffs.trim().length > 0,
    )
  }

  function* applyImplementation(params: {
    chosenImplementation: (typeof implementations)[number]
    reason: string
    suggestedImprovements: string
  }): ReturnType<NonNullable<SecretAgentDefinition['handleSteps']>> {
    const { chosenImplementation, reason, suggestedImprovements } = params

    // Apply the chosen implementation's tool calls as real edits
    const appliedToolResults: any[] = []
    for (const toolCall of chosenImplementation.toolCalls) {
      // Convert propose_* tool calls to real edit tool calls
      const realToolName =
        toolCall.toolName === 'propose_str_replace'
          ? 'str_replace'
          : toolCall.toolName === 'propose_write_file'
            ? 'write_file'
            : toolCall.toolName

      if (realToolName === 'str_replace' || realToolName === 'write_file') {
        const { toolResult } = yield {
          toolName: realToolName,
          input: toolCall.input,
          includeToolCall: true,
        } satisfies ToolCall<'str_replace'> | ToolCall<'write_file'>

        appliedToolResults.push(toolResult)
      }
    }

    // Set output with the applied results and suggested improvements
    yield {
      toolName: 'set_output',
      input: {
        chosenStrategy: chosenImplementation.strategy,
        reason,
        toolResults: appliedToolResults,
        suggestedImprovements,
      },
      includeToolCall: false,
    } satisfies ToolCall<'set_output'>
  }
}

const definition = {
  ...createMultiPromptEditor(),
  id: 'editor-multi-prompt',
}
export default definition
