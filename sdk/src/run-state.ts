import * as os from 'os'
import path from 'path'

import { getFileTokenScores } from '@codebuff/code-map/parse'
import {
  getProjectFileTree,
  getAllFilePaths,
} from '@codebuff/common/project-file-tree'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { getErrorObject } from '@codebuff/common/util/error'
import { cloneDeep } from 'lodash'

import type { CustomToolDefinition } from './custom-tool'
import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { CodebuffSpawn } from '@codebuff/common/types/spawn'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type {
  AgentOutput,
  SessionState,
} from '@codebuff/common/types/session-state'
import type {
  CustomToolDefinitions,
  FileTreeNode,
} from '@codebuff/common/util/file'
import type * as fsType from 'fs'

export type RunState = {
  sessionState?: SessionState
  output: AgentOutput
}

export type InitialSessionStateOptions = {
  cwd?: string
  projectFiles?: Record<string, string>
  knowledgeFiles?: Record<string, string>
  agentDefinitions?: AgentDefinition[]
  customToolDefinitions?: CustomToolDefinition[]
  maxAgentSteps?: number
  fs?: CodebuffFileSystem
  spawn?: CodebuffSpawn
  logger?: Logger
}

/**
 * Processes agent definitions array and converts handleSteps functions to strings
 */
function processAgentDefinitions(
  agentDefinitions: AgentDefinition[],
): Record<string, any> {
  const processedAgentTemplates: Record<string, any> = {}
  agentDefinitions.forEach((definition) => {
    const processedConfig = { ...definition } as Record<string, any>
    if (
      processedConfig.handleSteps &&
      typeof processedConfig.handleSteps === 'function'
    ) {
      processedConfig.handleSteps = processedConfig.handleSteps.toString()
    }
    if (processedConfig.id) {
      processedAgentTemplates[processedConfig.id] = processedConfig
    }
  })
  return processedAgentTemplates
}

/**
 * Processes custom tool definitions into the format expected by SessionState
 */
function processCustomToolDefinitions(
  customToolDefinitions: CustomToolDefinition[],
): Record<
  string,
  Pick<CustomToolDefinition, keyof NonNullable<CustomToolDefinitions>[string]>
> {
  return Object.fromEntries(
    customToolDefinitions.map((toolDefinition) => [
      toolDefinition.toolName,
      {
        inputSchema: toolDefinition.inputSchema,
        description: toolDefinition.description,
        endsAgentStep: toolDefinition.endsAgentStep,
        exampleInputs: toolDefinition.exampleInputs,
      },
    ]),
  )
}

/**
 * Computes project file indexes (file tree and token scores)
 */
async function computeProjectIndex(
  cwd: string,
  projectFiles: Record<string, string>,
): Promise<{
  fileTree: FileTreeNode[]
  fileTokenScores: Record<string, any>
  tokenCallers: Record<string, any>
}> {
  const filePaths = Object.keys(projectFiles).sort()
  const fileTree = buildFileTree(filePaths)
  let fileTokenScores = {}
  let tokenCallers = {}

  if (filePaths.length > 0) {
    try {
      const tokenData = await getFileTokenScores(
        cwd,
        filePaths,
        (filePath: string) => projectFiles[filePath] || null,
      )
      fileTokenScores = tokenData.tokenScores
      tokenCallers = tokenData.tokenCallers
    } catch (error) {
      // If token scoring fails, continue with empty scores
      console.warn('Failed to generate parsed symbol scores:', error)
    }
  }

  return { fileTree, fileTokenScores, tokenCallers }
}

/**
 * Helper to convert ChildProcess to Promise with stdout/stderr
 */
function childProcessToPromise(
  proc: ReturnType<CodebuffSpawn>,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`Command exited with code ${code}`))
      }
    })

    proc.on('error', reject)
  })
}

/**
 * Retrieves git changes for the project using the provided spawn function
 */
