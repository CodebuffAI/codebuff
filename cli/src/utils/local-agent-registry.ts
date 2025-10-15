import fs from 'fs'
import path from 'path'

export interface LocalAgentInfo {
  id: string
  displayName: string
  filePath: string
}

const DISPLAY_NAME_REGEX =
  /displayName\s*:\s*['"`]([^'"`]+)['"`]/i
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

export const loadLocalAgents = (): LocalAgentInfo[] => {
  if (cachedAgents) {
    return cachedAgents
  }

  const findAgentsDir = (): string | null => {
    if (cachedAgentsDir && fs.existsSync(cachedAgentsDir)) {
      return cachedAgentsDir
    }

    let currentDir = process.cwd()
    const rootDir = path.parse(currentDir).root

    while (true) {
      const candidate = path.join(currentDir, AGENTS_DIR_NAME)
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        cachedAgentsDir = candidate
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

  const agentsDir = findAgentsDir()

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

  cachedAgents = results
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'en'))

  return cachedAgents
}
