import { CodebuffConfig } from 'common/json-config/constants'
import { gray } from 'picocolors'

import { cleanupStoredProcesses } from './background-process-manager'
import { startDevProcesses } from './dev-process-manager'

export function logAndHandleStartup(
  projectRoot: string,
  config: CodebuffConfig | null
): Promise<any> {
  // First clean up any existing processes
  const { separateCodebuffInstanceRunning, cleanUpPromise } =
    cleanupStoredProcesses()

  // Start up new processes if necessary
  if (config?.startupProcesses) {
    if (!separateCodebuffInstanceRunning) {
      startDevProcesses(config.startupProcesses, projectRoot)
    } else {
      console.log(
        gray(
          'Another instance of codebuff detected. Skipping startup processes.'
        ) + '\n'
      )
    }
  }
  return cleanUpPromise
}
