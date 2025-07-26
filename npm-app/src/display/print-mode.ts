import type {
  PrintModeError,
  PrintModeObject,
} from '@codebuff/common/types/print-mode'

import { originalConsoleError, originalConsoleLog } from './overrides'

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
