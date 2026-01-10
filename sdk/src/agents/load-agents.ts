import { createHash } from 'crypto'
import fs from 'fs'
import { builtinModules } from 'module'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

import { validateAgents } from '../validate-agents'

import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'

/**
 * Agent definition with source file path metadata.
 */
export type LoadedAgentDefinition = AgentDefinition & {
  /** The file path this agent was loaded from */
  _sourceFilePath: string
}

/**
 * Loaded agent definitions keyed by agent ID.
 */
export type LoadedAgents = Record<string, LoadedAgentDefinition>

/**
 * Resolves environment variable references in MCP server configs.
 * Values starting with `$` are treated as env var references (e.g., `'$NOTION_TOKEN'`).
 *
 * @param env - The env object from MCP config with possible $VAR_NAME references
 * @param agentId - The agent ID for error messages
 * @param mcpServerName - The MCP server name for error messages
 * @returns Resolved env object with all $VAR_NAME values replaced with actual values
 * @throws Error if a referenced environment variable is missing
 */
export function resolveMcpEnv(
  env: Record<string, string> | undefined,
  agentId: string,
  mcpServerName: string,
): Record<string, string> {
  if (!env) return {}

  const resolved: Record<string, string> = {}

  for (const [key, value] of Object.entries(env)) {
    if (value.startsWith('$')) {
      // $VAR_NAME reference - resolve from process.env
      const envVarName = value.slice(1) // Remove the leading $
      const envValue = process.env[envVarName]

      if (envValue === undefined) {
        throw new Error(
          `Missing environment variable '${envVarName}' required by agent '${agentId}' in mcpServers.${mcpServerName}.env.${key}`,
        )
      }

      resolved[key] = envValue
    } else {
      // Plain string value - use as-is
      resolved[key] = value
    }
  }

  return resolved
}

/**
 * Resolves all MCP server env references in an agent definition.
 * Mutates the mcpServers object to replace $VAR_NAME references with resolved values.
 *
 * @param agent - The agent definition to process
 * @throws Error if any referenced environment variable is missing
 */
export function resolveAgentMcpEnv(agent: AgentDefinition): void {
  if (!agent.mcpServers) return

  for (const [serverName, config] of Object.entries(agent.mcpServers)) {
    if ('command' in config && config.env) {
      config.env = resolveMcpEnv(config.env, agent.id, serverName)
    }
  }
}

/**
 * Validation error for an agent that failed validation.
 */
export type AgentValidationError = {
  /** The agent's ID */
  agentId: string
  /** The source file path where the agent was loaded from */
  filePath: string
  /** The validation error message */
  message: string
}

/**
 * Result returned by loadLocalAgents when validate: true.
 * Contains both the valid agents and any validation errors.
 */
export type LoadLocalAgentsResult = {
  /** Valid agent definitions that passed validation */
  agents: LoadedAgents
  /** Validation errors for agents that failed validation */
  validationErrors: AgentValidationError[]
}

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

/**
 * Load agent definitions from `.agents` directories.
 *
 * By default, searches for agents in:
 * - `{cwd}/.agents`
 * - `{cwd}/../.agents`
 * - `{homedir}/.agents`
 *
 * Agent files can be `.ts`, `.tsx`, `.js`, `.mjs`, or `.cjs`.
 * TypeScript files are automatically transpiled.
 *
 * @param options.agentsPath - Optional path to a specific agents directory
 * @param options.verbose - Whether to log errors during loading
 * @param options.validate - Whether to validate agents after loading
 * @returns When validate is false/omitted: Record of agent definitions keyed by agent ID.
 *          When validate is true: Object with valid agents and validation errors.
 *
 * @example
 * ```typescript
 * // Load from default locations
 * const agents = await loadLocalAgents({ verbose: true })
 *
 * // Load from a specific directory
 * const agents = await loadLocalAgents({ agentsPath: './my-agents' })
 *
 * // Load and validate agents - returns both valid agents and errors
 * const { agents, validationErrors } = await loadLocalAgents({ validate: true })
 * if (validationErrors.length > 0) {
 *   console.error('Some agents failed validation:', validationErrors)
 * }
 *
 * // Access source file path for debugging
 * for (const agent of Object.values(agents)) {
 *   console.log(`${agent.id} loaded from ${agent._sourceFilePath}`)
 * }
 *
 * // Use with client.run()
 * const result = await client.run({
 *   agent: 'my-agent',
 *   agentDefinitions: Object.values(agents),
 *   prompt: 'Hello',
 * })
 * ```
 */
// Overload: validate: true returns result with agents and errors
export async function loadLocalAgents(options: {
  agentsPath?: string
  verbose?: boolean
  validate: true
}): Promise<LoadLocalAgentsResult>