async function getGitChanges(params: {
  cwd: string
  spawn: CodebuffSpawn
  logger: Logger
}): Promise<{
  status: string
  diff: string
  diffCached: string
  lastCommitMessages: string
}> {
  const { cwd, spawn, logger } = params

  const status = childProcessToPromise(spawn('git', ['status'], { cwd }))
    .then(({ stdout }) => stdout)
    .catch((error) => {
      logger.debug?.({ error }, 'Failed to get git status')
      return ''
    })

  const diff = childProcessToPromise(spawn('git', ['diff'], { cwd }))
    .then(({ stdout }) => stdout)
    .catch((error) => {
      logger.debug?.({ error }, 'Failed to get git diff')
      return ''
    })

  const diffCached = childProcessToPromise(
    spawn('git', ['diff', '--cached'], { cwd }),
  )
    .then(({ stdout }) => stdout)
    .catch((error) => {
      logger.debug?.({ error }, 'Failed to get git diff --cached')
      return ''
    })

  const lastCommitMessages = childProcessToPromise(
    spawn('git', ['shortlog', 'HEAD~10..HEAD'], { cwd }),
  )
    .then(({ stdout }) =>
      stdout
        .trim()
        .split('\n')
        .slice(1)
        .reverse()
        .map((line) => line.trim())
        .join('\n'),
    )
    .catch((error) => {
      logger.debug?.({ error }, 'Failed to get lastCommitMessages')
      return ''
    })

  return {
    status: await status,
    diff: await diff,
    diffCached: await diffCached,
    lastCommitMessages: await lastCommitMessages,
  }
}

/**
 * Discovers project files using .gitignore patterns when projectFiles is undefined
 */
async function discoverProjectFiles(params: {
  cwd: string
  fs: CodebuffFileSystem
  logger: Logger
}): Promise<Record<string, string>> {
  const { cwd, fs, logger } = params

  const fileTree = await getProjectFileTree({ projectRoot: cwd, fs })
  const filePaths = getAllFilePaths(fileTree)
  let error

  // Create projectFiles with empty content - the token scorer will read from disk
  const projectFilePromises = Object.fromEntries(
    filePaths.map((filePath) => [
      filePath,
      fs.readFile(path.join(cwd, filePath), 'utf8').catch((err) => {
        error = err
        return '[ERROR_READING_FILE]'
      }),
    ]),
  )
  if (error) {
    logger.warn(
      { error: getErrorObject(error) },
      'Failed to discover some project files',
    )
  }

  const projectFilesResolved: Record<string, string> = {}
  for (const [filePath, contentPromise] of Object.entries(
    projectFilePromises,
  )) {
    projectFilesResolved[filePath] = await contentPromise
  }
  return projectFilesResolved
}

/**
 * Selects knowledge files from a list of file paths with fallback logic.
 * For each directory, checks for knowledge.md first, then AGENTS.md, then CLAUDE.md.
 * @internal Exported for testing
 */
export function selectKnowledgeFilePaths(allFilePaths: string[]): string[] {
  const knowledgeCandidates = allFilePaths.filter((filePath) => {
    const lowercaseFilePath = filePath.toLowerCase()
    return (
      lowercaseFilePath.endsWith('knowledge.md') ||
      lowercaseFilePath.endsWith('agents.md') ||
      lowercaseFilePath.endsWith('claude.md')
    )
  })

  // Group candidates by directory
  const byDirectory = new Map<string, string[]>()
  for (const filePath of knowledgeCandidates) {
    const dir = path.dirname(filePath)
    if (!byDirectory.has(dir)) {
      byDirectory.set(dir, [])
    }
    byDirectory.get(dir)!.push(filePath)
  }

  const selectedFiles: string[] = []

  // For each directory, select one knowledge file using fallback priority
  for (const [_dir, files] of byDirectory.entries()) {
    const knowledgeMd = files.find((f) =>
      f.toLowerCase().endsWith('knowledge.md'),
    )
    const agentsMd = files.find((f) => f.toLowerCase().endsWith('agents.md'))
    const claudeMd = files.find((f) => f.toLowerCase().endsWith('claude.md'))

    // Priority: knowledge.md > AGENTS.md > CLAUDE.md
    const selectedKnowledgeFile = knowledgeMd || agentsMd || claudeMd
    if (selectedKnowledgeFile) {
      selectedFiles.push(selectedKnowledgeFile)
    }
  }

  return selectedFiles
}

/**
 * Auto-derives knowledge files from project files if knowledgeFiles is undefined.
 * Implements fallback priority: knowledge.md > AGENTS.md > CLAUDE.md per directory.
 */
function deriveKnowledgeFiles(
  projectFiles: Record<string, string>,
): Record<string, string> {
  const allFilePaths = Object.keys(projectFiles)
  const selectedFilePaths = selectKnowledgeFilePaths(allFilePaths)

  const knowledgeFiles: Record<string, string> = {}
  for (const filePath of selectedFilePaths) {
    knowledgeFiles[filePath] = projectFiles[filePath]
  }
  return knowledgeFiles
}

