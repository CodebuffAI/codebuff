import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

export let loadedAgents: Record<string, any> = {}

const getAllTsFiles = (dir: string): string[] => {
  const files: string[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...getAllTsFiles(fullPath))
        continue
      }
      const isTsFile =
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.d.ts') &&
        !entry.name.endsWith('.test.ts')
      if (isTsFile) {
        files.push(fullPath)
      }
    }
  } catch {
    // Ignore missing agent directories
  }
  return files
}

const getDefaultAgentDirs = () => {
  const cwdAgents = path.join(process.cwd(), '.agents')
  const parentAgents = path.join(process.cwd(), '..', '.agents')
  const homeAgents = path.join(os.homedir(), '.agents')
  return [cwdAgents, parentAgents, homeAgents]
}

export async function loadLocalAgents({
  agentsPath,
  verbose = false,
}: {
  agentsPath?: string
  verbose?: boolean
}): Promise<typeof loadedAgents> {
  loadedAgents = {}

  const agentDirs = agentsPath ? [agentsPath] : getDefaultAgentDirs()
  const allTsFiles = agentDirs.flatMap((dir) => getAllTsFiles(dir))

  if (allTsFiles.length === 0) {
    return loadedAgents
  }

  for (const fullPath of allTsFiles) {
    try {
      const moduleUrl = `${pathToFileURL(fullPath).href}?update=${Date.now()}`
      const agentModule = await import(moduleUrl)
      const agentDefinition = agentModule.default ?? agentModule

      if (!agentDefinition?.id || !agentDefinition?.model) {
        if (verbose) {
          console.error(
            `Agent definition missing required attributes (id, model): ${fullPath}`,
          )
        }
        continue
      }

      const processedAgentDefinition = { ...agentDefinition }
      if (agentDefinition.handleSteps) {
        processedAgentDefinition.handleSteps =
          agentDefinition.handleSteps.toString()
      }

      loadedAgents[processedAgentDefinition.id] = processedAgentDefinition
    } catch (error) {
      if (verbose) {
        console.error(
          `Error loading agent from file ${fullPath}:`,
          error instanceof Error ? error.message : error,
        )
      }
    }
  }

  return loadedAgents
}
