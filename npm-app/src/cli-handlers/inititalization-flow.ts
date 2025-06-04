import { existsSync, writeFileSync } from 'fs'
import path from 'path'

import { codebuffConfigFile } from 'common/json-config/constants'

import { getProjectRoot } from '../project-files'

export function handleInitializationFlowLocally(): void {
  const projectRoot = getProjectRoot()

  // Knowledge file will be created in the backend

  const configPath = path.join(projectRoot, codebuffConfigFile)
  if (!existsSync(configPath)) {
    // Create the config file
    const configContent = {
      description:
        'Template configuration for this project. See https://www.codebuff.com/config for all options.',
      startupProcesses: [],
      fileChangeHooks: [],
    }
    writeFileSync(configPath, JSON.stringify(configContent, null, 2))
  }
}