export async function initialSessionState(
  params: InitialSessionStateOptions,
): Promise<SessionState> {
  const { cwd, maxAgentSteps } = params
  let {
    agentDefinitions,
    customToolDefinitions,
    projectFiles,
    knowledgeFiles,
    fs,
    spawn,
    logger,
  } = params
  if (!agentDefinitions) {
    agentDefinitions = []
  }
  if (!customToolDefinitions) {
    customToolDefinitions = []
  }
  if (!fs) {
    fs = (require('fs') as typeof fsType).promises
  }
  if (!spawn) {
    const { spawn: nodeSpawn } = require('child_process')
    spawn = nodeSpawn as CodebuffSpawn
  }
  if (!logger) {
    logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }
  }

  // Auto-discover project files if not provided and cwd is available
  if (projectFiles === undefined && cwd) {
    projectFiles = await discoverProjectFiles({ cwd, fs, logger })
  }
  if (knowledgeFiles === undefined) {
    knowledgeFiles = projectFiles ? deriveKnowledgeFiles(projectFiles) : {}
  }

  const processedAgentTemplates = processAgentDefinitions(agentDefinitions)
  const processedCustomToolDefinitions = processCustomToolDefinitions(
    customToolDefinitions,
  )

  // Generate file tree and token scores from projectFiles if available
  let fileTree: FileTreeNode[] = []
  let fileTokenScores: Record<string, any> = {}
  let tokenCallers: Record<string, any> = {}

  if (cwd && projectFiles) {
    const result = await computeProjectIndex(cwd, projectFiles)
    fileTree = result.fileTree
    fileTokenScores = result.fileTokenScores
    tokenCallers = result.tokenCallers
  }

  // Gather git changes if cwd is available
  const gitChanges = cwd
    ? await getGitChanges({ cwd, spawn, logger })
    : {
        status: '',
        diff: '',
        diffCached: '',
        lastCommitMessages: '',
      }

  const initialState = getInitialSessionState({
    projectRoot: cwd ?? process.cwd(),
    cwd: cwd ?? process.cwd(),
    fileTree,
    fileTokenScores,
    tokenCallers,
    knowledgeFiles,
    userKnowledgeFiles: {},
    agentTemplates: processedAgentTemplates,
    customToolDefinitions: processedCustomToolDefinitions,
    gitChanges,
    changesSinceLastChat: {},
    shellConfigFiles: {},
    systemInfo: {
      platform: process.platform,
      shell: process.platform === 'win32' ? 'cmd.exe' : 'bash',
      nodeVersion: process.version,
      arch: process.arch,
      homedir: os.homedir(),
      cpus: os.cpus().length ?? 1,
    },
  })

  if (maxAgentSteps) {
    initialState.mainAgentState.stepsRemaining = maxAgentSteps
  }

  return initialState
}

export async function generateInitialRunState({
  cwd,
  projectFiles,
  knowledgeFiles,
  agentDefinitions,
  customToolDefinitions,
  maxAgentSteps,
  fs,
}: {
  cwd: string
  projectFiles?: Record<string, string>
  knowledgeFiles?: Record<string, string>
  agentDefinitions?: AgentDefinition[]
  customToolDefinitions?: CustomToolDefinition[]
  maxAgentSteps?: number
  fs: CodebuffFileSystem
}): Promise<RunState> {
  return {
    sessionState: await initialSessionState({
      cwd,
      projectFiles,
      knowledgeFiles,
      agentDefinitions,
      customToolDefinitions,
      maxAgentSteps,
      fs,
    }),
    output: {
      type: 'error',
      message: 'No output yet',
    },
  }
}

export function withAdditionalMessage({
  runState,
  message,
}: {
  runState: RunState
  message: Message
}): RunState {
  const newRunState = cloneDeep(runState)

  if (newRunState.sessionState) {
    newRunState.sessionState.mainAgentState.messageHistory.push(message)
  }

  return newRunState
}

export function withMessageHistory({
  runState,
  messages,
}: {
  runState: RunState
  messages: Message[]
}): RunState {
  // Deep copy
  const newRunState = JSON.parse(JSON.stringify(runState)) as typeof runState

  if (newRunState.sessionState) {
    newRunState.sessionState.mainAgentState.messageHistory = messages
  }

  return newRunState
}

