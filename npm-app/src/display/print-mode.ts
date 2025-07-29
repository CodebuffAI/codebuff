import type { PrintModeObject } from '@codebuff/common/types/print-mode'

import { originalConsoleError, originalConsoleLog } from './overrides'

let printModeEnabled: boolean = false
export function setPrintMode(enabled: boolean) {
  printModeEnabled = enabled
}
export function printModeIsEnabled(): boolean {
  return printModeEnabled ?? false
}

export function printModeLog(obj: PrintModeObject) {
  if (!printModeEnabled) {
    return
  }
  if (obj.type === 'error') {
    originalConsoleError(JSON.stringify(obj))
  } else {
    originalConsoleLog(JSON.stringify(obj))
  }
}
