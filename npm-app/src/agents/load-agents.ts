import * as fs from 'fs'

import { cyan, green } from 'picocolors'

import {
  getAllTsFiles,
  getAgentsDirectory,
  getUserAgentsDirectory,
} from './agent-utils'

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

  // Collect agents from both directories
  const agentsDirs = agentsPath
    ? [agentsPath]
    : [getAgentsDirectory(), getUserAgentsDirectory()]

  const allTsFiles: string[] = []
  for (const dir of agentsDirs) {
    if (fs.existsSync(dir)) {
      allTsFiles.push(...getAllTsFiles(dir))
    }
  }

  if (allTsFiles.length === 0) {
    return loadedAgents
  }

  try {
    for (const fullPath of allTsFiles) {
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
    // Calculate terminal width and format agents in columns
    const terminalWidth = process.stdout.columns || 80
    const columnWidth =
      Math.max(...loadedAgentNames.map((name) => name.length)) + 2 // Column width based on longest name + padding
    const columnsPerRow = Math.max(1, Math.floor(terminalWidth / columnWidth))

    const formattedLines: string[] = []
    for (let i = 0; i < loadedAgentNames.length; i += columnsPerRow) {
      const rowAgents = loadedAgentNames.slice(i, i + columnsPerRow)
      const formattedRow = rowAgents
        .map((name) => cyan(name.padEnd(columnWidth)))
        .join('')
      formattedLines.push(formattedRow)
    }

    console.log(
      `\n${green('Found custom agents:')}\n${formattedLines.join('\n')}\n`,
    )
  } else if (baseAgent) {
    // One more new line.
    console.log()
  }
}
