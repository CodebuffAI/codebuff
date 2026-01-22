import { NoSuchToolError } from 'ai'

import type { Logger } from '@codebuff/common/types/contracts/logger'

/** Result of a repaired tool call for AI SDK's experimental_repairToolCall */
type RepairedToolCall = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  input: string
}

function deepParseJson(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return deepParseJson(JSON.parse(value))
    } catch {
      return value
    }
  }
  if (Array.isArray(value)) return value.map(deepParseJson)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, deepParseJson(v)]),
    )
  }
  return value
}

export function createToolCallRepairHandler(params: {
  spawnableAgents: string[]
  localAgentTemplates: Record<string, unknown>
  logger: Logger
}): (toolCallParams: {
  toolCall: { toolName: string; toolCallId: string; input: unknown }
  tools: Record<string, unknown>
  error: Error
}) => Promise<RepairedToolCall> {
  const { spawnableAgents, localAgentTemplates, logger } = params

  return async ({ toolCall, tools, error }: {
    toolCall: { toolName: string; toolCallId: string; input: unknown }
    tools: Record<string, unknown>
    error: Error
  }) => {
    const toolName = toolCall.toolName

    // Check if this is a NoSuchToolError for a spawnable agent
    if (NoSuchToolError.isInstance(error) && 'spawn_agents' in tools) {
      // Also check for underscore variant (e.g., "file_picker" -> "file-picker")
      const toolNameWithHyphens = toolName.replace(/_/g, '-')

      const matchingAgentId = spawnableAgents.find((agentId) => {
        const withoutVersion = agentId.split('@')[0]
        const parts = withoutVersion.split('/')
        const agentName = parts[parts.length - 1]
        return (
          agentName === toolName ||
          agentName === toolNameWithHyphens ||
          agentId === toolName
        )
      })
      const isSpawnableAgent = matchingAgentId !== undefined
      const isLocalAgent =
        toolName in localAgentTemplates ||
        toolNameWithHyphens in localAgentTemplates

      if (isSpawnableAgent || isLocalAgent) {
        // Transform agent tool call to spawn_agents
        let parsedInput: Record<string, unknown> = {}
        try {
          const rawInput =
            typeof toolCall.input === 'string'
              ? JSON.parse(toolCall.input)
              : (toolCall.input as Record<string, unknown>)
          parsedInput = deepParseJson(rawInput) as Record<string, unknown>
        } catch {
          // JSON parsing failed - use empty object as fallback for malformed input
        }

        const prompt =
          typeof parsedInput.prompt === 'string' ? parsedInput.prompt : undefined
        const agentParams = Object.fromEntries(
          Object.entries(parsedInput).filter(
            ([key, value]) =>
              !(key === 'prompt' && typeof value === 'string'),
          ),
        )

        // Use the matching agent ID or corrected name with hyphens
        const correctedAgentType =
          matchingAgentId ??
          (toolNameWithHyphens in localAgentTemplates
            ? toolNameWithHyphens
            : toolName)

        const spawnAgentsInput = {
          agents: [
            {
              agent_type: correctedAgentType,
              ...(prompt !== undefined && { prompt }),
              ...(Object.keys(agentParams).length > 0 && {
                params: agentParams,
              }),
            },
          ],
        }

        logger.info(
          { originalToolName: toolName, transformedInput: spawnAgentsInput },
          'Transformed agent tool call to spawn_agents',
        )

        return {
          type: 'tool-call' as const,
          toolCallId: toolCall.toolCallId,
          toolName: 'spawn_agents',
          input: JSON.stringify(spawnAgentsInput),
        }
      }
    }

    // For all other cases (invalid args, unknown tools, etc.), pass through
    // the original tool call.
    logger.info(
      {
        toolName,
        errorType: error.name,
        error: error.message,
      },
      'Tool error - passing through for graceful error handling',
    )
    return {
      type: 'tool-call' as const,
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      input: typeof toolCall.input === 'string' 
        ? toolCall.input 
        : JSON.stringify(toolCall.input),
    }
  }
}
