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
import { CodebuffConfig } from '@codebuff/common/json-config/constants'

export let loadedAgents: Record<string, DynamicAgentTemplate> = {}

const agentTemplatesSubdir = ['.agents'] as const

function getAllTsFiles(dir: string): string[] {
  const files: string[] = []

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        files.push(...getAllTsFiles(fullPath))
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.d.ts')
      ) {
        files.push(fullPath)
      }
    }
  } catch (error) {
    // Ignore errors reading directories
  }

  return files
}

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
