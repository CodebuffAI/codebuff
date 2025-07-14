import { 
  IAgentService, 
  IToolService, 
  ILLMService, 
  IFileService, 
  IWebSocketService,
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentLoopOptions,
  AgentLoopResult
} from './interfaces'
import { 
  runAgentStep as originalRunAgentStep,
  loopAgentSteps as originalLoopAgentSteps
} from '../features/agents/execution/run-agent-step'
import { WebSocket } from 'ws'

export class AgentService implements IAgentService {
  constructor(
    private toolService: IToolService,
    private llmService: ILLMService,
    private fileService: IFileService,
    private webSocketService: IWebSocketService
  ) {}

  async executeAgent(options: AgentExecutionOptions): Promise<AgentExecutionResult> {
    // For now, delegate to the existing runAgentStep function
    // In the future, we can refactor this to use the injected services
    return originalRunAgentStep(options.ws, {
      userId: options.userId,
      userInputId: options.userInputId,
      clientSessionId: options.clientSessionId,
      fingerprintId: options.fingerprintId,
      onResponseChunk: options.onResponseChunk,
      agentType: options.agentType,
      fileContext: options.fileContext,
      agentState: options.agentState,
      prompt: options.prompt,
      params: options.params,
      assistantMessage: options.assistantMessage,
      assistantPrefix: options.assistantPrefix
    })
  }

  async loopAgentSteps(options: AgentLoopOptions): Promise<AgentLoopResult> {
    // For now, delegate to the existing loopAgentSteps function
    // In the future, we can refactor this to use the injected services
    return originalLoopAgentSteps(options as any, {
      userInputId: options.userInputId,
      agentType: options.agentType,
      agentState: options.agentState,
      prompt: options.prompt,
      params: options.params,
      fingerprintId: options.fingerprintId,
      fileContext: options.fileContext,
      toolResults: options.toolResults,
      userId: options.userId,
      clientSessionId: options.clientSessionId,
      onResponseChunk: options.onResponseChunk
    })
  }
}
