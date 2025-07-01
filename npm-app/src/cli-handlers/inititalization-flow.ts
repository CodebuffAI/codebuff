import { existsSync, writeFileSync } from 'fs'
import path from 'path'

import { codebuffConfigFile } from '@codebuff/common/json-config/constants'
import { green, bold, yellow } from 'picocolors'

import { getProjectRoot } from '../project-files'

export function handleInitializationFlowLocally(): void {
  const projectRoot = getProjectRoot()
  const configPath = path.join(projectRoot, codebuffConfigFile)

  if (existsSync(configPath)) {
    console.log(yellow(`\n📋 ${codebuffConfigFile} already exists.`))
    return
  }

  // Create the config file
  const configContent = {
    description:
      'Template configuration for this project. See https://www.codebuff.com/config for all options.',
    startupProcesses: [],
    fileChangeHooks: [],
  }
  writeFileSync(configPath, JSON.stringify(configContent, null, 2))

  console.log(green(`\n✅ Created ${bold(codebuffConfigFile)}`))
}
