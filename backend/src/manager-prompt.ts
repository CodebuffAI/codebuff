import { WebSocket } from 'ws'
import { CoreMessage } from 'ai'

import { AgentState, ToolResult } from 'common/types/agent-state'
import { ProjectFileContext } from 'common/util/file'
import {
  ClientToolCall,
  parseRawToolCall,
  TOOL_LIST,
  ToolName,
  ToolCall,
} from './tools'
import { getAgentStream } from './prompt-agent-stream'
import { logger } from './util/logger'
import { generateCompactId } from 'common/util/string'
import { processStreamWithTags } from './xml-stream-parser'
import { toolSchema } from 'common/constants/tools'
import { getManagerSystemPrompt } from './system-prompt/manager-system-prompt'

interface ManagerPromptAction {
  type: 'manager-prompt'
  prompt?: string // Optional for tool result responses
  agentState: AgentState
  toolResults: ToolResult[]
  fingerprintId: string
  authToken?: string
  costMode?: string
  model?: string
  cwd?: string
  repoName?: string
}

export async function handleManagerPrompt(
  ws: WebSocket,
  action: ManagerPromptAction,
  userId: string | undefined,
  clientSessionId: string,
  onResponseChunk: (chunk: string) => void,
  fileContext: ProjectFileContext
): Promise<{
  toolCalls: ClientToolCall[]
  toolResults: ToolResult[]
  agentState: AgentState
}> {
  const messages: CoreMessage[] = [...action.agentState.messageHistory]

  // Check if this is the first message in agent mode, a new user prompt, or tool results
  if (messages.length === 0) {
    logger.debug(
      { userId },
      'First time entering manager mode - initializing with system prompt'
    )
    // First time entering agent mode - initialize with system prompt
    messages.push({
      role: 'system',
      content: getManagerSystemPrompt(),
    })
  }
  // If we have tool results, add them as system message
  if (action.toolResults.length > 0) {
    const toolResultsXml = action.toolResults
      .map(
        (result) =>
          `<tool_result name="${result.name}" id="${result.id}">${result.result}</tool_result>`
      )
      .join('\n')

    messages.push({
      role: 'user',
      content: `<system>${toolResultsXml}</system>`,
    })
  }

  if (action.prompt) {
    messages.push({ role: 'user', content: action.prompt })
  }

  // Get manager stream
  const costMode = action.costMode || 'normal'
  const model = action.model

  logger.debug(
    { model, messages, toolResults: action.toolResults },
    'Manager prompt'
  )

  const { getStream } = getAgentStream({
    costMode: costMode as any,
    selectedModel: model,
    stopSequences: ['</run_terminal_command>', '</sleep>', '</kill_terminal>'],
    clientSessionId,
    fingerprintId: action.fingerprintId,
    userInputId: 'agent-' + Date.now(),
    userId,
  })

  const stream = getStream(messages)

  const allToolCalls: ToolCall[] = []
  const clientToolCalls: ClientToolCall[] = []
  const serverToolResults: ToolResult[] = []

  function toolCallback<T extends ToolName>(
    tool: T,
    after: (toolCall: Extract<ToolCall, { name: T }>) => void
  ): {
    params: (string | RegExp)[]
    onTagStart: () => void
    onTagEnd: (
      name: string,
      parameters: Record<string, string>
    ) => Promise<void>
  } {
    return {
      params: toolSchema[tool],
      onTagStart: () => {},
      onTagEnd: async (_: string, parameters: Record<string, string>) => {
        const toolCall = parseRawToolCall({
          name: tool,
          parameters,
        })
        if ('error' in toolCall) {
          serverToolResults.push({
            name: tool,
            id: generateCompactId(),
            result: toolCall.error,
          })
          return
        }
        allToolCalls.push(toolCall as Extract<ToolCall, { name: T }>)

        after(toolCall as Extract<ToolCall, { name: T }>)
      },
    }
  }
  const streamWithTags = processStreamWithTags(
    stream,
    {
      ...Object.fromEntries(
        TOOL_LIST.map((tool) => [tool, toolCallback(tool, () => {})])
      ),
      ...Object.fromEntries(
        (['sleep', 'kill_terminal'] as const).map((tool) => [
          tool,
          toolCallback(tool, (toolCall) => {
            clientToolCalls.push({
              ...toolCall,
              id: generateCompactId(),
            } as ClientToolCall)
          }),
        ])
      ),
      run_terminal_command: toolCallback('run_terminal_command', (toolCall) => {
        const clientToolCall = {
          ...{
            ...toolCall,
            parameters: {
              ...toolCall.parameters,
              mode: 'manager' as const,
            },
          },
          id: generateCompactId(),
        }
        clientToolCalls.push(clientToolCall)
      }),
    },
    (name, error) => {
      serverToolResults.push({ id: generateCompactId(), name, result: error })
    }
  )

  let fullResponse = ''

  for await (const chunk of streamWithTags) {
    fullResponse += chunk
    onResponseChunk(chunk)
  }

  messages.push({
    role: 'assistant',
    content: fullResponse,
  })

  // Update agent state
  const updatedAgentState: AgentState = {
    ...action.agentState,
    messageHistory: messages,
  }
  logger.debug(
    {
      prompt,
      messages,
      toolCalls: allToolCalls,
      serverToolResults,
      clientToolCalls,
      model,
    },
    'Manager prompt response'
  )

  return {
    agentState: updatedAgentState,
    toolCalls: clientToolCalls,
    toolResults: [],
  }
}
