import { IWebSocketService } from './interfaces'
import {
  sendAction as originalSendAction,
  requestFiles as originalRequestFiles,
  requestFile as originalRequestFile,
  requestOptionalFile as originalRequestOptionalFile,
  requestToolCall as originalRequestToolCall,
} from '../features/websockets/websocket-action'
import { WebSocket } from 'ws'

export class WebSocketService implements IWebSocketService {
  sendAction(ws: WebSocket, action: any): void {
    return originalSendAction(ws, action)
  }

  async requestFiles(
    ws: WebSocket,
    filePaths: string[]
  ): Promise<Record<string, string | null>> {
    return originalRequestFiles(ws, filePaths)
  }

  async requestFile(ws: WebSocket, filePath: string): Promise<string | null> {
    return originalRequestFile(ws, filePath)
  }

  async requestOptionalFile(ws: WebSocket, filePath: string): Promise<string> {
    const result = await originalRequestOptionalFile(ws, filePath)
    return result ?? ''
  }

  async requestToolCall<T = any>(
    ws: WebSocket,
    userInputId: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    return originalRequestToolCall(ws, userInputId, toolName, args)
  }
}
