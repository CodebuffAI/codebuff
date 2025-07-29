import {
  DynamicAgentConfigParsed,
  DynamicAgentConfigSchema,
  DynamicAgentTemplate,
  PromptField,
} from '@codebuff/common/types/dynamic-agent-template'
import { filterCustomAgentFiles } from '@codebuff/common/util/agent-file-utils'
import * as fs from 'fs'
import * as path from 'path'
import { cyan, green } from 'picocolors'
import { getProjectRoot } from '../project-files'

export let loadedAgents: Record<string, DynamicAgentTemplate> = {}

const agentTemplatesSubdir = ['.agents', 'templates'] as const

export async function loadLocalAgents({
  verbose = false,
}: {
  verbose?: boolean
}): Promise<typeof loadedAgents> {
  loadedAgents = {}

  const agentsDir = path.join(getProjectRoot(), ...agentTemplatesSubdir)

  if (!fs.existsSync(agentsDir)) {
    return loadedAgents
  }

  try {
    const files = fs.readdirSync(agentsDir)
    const validAgentFiles = filterCustomAgentFiles(files)

    for (const file of validAgentFiles) {
      const fullPath = path.join(agentsDir, file)
      
      let agentConfig: DynamicAgentConfigParsed
      try {
        const importedModule = await import(fullPath)
        agentConfig = importedModule.default
      } catch (error: any) {
        if (verbose) {
          console.error('Error importing agent:', error)
        }
        continue
      }

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

      loadedAgents[file.slice(0, -'.ts'.length)] = {
        ...typedAgentConfig,
        systemPrompt: loadFileContents(typedAgentConfig.systemPrompt),
        instructionsPrompt: loadFileContents(typedAgentConfig.instructionsPrompt),
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
export function displayLoadedAgents() {
  if (Object.keys(loadedAgents).length === 0) {
    return
  }
  console.log(
    `\n${green('Found custom agents:')} ${Object.values(getLoadedAgentNames())
      .map((name) => cyan(name))
      .join(', ')}\n`
  )
}

export function loadFileContents(promptField: PromptField | undefined): string {
  if (promptField === undefined) {
    return ''
  }

  if (typeof promptField === 'string') {
    return promptField
  }

  const originalPath = promptField.path
  const projectRoot = getProjectRoot()

  // Try multiple path variations for better compatibility
  const pathVariations = [
    path.join(projectRoot, originalPath),
    path.join(projectRoot, ...agentTemplatesSubdir, originalPath),
    path.join(
      projectRoot,
      ...agentTemplatesSubdir,
      path.basename(originalPath)
    ),
  ]

  for (const path of pathVariations) {
    try {
      return fs.readFileSync(path, 'utf8')
    } catch (error) {
      // Ignore errors and try the next path variation
    }
  }

  return ''
}
