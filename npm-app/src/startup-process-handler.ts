import { gray } from 'picocolors'

import { cleanupStoredProcesses } from './background-process-manager'
import { startDevProcesses } from './dev-process-manager'
import { loadCodebuffConfig } from './json-config/parser'
import { getProjectRoot } from './project-files'

export function logAndHandleStartup(): Promise<any> {
  // First clean up any existing processes
  const { separateCodebuffInstanceRunning, cleanUpPromise } =
    cleanupStoredProcesses()

  const projectRoot = getProjectRoot()
  const config = loadCodebuffConfig()

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