/**
 * Applies overrides to an existing session state, allowing specific fields to be updated
 * even when continuing from a previous run.
 */
export async function applyOverridesToSessionState(
  cwd: string | undefined,
  baseSessionState: SessionState,
  overrides: {
    projectFiles?: Record<string, string>
    knowledgeFiles?: Record<string, string>
    agentDefinitions?: AgentDefinition[]
    customToolDefinitions?: CustomToolDefinition[]
    maxAgentSteps?: number
  },
): Promise<SessionState> {
  // Deep clone to avoid mutating the original session state
  const sessionState = JSON.parse(
    JSON.stringify(baseSessionState),
  ) as SessionState

  // Apply maxAgentSteps override
  if (overrides.maxAgentSteps !== undefined) {
    sessionState.mainAgentState.stepsRemaining = overrides.maxAgentSteps
  }

  // Apply projectFiles override (recomputes file tree and token scores)
  if (overrides.projectFiles !== undefined) {
    if (cwd) {
      const { fileTree, fileTokenScores, tokenCallers } =
        await computeProjectIndex(cwd, overrides.projectFiles)
      sessionState.fileContext.fileTree = fileTree
      sessionState.fileContext.fileTokenScores = fileTokenScores
      sessionState.fileContext.tokenCallers = tokenCallers
    } else {
      // If projectFiles are provided but no cwd, reset file context fields
      sessionState.fileContext.fileTree = []
      sessionState.fileContext.fileTokenScores = {}
      sessionState.fileContext.tokenCallers = {}
    }

    // Auto-derive knowledgeFiles if not explicitly provided
    if (overrides.knowledgeFiles === undefined) {
      sessionState.fileContext.knowledgeFiles = deriveKnowledgeFiles(
        overrides.projectFiles,
      )
    }
  }

  // Apply knowledgeFiles override
  if (overrides.knowledgeFiles !== undefined) {
    sessionState.fileContext.knowledgeFiles = overrides.knowledgeFiles
  }

  // Apply agentDefinitions override (merge by id, last-in wins)
  if (overrides.agentDefinitions !== undefined) {
    const processedAgentTemplates = processAgentDefinitions(
      overrides.agentDefinitions,
    )
    sessionState.fileContext.agentTemplates = {
      ...sessionState.fileContext.agentTemplates,
      ...processedAgentTemplates,
    }
  }

  // Apply customToolDefinitions override (replace by toolName)
  if (overrides.customToolDefinitions !== undefined) {
    const processedCustomToolDefinitions = processCustomToolDefinitions(
      overrides.customToolDefinitions,
    )
    sessionState.fileContext.customToolDefinitions = {
      ...sessionState.fileContext.customToolDefinitions,
      ...processedCustomToolDefinitions,
    }
  }

  return sessionState
}

/**
 * Builds a hierarchical file tree from a flat list of file paths
 */
function buildFileTree(filePaths: string[]): FileTreeNode[] {
  const tree: Record<string, FileTreeNode> = {}

  // Build the tree structure
  for (const filePath of filePaths) {
    const parts = filePath.split('/')

    for (let i = 0; i < parts.length; i++) {
      const currentPath = parts.slice(0, i + 1).join('/')
      const isFile = i === parts.length - 1

      if (!tree[currentPath]) {
        tree[currentPath] = {
          name: parts[i],
          type: isFile ? 'file' : 'directory',
          filePath: currentPath,
          children: isFile ? undefined : [],
        }
      }
    }
  }

  // Organize into hierarchical structure
  const rootNodes: FileTreeNode[] = []
  const processed = new Set<string>()

  for (const [path, node] of Object.entries(tree)) {
    if (processed.has(path)) continue

    const parentPath = path.substring(0, path.lastIndexOf('/'))
    if (parentPath && tree[parentPath]) {
      // This node has a parent, add it to parent's children
      const parent = tree[parentPath]
      if (
        parent.children &&
        !parent.children.some((child) => child.filePath === path)
      ) {
        parent.children.push(node)
      }
    } else {
      // This is a root node
      rootNodes.push(node)
    }
    processed.add(path)
  }

  // Sort function for nodes
  function sortNodes(nodes: FileTreeNode[]): void {
    nodes.sort((a, b) => {
      // Directories first, then files
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

    // Recursively sort children
    for (const node of nodes) {
      if (node.children) {
        sortNodes(node.children)
      }
    }
  }

  sortNodes(rootNodes)
  return rootNodes
}
