import { Model } from 'src/constants'

export type PrintModeError = {
  type: 'error'
  message: string
}

export type PrintModeDownloadStatus = {
  type: 'download'
  version: string
  status: 'complete' | 'failed'
}

export type PrintModeToolCall = {
  type: 'tool_call'
  toolCallId: string
  toolName: string
  args: Record<string, any>
}

export type PrintModeText = {
  type: 'text'
  text: string
}

export type PrintModeFinish = {
  type: 'finish'
  agent_id: string
  model: Model
  total_cost: number
}

export type PrintModeObject =
  | PrintModeError
  | PrintModeDownloadStatus
  | PrintModeToolCall
  | PrintModeText
  | PrintModeFinish
