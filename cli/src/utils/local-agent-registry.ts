import fs from 'fs'
import path from 'path'

import { pluralize } from '@codebuff/common/util/string'

import { getProjectRoot } from '../project-files'

import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'

// ============================================================================
// Constants and types
// ============================================================================

const DISPLAY_NAME_REGEX = /displayName\s*:\s*['"`]([^'"`]+)['"`]/i
const ID_REGEX = /id\s*:\s*['"`]([^'"`]+)['"`]/i
const AGENTS_DIR_NAME = '.agents'

const SKIPPED_DIRECTORIES = new Set([
  'types',
  'prompts',
  'registry',
  'constants',
  '__tests__',
  'factory',
  'node_modules',
])

export interface LocalAgentInfo {
  id: string
  displayName: string
  filePath: string
}

// ============================================================================
// Bundled agents loading (generated at build time by prebuild-agents.ts)
// ============================================================================

interface BundledAgentsModule {
  bundledAgents: Record<string, AgentDefinition>
  getBundledAgentsAsLocalInfo: () => LocalAgentInfo[]
}

let bundledAgentsModule: BundledAgentsModule | null = null
try {
  bundledAgentsModule = require('../agents/bundled-agents.generated')
} catch {
  // File not generated yet - running in development without prebuild
}

const getBundledAgents = (): Record<string, AgentDefinition> => {
  return bundledAgentsModule?.bundledAgents ?? {}
}

const getBundledAgentsAsLocalInfo = (): LocalAgentInfo[] => {
  return bundledAgentsModule?.getBundledAgentsAsLocalInfo?.() ?? []
}

// ============================================================================
// File system utilities
// ============================================================================

const shouldSkipDirectory = (dirName: string): boolean => {
  if (!dirName) return true
  if (dirName.startsWith('.')) return true
  return SKIPPED_DIRECTORIES.has(dirName)
}

/**
 * Recursively gathers agent files from a directory.
 * Returns file info with id, displayName, and filePath for each valid agent file.
 */
const gatherAgentFiles = (dir: string): LocalAgentInfo[] => {
  const results: LocalAgentInfo[] = []
  gatherAgentFilesRecursive(dir, results)
  return results
}

const gatherAgentFilesRecursive = (dir: string, results: LocalAgentInfo[]): void => {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) {
        continue
      }
      gatherAgentFilesRecursive(fullPath, results)
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue
    }

    let content: string
    try {
      content = fs.readFileSync(fullPath, 'utf8')
    } catch {
      continue
    }

    const displayMatch = content.match(DISPLAY_NAME_REGEX)
    const idMatch = content.match(ID_REGEX)

    // Must have at least one of displayName or id
    if (!displayMatch && !idMatch) {
      continue
    }

    const displayName = displayMatch?.[1]?.trim() ?? ''
    const id = idMatch?.[1]?.trim() ?? displayName

    if (!displayName && !id) {
      continue
    }

    results.push({
      id,
      displayName: displayName || id,
      filePath: fullPath,
    })
  }
}

// ============================================================================
// Directory finding
// ============================================================================

let cachedAgentsDir: string | null = null

export const findAgentsDirectory = (): string | null => {
  if (cachedAgentsDir && fs.existsSync(cachedAgentsDir)) {
    return cachedAgentsDir
  }

  const projectRoot = getProjectRoot() || process.cwd()
  if (projectRoot) {
    const rootCandidate = path.join(projectRoot, AGENTS_DIR_NAME)
    if (
      fs.existsSync(rootCandidate) &&
      fs.statSync(rootCandidate).isDirectory()
    ) {
      cachedAgentsDir = rootCandidate
      return cachedAgentsDir
    }
  }

  let currentDir = process.cwd()
  const filesystemRoot = path.parse(currentDir).root

  while (true) {
    const candidate = path.join(currentDir, AGENTS_DIR_NAME)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      cachedAgentsDir = candidate
      return cachedAgentsDir
    }

    if (currentDir === filesystemRoot) {
      break
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      break
    }

    currentDir = parentDir
  }

  cachedAgentsDir = null
  return null
}

// ============================================================================
// Agent loading - LocalAgentInfo (lightweight, for UI/listing)
// ============================================================================

let cachedAgents: LocalAgentInfo[] | null = null

