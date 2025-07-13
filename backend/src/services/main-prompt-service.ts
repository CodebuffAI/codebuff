import { IAgentService, IWebSocketService } from './interfaces'
import { ClientAction } from '@codebuff/common/actions'
import { WebSocket } from 'ws'
import { logger } from '../util/logger'

export class MainPromptService {
  constructor(
    private agentService: IAgentService,
    private webSocketService: IWebSocketService
  ) {}

  async handlePrompt(
    ws: WebSocket,
    action: Extract<ClientAction, { type: 'prompt' }>,
    options: {
      userId: string
      clientSessionId: string
      onResponseChunk: (chunk: string) => void
    }
  ) {
    const { userId, clientSessionId, onResponseChunk } = options
    const { fingerprintId, promptId, prompt, sessionState } = action

    try {
      logger.info('Processing prompt with service-based architecture', {
        userId,
        promptId,
        prompt: prompt?.slice(0, 50)
      })

      // Example of using the agent service
      const result = await this.agentService.executeAgent({
        ws,
        userId,
        userInputId: promptId,
        clientSessionId,
        fingerprintId,
        onResponseChunk,
        agentType: sessionState.mainAgentState.agentType || 'base',
        fileContext: action.sessionState.fileContext,
        agentState: sessionState.mainAgentState,
        prompt,
        params: undefined,
        assistantMessage: undefined,
        assistantPrefix: undefined
      })

      // Example of using the WebSocket service
      this.webSocketService.sendAction(ws, {
        type: 'prompt-response',
        promptId,
        sessionState: {
          ...sessionState,
          mainAgentState: result.agentState
        },
        toolCalls: [],
        toolResults: []
      })

      return result
    } catch (error) {
      logger.error({ error, userId, promptId }, 'Error in service-based prompt handling')
      throw error
    }
  }
}
