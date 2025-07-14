import { AgentState } from '@codebuff/common/types/session-state'
import { WebSocket } from 'ws'
import { AgentOptions } from './features/agents/execution/run-agent-step'
import { AgentTemplateUnion, ProgrammaticAgentFunction } from './features/agents/templates/static/types'
import { generateCompactId } from '@codebuff/common/util/string'
import { logger } from './util/logger'
import { requestToolCall } from './features/websockets/websocket-action'
import { runToolInner } from './run-tool'
import { asSystemMessage } from './util/messages'
import { renderToolResults } from '@codebuff/common/constants/tools'
import path from 'path'

export async function runProgrammaticAgent(
  template: AgentTemplateUnion,
  options: AgentOptions & { ws: WebSocket }
): Promise<AgentState> {
  if (template.implementation !== 'programmatic') {
    throw new Error('runProgrammaticAgent only supports programmatic templates')
  }

  const { ws, agentState, prompt, params, onResponseChunk } = options

  try {
    // Load the handler function from the file
    const handlerPath = path.resolve(template.handler)
    const handlerModule = await import(handlerPath)
    const handler: ProgrammaticAgentFunction = handlerModule.default || handlerModule[Object.keys(handlerModule)[0]]

    if (!handler || typeof handler !== 'function') {
      throw new Error(`No valid handler function found in ${template.handler}`)
    }

    // Create context for the programmatic agent
    const context = {
      prompt: prompt || '',
      params: params || {}
    }

    // Run the generator function
    const generator = handler(context)
    const toolResults = []

    // Process each tool call from the generator
    let result = generator.next()
    while (!result.done) {
      const toolCallSpec = result.value
      const toolCall = {
        ...toolCallSpec,
        type: 'tool-call' as const,
        toolCallId: generateCompactId()
      }

      logger.debug({ toolCall }, 'Programmatic agent executing tool')

      // Execute the tool
      const toolResult = await runToolInner(toolCall, {
        ws,
        userId: options.userId,
        userInputId: options.userInputId,
        clientSessionId: options.clientSessionId,
        fingerprintId: options.fingerprintId,
        agentStepId: generateCompactId(),
        fileContext: options.fileContext,
        messages: agentState.messageHistory,
        agentTemplate: template,
        agentState
      })

      if (toolResult.type === 'server_result') {
        toolResults.push(toolResult.result)
        // Send the next tool result to the generator
        result = generator.next(toolResult.result)
      } else if (toolResult.type === 'client_call') {
        // Handle client tool calls
        const clientResult = await requestToolCall(
          ws,
          options.userInputId,
          toolResult.call.toolName,
          toolResult.call.args
        )
        const clientToolResult = {
          toolName: toolResult.call.toolName,
          toolCallId: toolResult.call.toolCallId,
          result: clientResult.success ? clientResult.result : (clientResult.error || 'Unknown error')
        }
        toolResults.push(clientToolResult)
        result = generator.next(clientToolResult)
      } else if (toolResult.type === 'state_update') {
        // Update agent state
        agentState.report = toolResult.updatedAgentState.report
        agentState.agentContext = toolResult.updatedAgentState.agentContext
        toolResults.push(toolResult.result)
        result = generator.next(toolResult.result)
      } else {
        // No specific handling needed, continue
        result = generator.next()
      }
    }

    // Update message history with tool results if any
    if (toolResults.length > 0) {
      const updatedMessageHistory = [
        ...agentState.messageHistory,
        {
          role: 'user' as const,
          content: asSystemMessage(renderToolResults(toolResults))
        }
      ]
      
      return {
        ...agentState,
        messageHistory: updatedMessageHistory
      }
    }

    return agentState
  } catch (error) {
    logger.error({ error, template }, 'Error running programmatic agent')
    onResponseChunk(`Error running programmatic agent: ${error instanceof Error ? error.message : 'Unknown error'}\n`)
    return agentState
  }
}
