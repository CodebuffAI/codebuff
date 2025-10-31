import { existsSync, writeFileSync } from 'fs'
import path from 'path'

import { CodebuffConfig, codebuffConfigFile } from '@codebuff/common/json-config/constants'
import { green, bold, yellow } from 'picocolors'

import { getProjectRoot } from '../project-files'
import { MAX_AGENT_STEPS_DEFAULT } from '@codebuff/common/constants/agents'

export function handleInitializationFlowLocally(): void {
  const projectRoot = getProjectRoot()
  const configPath = path.join(projectRoot, codebuffConfigFile)

  if (existsSync(configPath)) {
    console.log(yellow(`\n📋 ${codebuffConfigFile} already exists.`))
    return
  }

  // Create the config file
  const configContent: CodebuffConfig = {
    description:
      'Template configuration for this project. See https://www.codebuff.com/config for all options.',
    startupProcesses: [],
    fileChangeHooks: [],
    maxAgentSteps: MAX_AGENT_STEPS_DEFAULT
  }
  writeFileSync(configPath, JSON.stringify(configContent, null, 2))

  console.log(green(`\n✅ Created ${bold(codebuffConfigFile)}`))
}
