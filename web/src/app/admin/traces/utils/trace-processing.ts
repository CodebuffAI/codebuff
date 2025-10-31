import { parseToolCallXml } from '@codebuff/internal'

import type { TraceMessage } from '@/app/api/admin/traces/[clientRequestId]/messages/route'
import type { TimelineEvent } from '@/app/api/admin/traces/[clientRequestId]/timeline/route'

/**
 * Represents a parsed tool call from message content
 */
export interface ParsedToolCall {
  name: string
  id?: string
  input?: any
  rawXml?: string
}

/**
 * Represents a spawned agent parsed from tool calls
 */
export interface SpawnedAgent {
  agentType: string
  prompt?: string
  params?: any
}

// List of known tool names from the backend
const KNOWN_TOOL_NAMES = [
  'read_files',
  'write_file',
  'str_replace',
  'run_terminal_command',
  'code_search',
  'browser_logs',
  'spawn_agents',
  'web_search',
  'read_docs',
  'run_file_change_hooks',
  'add_subgoal',
  'update_subgoal',
  'create_plan',
  'find_files',
  'think_deeply',
  'end_turn',
]

/**
 * Parse tool call XML and convert to proper types
 */
function parseToolCallParams(xmlString: string): Record<string, any> {
  const stringParams = parseToolCallXml(xmlString)
  const result: Record<string, any> = {}

  // Convert string values to proper types
  for (const [key, value] of Object.entries(stringParams)) {
    try {
      // Try to parse as JSON first (for arrays and objects)
      result[key] = JSON.parse(value)
    } catch {
      // If it's not valid JSON, keep it as a string
      result[key] = value
    }
  }

  return result
}

/**
 * Parse tool calls from message content (both XML and structured formats)
 */
export function parseToolCallsFromContent(
  messageContent: any,
): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = []

  if (typeof messageContent === 'string') {
    // Parse XML-style tool calls from string content
    // Create regex pattern that matches any of the known tool names
    const toolNamesPattern = KNOWN_TOOL_NAMES.join('|')
    const toolCallRegex = new RegExp(
      `<(${toolNamesPattern})>([\\s\\S]*?)<\\/\\1>`,
      'g',
    )

    let match

    while ((match = toolCallRegex.exec(messageContent)) !== null) {
      const toolName = match[1]
      const toolContent = match[2]

      // Parse parameters from tool content
      const params = parseToolCallParams(toolContent)

      toolCalls.push({
        name: toolName,
        input: params,
        rawXml: match[0],
      })
    }
  } else if (Array.isArray(messageContent)) {
    // Handle structured content (Anthropic format)
    for (const item of messageContent) {
      if (item.type === 'tool_use') {
        toolCalls.push({
          name: item.name,
          id: item.id,
          input: item.input,
        })
      }
    }
  }

  return toolCalls
}

/**
 * Parse spawned agents from tool calls
 */
export function parseSpawnedAgentsFromToolCalls(
  toolCalls: ParsedToolCall[],
): SpawnedAgent[] {
  const spawnedAgents: SpawnedAgent[] = []

  for (const call of toolCalls) {
    if (call.name === 'spawn_agents' && call.input?.agents) {
      for (const agent of call.input.agents) {
        spawnedAgents.push({
          agentType: agent.agent_type || 'unknown',
          prompt: agent.prompt,
          params: agent.params,
        })
      }
    }
  }

  return spawnedAgents
}

/**
 * Build timeline events from trace messages
 */
