import fs from 'fs'
import path from 'path'
import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'

const AGENTS_DIR_NAME = '.agents'
const DISPLAY_NAME_REGEX = /displayName\s*:\s*['"`]([^'"`]+)['"`]/i
const ID_REGEX = /id\s*:\s*['"`]([^'"`]+)['"`]/i

const shouldSkipDirectory = (dirName: string): boolean => {
  if (!dirName) return true
  if (dirName.startsWith('.')) return true
  const skipped = new Set([
    'types',
    'prompts',
    'registry',
    'constants',
    '__tests__',
    'factory',
    'node_modules',
  ])
  return skipped.has(dirName)
}

const findAgentsDir = (): string | null => {
  let currentDir = process.cwd()
  const rootDir = path.parse(currentDir).root

  while (true) {
    const candidate = path.join(currentDir, AGENTS_DIR_NAME)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate
    }

    if (currentDir === rootDir) {
      break
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      break
    }
    currentDir = parentDir
  }

  return null
}

const gatherAgentFiles = (dir: string): string[] => {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) {
        continue
      }
      results.push(...gatherAgentFiles(fullPath))
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      const displayMatch = content.match(DISPLAY_NAME_REGEX)
      const idMatch = content.match(ID_REGEX)

      if (displayMatch || idMatch) {
        results.push(fullPath)
      }
    } catch {
      continue
    }
  }

  return results
}

/**
 * Load local agent definitions from .agents directory and pass to SDK
 * Note: The SDK's processAgentDefinitions will handle converting handleSteps functions to strings
 */
export const loadAgentDefinitions = (): AgentDefinition[] => {
  const agentsDir = findAgentsDir()
  if (!agentsDir) {
    return []
  }

  const agentFiles = gatherAgentFiles(agentsDir)
  const definitions: AgentDefinition[] = []

  for (const filePath of agentFiles) {
    try {
      // Use require to load the TypeScript file (works with ts-node/bun)
      const agentModule = require(filePath)
      const agentDef = agentModule.default

      if (!agentDef || !agentDef.id || !agentDef.model) {
        continue
      }

      // No need to convert handleSteps - SDK's processAgentDefinitions handles it
      definitions.push(agentDef as AgentDefinition)
    } catch (error) {
      // Skip files that can't be loaded
      continue
    }
  }

  return definitions
}
