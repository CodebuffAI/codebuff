import fs from 'fs'
import path from 'path'

import { pluralize } from '@codebuff/common/util/string'

import { getProjectRoot } from '../project-files'

export interface LocalAgentInfo {
  id: string
  displayName: string
  filePath: string
}

const DISPLAY_NAME_REGEX = /displayName\s*:\s*['"`]([^'"`]+)['"`]/i
const ID_REGEX = /id\s*:\s*['"`]([^'"`]+)['"`]/i
const AGENTS_DIR_NAME = '.agents'

let cachedAgents: LocalAgentInfo[] | null = null
let cachedAgentsDir: string | null = null

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

const gatherAgentFiles = (dir: string, results: LocalAgentInfo[]) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) {
        continue
      }

      gatherAgentFiles(fullPath, results)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (!entry.name.endsWith('.ts')) {
      continue
    }

    let content: string
    try {
      content = fs.readFileSync(fullPath, 'utf8')
    } catch {
      continue
    }

    const displayMatch = content.match(DISPLAY_NAME_REGEX)
    if (!displayMatch) {
      continue
    }

    const idMatch = content.match(ID_REGEX)

    const displayName = displayMatch[1].trim()
    const id = idMatch ? idMatch[1].trim() : displayName

    if (!displayName) {
      continue
    }

    results.push({
      id,
      displayName,
      filePath: fullPath,
    })
  }
}

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

export const loadLocalAgents = (): LocalAgentInfo[] => {
  if (cachedAgents) {
    return cachedAgents
  }

  const agentsDir = findAgentsDirectory()

  if (!agentsDir) {
    cachedAgents = []
    return cachedAgents
  }

  const results: LocalAgentInfo[] = []

  try {
    gatherAgentFiles(agentsDir, results)
  } catch {
    cachedAgents = []
    return cachedAgents
  }

  cachedAgents = results.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'en'),
  )

  return cachedAgents
}

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

/**
 * Clear cached agent listings. Intended for test scenarios that need to
 * re-evaluate the filesystem state between cases.
 */
export const __resetLocalAgentRegistryForTests = (): void => {
  cachedAgents = null
  cachedAgentsDir = null
}