export function buildTimelineFromMessages(
  messages: TraceMessage[],
  mainClientRequestId?: string,
): TimelineEvent[] {
  const timelineEvents: TimelineEvent[] = []
  let eventIdCounter = 0

  // Group messages by client_request_id
  const messagesByRequestId = messages.reduce(
    (acc, msg) => {
      if (!acc[msg.client_request_id ?? 'NULL']) {
        acc[msg.client_request_id ?? 'NULL'] = []
      }
      acc[msg.client_request_id ?? 'NULL'].push(msg)
      return acc
    },
    {} as Record<string, TraceMessage[]>,
  )

  // Track spawned agents and their relationships
  const spawnedAgentInfo = new Map<
    string,
    {
      parentEventId: string
      agentType: string
      prompt?: string
    }
  >()

  // Determine the main request ID
  const mainRequestId = mainClientRequestId || messages[0]?.client_request_id
  if (!mainRequestId) return []

  // Process main request messages first
  const mainMessages = messagesByRequestId[mainRequestId] || []

  for (let i = 0; i < mainMessages.length; i++) {
    const message = mainMessages[i]

    // Calculate timing
    const startTime =
      i === 0
        ? new Date(message.finished_at.getTime() - (message.latency_ms || 0))
        : messages[i - 1].finished_at
    const endTime = message.finished_at

    // Create agent step event
    const agentStepId = `event-${++eventIdCounter}`
    const agentStepEvent: TimelineEvent = {
      id: agentStepId,
      type: 'agent_step',
      name: `Agent Step ${i + 1}`,
      startTime,
      endTime,
      duration: message.latency_ms || 0,
      metadata: {
        model: message.model,
      },
    }
    timelineEvents.push(agentStepEvent)

    // Parse tool calls from response
    if (message.response) {
      // The response field contains the assistant's message content
      // It could be a string, an object with content, or an array of content parts
      let responseContent = ''

      if (typeof message.response === 'string') {
        responseContent = message.response
      } else if (message.response?.content) {
        // Handle structured response with content field
        if (typeof message.response.content === 'string') {
          responseContent = message.response.content
        } else if (Array.isArray(message.response.content)) {
          // Handle array of content parts (Anthropic format)
          responseContent = message.response.content
            .map((part: any) => {
              if (typeof part === 'string') return part
              if (part.type === 'text' && part.text) return part.text
              return ''
            })
            .join('')
        }
      } else if (message.response?.message?.content) {
        // Handle nested message structure
        responseContent = extractAssistantResponseFromResponse(message.response)
      } else if (message.response?.response) {
        // Handle nested response field
        responseContent =
          typeof message.response.response === 'string'
            ? message.response.response
            : JSON.stringify(message.response.response)
      }

      const toolCalls = parseToolCallsFromContent(responseContent)

      // Estimate timing for tool calls within the agent step
      const stepDuration = message.latency_ms || 0
      let toolCallOffset = 0.3 // Start tool calls 30% into the step

      // Create tool call events and spawned agent events
      for (const toolCall of toolCalls) {
        if (toolCall.name === 'spawn_agents') {
          // Parse spawned agents from this tool call
          const agents = toolCall.input?.agents || []

          for (const agent of agents) {
            const spawnedAgentEventId = `event-${++eventIdCounter}`
            const agentType = agent.agent_type || agent.agentType || 'unknown'

            timelineEvents.push({
              id: spawnedAgentEventId,
              type: 'spawned_agent',
              name: agentType,
              startTime: new Date(
                startTime.getTime() + stepDuration * toolCallOffset,
              ),
              endTime: new Date(
                startTime.getTime() + stepDuration * (toolCallOffset + 0.2),
              ),
              duration: stepDuration * 0.2,
              parentId: agentStepId,
              metadata: {
                agentType,
                result: {
                  prompt: agent.prompt,
                  params: agent.params,
                },
              },
            })

            // Track this spawn for linking with agent messages later
            const spawnTime = message.finished_at.getTime()

            // Find messages that could be from this spawned agent
            for (const [requestId, agentMessages] of Object.entries(
              messagesByRequestId,
            )) {
              if (requestId === mainRequestId) continue

              const firstMessage = agentMessages[0]
              if (!firstMessage) continue

              // Check timing - spawned agent messages should come after spawn
              const timeDiff = firstMessage.finished_at.getTime() - spawnTime
              if (timeDiff > 0 && timeDiff < 60000) {
                // Within 60 seconds
                spawnedAgentInfo.set(requestId, {
                  parentEventId: spawnedAgentEventId,
                  agentType,
                  prompt: agent.prompt,
                })
              }
            }
          }
          toolCallOffset += 0.15 // Space out events
        } else {
          // Regular tool call
          timelineEvents.push({
            id: `event-${++eventIdCounter}`,
            type: 'tool_call',
            name: toolCall.name,
            startTime: new Date(
              startTime.getTime() + stepDuration * toolCallOffset,
            ),
            endTime: new Date(
              startTime.getTime() + stepDuration * (toolCallOffset + 0.2),
            ),
            duration: stepDuration * 0.2,
            parentId: agentStepId,
            metadata: {
              toolName: toolCall.name,
              result: toolCall.input,
            },
          })
          toolCallOffset += 0.15 // Space out tool calls
        }
      }
    }
  }

  // Process spawned agent messages
  for (const [requestId, agentMessages] of Object.entries(
    messagesByRequestId,
  )) {
    if (requestId === mainRequestId) continue

    const agentInfo = spawnedAgentInfo.get(requestId)
    if (!agentInfo) continue // Skip if we don't know about this agent

    // Process messages from this spawned agent
    for (let i = 0; i < agentMessages.length; i++) {
      const message = agentMessages[i]

      // Calculate timing
      const startTime =
        i === 0
          ? new Date(message.finished_at.getTime() - (message.latency_ms || 0))
          : agentMessages[i - 1].finished_at
      const endTime = message.finished_at

      // Create agent step event for spawned agent
      const agentStepId = `event-${++eventIdCounter}`
      timelineEvents.push({
        id: agentStepId,
        type: 'agent_step',
        name: `${agentInfo.agentType} Step ${i + 1}`,
        startTime,
        endTime,
        duration: message.latency_ms || 0,
        parentId: agentInfo.parentEventId,
        metadata: {
          model: message.model,
          agentType: agentInfo.agentType,
          isSpawnedAgent: true,
        },
      })

      // Parse and add tool calls from spawned agent
      const responseContent = extractResponseContent(message.response)
      const toolCalls = parseToolCallsFromContent(responseContent)

      const stepDuration = message.latency_ms || 0
      let toolCallOffset = 0.3

      for (const toolCall of toolCalls) {
        timelineEvents.push({
          id: `event-${++eventIdCounter}`,
          type: 'tool_call',
          name: toolCall.name,
          startTime: new Date(
            startTime.getTime() + stepDuration * toolCallOffset,
          ),
          endTime: new Date(
            startTime.getTime() + stepDuration * (toolCallOffset + 0.2),
          ),
          duration: stepDuration * 0.2,
          parentId: agentStepId,
          metadata: {
            toolName: toolCall.name,
            result: toolCall.input,
            fromSpawnedAgent: agentInfo.agentType,
          },
        })
        toolCallOffset += 0.15
      }
    }
  }

  return timelineEvents
}

