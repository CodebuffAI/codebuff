import * as fs from 'fs'

import { cyan, green } from 'picocolors'

import { getAllTsFiles, getAgentsDirectory } from './agent-utils'

import type { CodebuffConfig } from '@codebuff/common/json-config/constants'

export let loadedAgents: Record<string, any> = {}
export async function loadLocalAgents({
  agentsPath,
  verbose = false,
}: {
  agentsPath?: string
  verbose?: boolean
}): Promise<typeof loadedAgents> {
  loadedAgents = {}

  const agentsDir = agentsPath ?? getAgentsDirectory()

  if (!fs.existsSync(agentsDir)) {
    return loadedAgents
  }

  try {
    const tsFiles = getAllTsFiles(agentsDir)

    for (const fullPath of tsFiles) {
      let agentDefinition: any
      let agentModule: any
      try {
        agentModule = await require(fullPath)
      } catch (error: any) {
        if (verbose) {
          console.error(
            `Error importing agent: ${error.name} - ${error.message}\n${error.stack}`,
            fullPath,
          )
        }
        continue
      }
      delete require.cache[fullPath]

      try {
        agentDefinition = agentModule.default
      } catch (error: any) {
        const errorMessage =
          error instanceof Error
            ? error.stack || error.message
            : typeof error === 'string'
              ? error
              : JSON.stringify(error)
        console.error('Error loading agent from file:', fullPath, errorMessage)
        continue
      }

      if (!agentDefinition) continue

      // Validate that agent has required attributes
      if (!agentDefinition.id || !agentDefinition.model) {
        if (verbose) {
          console.error(
            'Agent definition missing required attributes (id, model):',
            fullPath,
            'Found:',
            { id: agentDefinition.id, model: agentDefinition.model },
          )
        }
        continue
      }

      // Convert handleSteps function to string if present
      let processedAgentDefinition = { ...agentDefinition }

      if (agentDefinition.handleSteps) {
        processedAgentDefinition.handleSteps =
          agentDefinition.handleSteps.toString()
      }

      loadedAgents[processedAgentDefinition.id] = processedAgentDefinition
    }
  } catch (error) {}
  return loadedAgents
}

export function getLoadedAgentNames(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(loadedAgents).map(([agentType, agentConfig]) => {
      return [agentType, agentConfig.displayName]
    }),
  )
}

/**
 * Display loaded agents to the user
 */
export function displayLoadedAgents(codebuffConfig: CodebuffConfig) {
  const baseAgent = codebuffConfig.baseAgent
  if (baseAgent) {
    console.log(`\n${green('Configured base agent:')} ${cyan(baseAgent)}`)
  }

  const spawnableAgents = codebuffConfig.spawnableAgents
  if (spawnableAgents) {
    console.log(
      `${green('Configured spawnable agents:')} ${spawnableAgents
        .map((name) => cyan(name))
        .join(', ')}\n`,
    )
  } else if (Object.keys(loadedAgents).length > 0) {
    const loadedAgentNames = Object.values(getLoadedAgentNames())
    console.log(
      `\n${green('Found custom agents:')} ${loadedAgentNames
        .map((name) => cyan(name))
        .join(', ')}\n`,
    )
  } else if (baseAgent) {
    // One more new line.
    console.log()
  }
}
