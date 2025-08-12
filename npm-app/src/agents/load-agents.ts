import * as fs from 'fs'
import * as path from 'path'

import { cyan, green } from 'picocolors'

import { getAllTsFiles, getAgentsDirectory } from './agent-utils'

import type { CodebuffConfig } from '@codebuff/common/json-config/constants'

export let loadedAgents: Record<string, any> = {}
export async function loadLocalAgents({
  verbose = false,
}: {
  verbose?: boolean
}): Promise<typeof loadedAgents> {
  loadedAgents = {}

  const agentsDir = getAgentsDirectory()

  if (!fs.existsSync(agentsDir)) {
    return loadedAgents
  }

  try {
    const tsFiles = getAllTsFiles(agentsDir)

    for (const fullPath of tsFiles) {
      const relativePath = path.relative(agentsDir, fullPath)
      const fileName = relativePath.replace(/\.ts$/, '').replace(/[/\\]/g, '-')

      let agentDefinition: any
      let agentModule: any
      try {
        agentModule = await require(fullPath)
      } catch (error: any) {
        if (verbose) {
          console.error('Error importing agent:', error)
        }
        continue
      }
      delete require.cache[fullPath]

      try {
        agentDefinition = agentModule.default
      } catch (error: any) {
        console.error('Error loading agent from file:', fullPath, error)
        continue
      }

      if (!agentDefinition) continue

      // Convert handleSteps function to string if present
      let processedAgentDefinition = { ...agentDefinition }

      if (agentDefinition.handleSteps) {
        processedAgentDefinition.handleSteps =
          agentDefinition.handleSteps.toString()
      }

      loadedAgents[fileName] = processedAgentDefinition
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