export const loadLocalAgents = (): LocalAgentInfo[] => {
  if (cachedAgents) {
    return cachedAgents
  }

  // Start with bundled agents - these are the default Codebuff agents
  // compiled into the CLI binary at build time
  const bundledAgentsInfo = getBundledAgentsAsLocalInfo()
  const results: LocalAgentInfo[] = [...bundledAgentsInfo]
  const bundledIds = new Set(bundledAgentsInfo.map(a => a.id))

  // Then load user's local agents from .agents/ directory
  // User agents can override bundled agents with the same ID
  const agentsDir = findAgentsDirectory()

  if (agentsDir) {
    try {
      const userAgents = gatherAgentFiles(agentsDir)
      
      // Merge user agents - they override bundled agents with same ID
      for (const userAgent of userAgents) {
        if (bundledIds.has(userAgent.id)) {
          // Replace bundled agent with user's version
          const idx = results.findIndex(a => a.id === userAgent.id)
          if (idx !== -1) {
            results[idx] = userAgent
          }
        } else {
          results.push(userAgent)
        }
      }
    } catch {
      // Ignore errors loading user agents
    }
  }

  cachedAgents = results.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'en'),
  )

  return cachedAgents
}

// ============================================================================
// Agent loading - AgentDefinition (full definitions for runtime)
// ============================================================================

/**
 * Load agent definitions from bundled agents and user's .agents directory.
 * Bundled agents are compiled into the CLI binary at build time.
 * User agents from .agents/ can override bundled agents with the same ID.
 * Note: The SDK's processAgentDefinitions will handle converting handleSteps functions to strings
 */
export const loadAgentDefinitions = (): AgentDefinition[] => {
  // Start with bundled agents - these are the default Codebuff agents
  const bundledAgents = getBundledAgents()
  const definitions: AgentDefinition[] = Object.values(bundledAgents)
  const bundledIds = new Set(Object.keys(bundledAgents))

  // Then load user's local agents from .agents/ directory
  const agentsDir = findAgentsDirectory()
  if (!agentsDir) {
    return definitions
  }

  const agentFiles = gatherAgentFiles(agentsDir)

  for (const { filePath } of agentFiles) {
    try {
      // Use require to load the TypeScript file (works with ts-node/bun)
      const agentModule = require(filePath)
      const agentDef = agentModule.default
      if (require.cache[filePath]) {
        delete require.cache[filePath]
      }

      if (!agentDef || !agentDef.id || !agentDef.model) {
        continue
      }

      // User agents override bundled agents with the same ID
      if (bundledIds.has(agentDef.id)) {
        const idx = definitions.findIndex(d => d.id === agentDef.id)
        if (idx !== -1) {
          definitions[idx] = agentDef as AgentDefinition
        }
      } else {
        definitions.push(agentDef as AgentDefinition)
      }
    } catch {
      // Skip files that can't be loaded
      continue
    }
  }

  return definitions
}

// ============================================================================
// UI/Display utilities
// ============================================================================

export const announceLoadedAgents = (): void => {
  const agents = loadLocalAgents()
  const agentsDir = findAgentsDirectory()

  if (!agentsDir) {
    console.log('[agents] No .agents directory found in this project.')
    return
  }

  if (!agents.length) {
    console.log(`[agents] No agent files found in ${agentsDir}`)
    return
  }

  console.log(
    `[agents] Loaded ${pluralize(agents.length, 'local agent')} from ${agentsDir}`,
  )
  for (const agent of agents) {
    const identifier =
      agent.displayName && agent.displayName !== agent.id
        ? `${agent.displayName} (${agent.id})`
        : agent.displayName || agent.id
    console.log(`  - ${identifier}`)
  }
}

export const getLoadedAgentsMessage = (): string | null => {
  const agents = loadLocalAgents()
  const agentsDir = findAgentsDirectory()

  if (!agentsDir || !agents.length) {
    return null
  }

  const agentCount = agents.length
  const header = `Loaded ${pluralize(agentCount, 'local agent')} from ${agentsDir}`
  const agentList = agents
    .map((agent) => {
      const identifier =
        agent.displayName && agent.displayName !== agent.id
          ? `${agent.displayName} (${agent.id})`
          : agent.displayName || agent.id
      return `  - ${identifier}`
    })
    .join('\n')

  return `${header}\n${agentList}`
}

export const getLoadedAgentsData = (): {
  agents: LocalAgentInfo[]
  agentsDir: string
} | null => {
  const agents = loadLocalAgents()
  const agentsDir = findAgentsDirectory()

  if (!agentsDir || !agents.length) {
    return null
  }

  return { agents, agentsDir }
}

// ============================================================================
// Testing utilities
// ============================================================================

/**
 * Clear cached agent listings. Intended for test scenarios that need to
 * re-evaluate the filesystem state between cases.
 */
export const __resetLocalAgentRegistryForTests = (): void => {
  cachedAgents = null
  cachedAgentsDir = null
}