// Overload: validate: false or omitted returns just agents (backward compatible)
export async function loadLocalAgents(options: {
  agentsPath?: string
  verbose?: boolean
  validate?: false
}): Promise<LoadedAgents>

// Implementation
export async function loadLocalAgents({
  agentsPath,
  verbose = false,
  validate = false,
}: {
  agentsPath?: string
  verbose?: boolean
  validate?: boolean
}): Promise<LoadedAgents | LoadLocalAgentsResult> {
  const agents: LoadedAgents = {}

  const agentDirs = agentsPath ? [agentsPath] : getDefaultAgentDirs()
  const allAgentFiles = agentDirs.flatMap((dir) => getAllAgentFiles(dir))

  if (allAgentFiles.length === 0) {
    return validate ? { agents, validationErrors: [] } : agents
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

      const processedAgentDefinition: LoadedAgentDefinition = {
        ...agentDefinition,
        _sourceFilePath: fullPath,
      }
      if (agentDefinition.handleSteps) {
        processedAgentDefinition.handleSteps =
          agentDefinition.handleSteps.toString()
      }

      // Resolve $env references in MCP server configs
      try {
        resolveAgentMcpEnv(processedAgentDefinition)
      } catch (error) {
        if (verbose) {
          console.error(
            error instanceof Error ? error.message : String(error),
          )
        }
        continue
      }

      agents[processedAgentDefinition.id] = processedAgentDefinition
    } catch (error) {
      if (verbose) {
        console.error(
          `Error loading agent from file ${fullPath}:`,
          error instanceof Error ? error.message : error,
        )
      }
    }
  }

  // Validate agents if requested
  if (validate) {
    const validationErrors: AgentValidationError[] = []

    if (Object.keys(agents).length > 0) {
      const result = await validateAgents(Object.values(agents))

      if (!result.success) {
        // Build a map of agent IDs to their validation errors
        // The validation error id format is "{agentId}_{index}" from validateAgents
        const errorsByAgentId = new Map<string, string>()
        for (const err of result.validationErrors) {
          // Extract agent ID by removing the "_index" suffix added by validateAgents
          const lastUnderscoreIdx = err.id.lastIndexOf('_')
          const agentId =
            lastUnderscoreIdx > 0 ? err.id.slice(0, lastUnderscoreIdx) : err.id
          if (!errorsByAgentId.has(agentId)) {
            errorsByAgentId.set(agentId, err.message)
          }
        }

        // Filter out invalid agents and collect validation errors
        for (const agentId of Object.keys(agents)) {
          const errorMessage = errorsByAgentId.get(agentId)
          if (errorMessage) {
            const agent = agents[agentId]
            validationErrors.push({
              agentId,
              filePath: agent._sourceFilePath,
              message: errorMessage,
            })
            if (verbose) {
              console.error(
                `Validation failed for agent '${agentId}': ${errorMessage}`,
              )
            }
            delete agents[agentId]
          }
        }
      }
    }

    return { agents, validationErrors }
  }

  return agents
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
  const canUseBunBuild =
    typeof Bun !== 'undefined' && typeof Bun.build === 'function'

  if (!canUseBunBuild) {
    if (verbose) {
      console.error(`Cannot transpile ${fullPath}: Bun.build not available`)
    }
    return null
  }

  const hash = createHash('sha1').update(fullPath).digest('hex')
  // Store compiled agents inside the current project so node module resolution
  // can find dependencies (e.g. lodash, zod/v4) via parent node_modules.
  const tempDir = path.join(process.cwd(), '.codebuff', 'agents')
  const compiledPath = path.join(tempDir, `${hash}.mjs`)

  const result = await Bun.build({
    entrypoints: [fullPath],
    outdir: tempDir,
    target: 'node',
    format: 'esm',
    sourcemap: 'inline',
    splitting: false,
    minify: false,
    root: process.cwd(),
    packages: 'external',
    external: [
      ...builtinModules,
      ...builtinModules.map((mod) => `node:${mod}`),
    ],
    throw: false,
  })

  if (!result.success) {
    if (verbose) {
      console.error(`Bun.build failed for agent: ${fullPath}`)
    }
    return null
  }

  const entryOutput =
    result.outputs.find((output) => output.kind === 'entry-point') ??
    result.outputs[0]
  const jsText = entryOutput ? await entryOutput.text() : null
  if (!jsText) {
    if (verbose) {
      console.error(`Failed to transpile agent (no output): ${fullPath}`)
    }
    return null
  }

  await fs.promises.mkdir(tempDir, { recursive: true })
  await fs.promises.writeFile(compiledPath, jsText, 'utf8')
  return compiledPath
}
