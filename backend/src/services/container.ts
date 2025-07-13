import { 
  IAgentService, 
  IToolService, 
  ILLMService, 
  IFileService, 
  IWebSocketService 
} from './interfaces'
import { AgentService } from './agent-service'
import { ToolService } from './tool-service'
import { LLMService } from './llm-service'
import { FileService } from './file-service'
import { WebSocketService } from './websocket-service'

export interface ServiceContainer {
  agentService: IAgentService
  toolService: IToolService
  llmService: ILLMService
  fileService: IFileService
  webSocketService: IWebSocketService
}

let containerInstance: ServiceContainer | null = null

export function createContainer(): ServiceContainer {
  // Create services with their dependencies
  const webSocketService = new WebSocketService()
  const fileService = new FileService(webSocketService)
  const llmService = new LLMService()
  const toolService = new ToolService(fileService, webSocketService, llmService)
  const agentService = new AgentService(toolService, llmService, fileService, webSocketService)

  return {
    agentService,
    toolService,
    llmService,
    fileService,
    webSocketService,
  }
}

export function getContainer(): ServiceContainer {
  if (!containerInstance) {
    containerInstance = createContainer()
  }
  return containerInstance
}

export function resetContainer(): void {
  containerInstance = null
}

// Convenience function to get individual services
export function getAgentService(): IAgentService {
  return getContainer().agentService
}

export function getToolService(): IToolService {
  return getContainer().toolService
}

export function getLLMService(): ILLMService {
  return getContainer().llmService
}

export function getFileService(): IFileService {
  return getContainer().fileService
}

export function getWebSocketService(): IWebSocketService {
  return getContainer().webSocketService
}
