import { createHash } from 'crypto'
import fs from 'fs'
import { builtinModules } from 'module'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

import { build } from 'esbuild'

export let loadedAgents: Record<string, any> = {}

const agentFileExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs'])

const getAllAgentFiles = (dir: string): string[] => {
  const files: string[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...getAllAgentFiles(fullPath))
        continue
      }
      const extension = path.extname(entry.name).toLowerCase()
      const isAgentFile =
        entry.isFile() &&
        agentFileExtensions.has(extension) &&
        !entry.name.endsWith('.d.ts') &&
        !entry.name.endsWith('.test.ts')
      if (isAgentFile) {
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
  const allAgentFiles = agentDirs.flatMap((dir) => getAllAgentFiles(dir))

  if (allAgentFiles.length === 0) {
    return loadedAgents
  }

  for (const fullPath of allAgentFiles) {
    try {
      const agentModule = await importAgentModule(fullPath, verbose)
      if (!agentModule) {
        continue
      }
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

async function importAgentModule(
  fullPath: string,
  verbose: boolean,
): Promise<any | null> {
  const extension = path.extname(fullPath).toLowerCase()
  const urlVersion = `?update=${Date.now()}`

  if (extension === '.ts' || extension === '.tsx') {
    const compiledPath = await transpileAgent(fullPath, verbose)
    if (!compiledPath) {
      return null
    }
    return import(`${pathToFileURL(compiledPath).href}${urlVersion}`)
  }

  return import(`${pathToFileURL(fullPath).href}${urlVersion}`)
}

async function transpileAgent(
  fullPath: string,
  verbose: boolean,
): Promise<string | null> {
  try {
    const result = await build({
      entryPoints: [fullPath],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node18',
      write: false,
      logLevel: verbose ? 'info' : 'silent',
      sourcemap: 'inline',
      packages: 'external',
      external: [
        ...builtinModules,
        ...builtinModules.map((mod) => `node:${mod}`),
      ],
    })

    const jsOutput = result.outputFiles?.[0]
    if (!jsOutput?.text) {
      if (verbose) {
        console.error(`Failed to transpile agent (no output): ${fullPath}`)
      }
      return null
    }

    const hash = createHash('sha1').update(fullPath).digest('hex')
    const tempDir = path.join(os.tmpdir(), 'codebuff-agents')
    const compiledPath = path.join(tempDir, `${hash}.mjs`)

    await fs.promises.mkdir(tempDir, { recursive: true })
    await fs.promises.writeFile(compiledPath, jsOutput.text, 'utf8')

    return compiledPath
  } catch (error) {
    if (verbose) {
      console.error(
        `Error transpiling agent ${fullPath}:`,
        error instanceof Error ? error.message : error,
      )
    }
    return null
  }
}