/**
 * Extract response content from various response formats
 */
function extractResponseContent(response: any): string {
  if (typeof response === 'string') {
    return response
  } else if (response?.content) {
    if (typeof response.content === 'string') {
      return response.content
    } else if (Array.isArray(response.content)) {
      return response.content
        .map((part: any) => {
          if (typeof part === 'string') return part
          if (part.type === 'text' && part.text) return part.text
          return ''
        })
        .join('')
    }
  } else if (response?.message?.content) {
    return extractAssistantResponseFromResponse(response)
  } else if (response?.response) {
    return typeof response.response === 'string'
      ? response.response
      : JSON.stringify(response.response)
  }
  return ''
}

/**
 * Extract actual user message content from user_message XML tags
 */
export function extractActualUserMessage(request: any): string | undefined {
  if (!request || typeof request !== 'object') return undefined

  // Convert request to string to search for user_message XML
  const requestStr =
    typeof request === 'string' ? request : JSON.stringify(request)

  // Look for <user_message> content
  const userMessageMatch = requestStr.match(
    /<user_message>([\s\S]*?)<\/user_message>/i,
  )
  if (userMessageMatch) {
    return userMessageMatch[1].trim()
  }

  // Fallback to existing extraction logic
  return extractUserPromptFromRequest(request)
}

