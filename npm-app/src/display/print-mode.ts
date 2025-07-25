import { originalConsoleError, originalConsoleLog } from './overrides'

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

export type PrintModeUsage = {
  type: 'usage'
  credits_used: number
}

export type PrintModeObject = PrintModeError | PrintModeDownloadStatus

let printModeEnabled: boolean = false
export function setPrintMode(enabled: boolean) {
  printModeEnabled = enabled
}
export function printModeIsEnabled(): boolean {
  return printModeEnabled ?? false
}

export const printMode = {
  log: (obj: PrintModeObject) => {
    if (printModeEnabled) {
      originalConsoleLog(JSON.stringify(obj))
    }
  },
  error: (obj: PrintModeError) => {
    if (printModeEnabled) {
      originalConsoleError(JSON.stringify(obj))
    }
  },
}
