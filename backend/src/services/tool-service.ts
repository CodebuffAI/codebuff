import { IToolService, IFileService, IWebSocketService, ILLMService, ToolExecutionOptions } from './interfaces'
import { ToolResult } from '@codebuff/common/types/session-state'
import { ClientToolCall, CodebuffToolCall } from '../features/tools/constants'
import { runToolInner } from '../run-tool'
import { logger } from '../util/logger'

export class ToolService implements IToolService {
  constructor(
    private fileService: IFileService,
    private webSocketService: IWebSocketService,
    private llmService: ILLMService
  ) {}

  async executeTool(toolCall: CodebuffToolCall, options: ToolExecutionOptions): Promise<ToolResult> {
    try {
      // For now, delegate to the existing runToolInner function
      // In the future, we can refactor this to use the injected services
      const toolResult = await runToolInner(toolCall, {
        ws: options.ws,
        userId: options.userId,
        userInputId: options.userInputId,
        clientSessionId: options.clientSessionId,
        fingerprintId: options.fingerprintId,
        agentStepId: options.agentStepId,
        fileContext: options.fileContext,
        messages: options.messages,
        repoId: options.repoId,
        agentState: options.agentState,
        // We'll need to pass the agent template, but for now we'll handle this in the transition
        agentTemplate: undefined as any
      })

      if (toolResult.type === 'server_result') {
        return toolResult.result
      } else if (toolResult.type === 'client_call') {
        // Execute client call via WebSocket service
        const clientResult = await this.webSocketService.requestToolCall(
          options.ws,
          options.userInputId,
          toolResult.call.toolName,
          toolResult.call.args
        )

        return {
          toolName: toolResult.call.toolName,
          toolCallId: toolResult.call.toolCallId,
          result: clientResult.success
            ? clientResult.result
            : clientResult.error ?? 'Unknown error',
        }
      } else if (toolResult.type === 'state_update') {
        // Handle state updates
        if (!options.agentState) {
          throw new Error('agentState is required for state_update')
        }
        Object.assign(options.agentState, toolResult.updatedAgentState!)
        return toolResult.result
      } else {
        // no_result type
        return {
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          result: 'Tool executed successfully',
        }
      }
    } catch (error) {
      logger.error({ error, toolCall }, 'Error executing tool call in ToolService')

      return {
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        result: `Error executing ${toolCall.toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }
}
