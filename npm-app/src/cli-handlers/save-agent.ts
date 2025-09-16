import * as fs from 'fs'
import * as path from 'path'

import { codebuffConfigFile } from '@codebuff/common/json-config/constants'
import { green, red, yellow, cyan, gray } from 'picocolors'

import { getProjectRoot } from '../project-files'
import { loadRawCodebuffConfig } from '../json-config/parser'

/**
 * Add one or more agent IDs to the addedSpawnableAgents field in codebuff.json
 * @param agentIds Array of agent IDs to add
 */
export async function handleSaveAgent(agentIds: string[]): Promise<void> {
  if (!agentIds || agentIds.length === 0) {
    console.log(
      red(
        'Agent ID is required. Usage: codebuff save-agent <agent-id> [agent-id2] ...',
      ),
    )
    console.log(
      gray(
        'Example: codebuff save-agent codebuff/file-picker@1.0.0 codebuff/reviewer@1.0.0',
      ),
    )
    return
  }

  const projectRoot = getProjectRoot()
  const configPath = path.join(projectRoot, codebuffConfigFile)

  try {
    // Use the safe configuration loader that handles JSONC
    const config = loadRawCodebuffConfig()

    // Initialize addedSpawnableAgents if it doesn't exist
    if (!config.addedSpawnableAgents) {
      config.addedSpawnableAgents = []
    }

    // Track which agents were added vs already existed
    const newAgents: string[] = []
    const existingAgents: string[] = []

    for (const agentId of agentIds) {
      if (config.addedSpawnableAgents.includes(agentId)) {
        existingAgents.push(agentId)
      } else {
        config.addedSpawnableAgents.push(agentId)
        newAgents.push(agentId)
      }
    }

    // Write the updated configuration back to file
    const configJson = JSON.stringify(config, null, 2)
    fs.writeFileSync(configPath, configJson + '\n')

    // Provide feedback to the user
    if (newAgents.length > 0) {
      console.log(
        green(
          `✅ Successfully added ${newAgents.length} agent(s) to codebuff.json:`,
        ),
      )
      newAgents.forEach((agentId) => {
        console.log(cyan(`  + ${agentId}`))
      })
    }

    if (existingAgents.length > 0) {
      console.log(
        yellow(
          `⚠️  ${existingAgents.length} agent(s) were already in the list:`,
        ),
      )
      existingAgents.forEach((agentId) => {
        console.log(gray(`  • ${agentId}`))
      })
    }

    if (newAgents.length > 0) {
      console.log()
      console.log(
        gray('These agents are now available for spawning by the base agent.'),
      )
    }
  } catch (error) {
    console.log(
      red(
        `Error updating codebuff.json: ${error instanceof Error ? error.message : String(error)}`,
      ),
    )
  }
}
