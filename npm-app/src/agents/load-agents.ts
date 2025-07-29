import {
  DynamicAgentConfigParsed,
  DynamicAgentConfigSchema,
  DynamicAgentTemplate,
  PromptField,
} from '@codebuff/common/types/dynamic-agent-template'
import * as fs from 'fs'
import * as path from 'path'
import { cyan, green } from 'picocolors'
import { CodebuffConfig } from '@codebuff/common/json-config/constants'
import {
  getAllTsFiles,
  loadFileContents,
  getAgentsDirectory,
} from './agent-utils'

export let loadedAgents: Record<string, DynamicAgentTemplate> = {}

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

      let agentConfig: any
      let agentModule: any
      try {
        agentModule = await import(fullPath)
      } catch (error: any) {
        if (verbose) {
          console.error('Error importing agent:', error)
        }
        continue
      }
      try {
        agentConfig = agentModule.default
      } catch (error: any) {
        console.error('Error loading agent from file:', fullPath, error)
        continue
      }

      if (!agentConfig) continue

      let typedAgentConfig: DynamicAgentConfigParsed
      try {
        typedAgentConfig = DynamicAgentConfigSchema.parse(agentConfig)
      } catch (error: any) {
        console.error('Invalid agent format:', fullPath, error)
        continue
      }

      // Convert handleSteps function to string if present
      let handleStepsString: string | undefined
      if (agentConfig.handleSteps) {
        handleStepsString = agentConfig.handleSteps.toString()
      }

      loadedAgents[fileName] = {
        ...typedAgentConfig,
        systemPrompt: loadFileContents(typedAgentConfig.systemPrompt),
        instructionsPrompt: loadFileContents(
          typedAgentConfig.instructionsPrompt
        ),
        stepPrompt: loadFileContents(typedAgentConfig.stepPrompt),

        handleSteps: handleStepsString,
      }
    }
  } catch (error) {}

  return loadedAgents
}

export function getLoadedAgentNames(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(loadedAgents).map(([agentType, agentConfig]) => {
      return [agentType, agentConfig.displayName]
    })
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

  const subagents = codebuffConfig.subagents
  if (subagents) {
    console.log(
      `${green('Configured subagents:')} ${subagents
        .map((name) => cyan(name))
        .join(', ')}\n`
    )
  } else if (Object.keys(loadedAgents).length > 0) {
    const loadedAgentNames = Object.values(getLoadedAgentNames())
    console.log(
      `\n${green('Found custom agents:')} ${loadedAgentNames
        .map((name) => cyan(name))
        .join(', ')}\n`
    )
  } else if (baseAgent) {
    // One more new line.
    console.log()
  }
}