/**
 * Extract actual assistant response content before end_turn tag
 */
export function extractActualAssistantResponse(response: any): string {
  if (!response) return ''

  // Extract the raw response content first
  let responseContent = extractAssistantResponseFromResponse(response)

  if (!responseContent) return ''

  // Return the response content as-is for now
  return responseContent
}

/**
 * Extract user prompt from request object
 */
export function extractUserPromptFromRequest(request: any): string | undefined {
  if (!request || typeof request !== 'object') return undefined

  // Handle array of messages
  if (Array.isArray(request)) {
    const lastUserMessage = request
      .slice()
      .reverse()
      .find((msg: any) => msg.role === 'user')

    if (lastUserMessage?.content) {
      return typeof lastUserMessage.content === 'string'
        ? lastUserMessage.content
        : lastUserMessage.content[0]?.text || undefined
    }
  }

  // Handle request object with messages array
  if (request.messages && Array.isArray(request.messages)) {
    return extractUserPromptFromRequest(request.messages)
  }

  return undefined
}

/**
 * Extract assistant response from response object
 */
export function extractAssistantResponseFromResponse(response: any): string {
  // Handle response string directly first
  if (typeof response === 'string') {
    return response
  }

  if (!response || typeof response !== 'object') return ''

  // Handle direct content
  if (response.content) {
    return typeof response.content === 'string'
      ? response.content
      : response.content[0]?.text || ''
  }

  // Handle message object
  if (response.message?.content) {
    return typeof response.message.content === 'string'
      ? response.message.content
      : response.message.content[0]?.text || ''
  }

  // Handle nested response field
  if (response.response) {
    return typeof response.response === 'string'
      ? response.response
      : JSON.stringify(response.response)
  }

  // Debug: log unhandled response structure
  console.log(
    'Unhandled response structure:',
    JSON.stringify(response, null, 2),
  )
  return ''
}

/**
 * Calculate summary statistics from messages
 */
export function calculateTraceStatistics(messages: TraceMessage[]) {
  return {
    totalDuration: messages.reduce(
      (sum, msg) => sum + (msg.latency_ms || 0),
      0,
    ),
    totalCredits: messages.reduce((sum, msg) => sum + msg.credits, 0),
    totalTokens: messages.reduce(
      (sum, msg) => sum + msg.input_tokens + msg.output_tokens,
      0,
    ),
    totalSteps: messages.length,
    averageLatency:
      messages.length > 0
        ? messages.reduce((sum, msg) => sum + (msg.latency_ms || 0), 0) /
          messages.length
        : 0,
  }
}

/**
 * Group timeline events by type
 */
export function groupTimelineEventsByType(
  events: TimelineEvent[],
): Record<string, TimelineEvent[]> {
  const grouped: Record<string, TimelineEvent[]> = {
    agent_step: [],
    tool_call: [],
    spawned_agent: [],
  }

  events.forEach((event) => {
    if (grouped[event.type]) {
      grouped[event.type].push(event)
    }
  })

  return grouped
}

/**
 * Find tool results in subsequent messages
 */
export function findToolResultsInMessages(
  messages: TraceMessage[],
  toolCallName: string,
): any[] {
  const results: any[] = []

  for (const message of messages) {
    if (message.request && typeof message.request === 'object') {
      const requestStr = JSON.stringify(message.request)

      // Look for tool_result patterns
      const toolResultRegex = new RegExp(
        `<tool_result>\\s*<tool>${toolCallName}</tool>\\s*<result>([\\s\\S]*?)</result>\\s*</tool_result>`,
        'g',
      )
      let match

      while ((match = toolResultRegex.exec(requestStr)) !== null) {
        results.push(match[1])
      }
    }
  }

  return results
}
