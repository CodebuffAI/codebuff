import * as os from 'os'
import path from 'path'

import { cloneDeep } from 'lodash'

import {
  getProjectFileTree,
  getAllFilePaths,
} from '../../common/src/project-file-tree'
import { getInitialSessionState } from '../../common/src/types/session-state'
import { getFileTokenScores } from '../../packages/code-map/src/parse'

import type { CustomToolDefinition } from './custom-tool'
import type { AgentDefinition } from '../../common/src/templates/initial-agents-dir/types/agent-definition'
import type { CodebuffFileSystem } from '../../common/src/types/filesystem'
import type { Message } from '../../common/src/types/messages/codebuff-message'
import type {
  AgentOutput,
  SessionState,
} from '../../common/src/types/session-state'
import type {
  CustomToolDefinitions,
  FileTreeNode,
} from '../../common/src/util/file'

export type RunState = {
  sessionState: SessionState
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
        inputJsonSchema: toolDefinition.inputJsonSchema,
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
 * Discovers project files using .gitignore patterns when projectFiles is undefined
 */
function discoverProjectFiles(params: {
  cwd: string
  fs: CodebuffFileSystem
}): Record<string, string> {
  const { cwd, fs } = params

  const fileTree = getProjectFileTree({ projectRoot: cwd, fs })
  const filePaths = getAllFilePaths(fileTree)
  let error

  // Create projectFiles with empty content - the token scorer will read from disk
  const projectFiles = Object.fromEntries(
    filePaths.map((filePath) => {
      try {
        return [filePath, fs.readFileSync(path.join(cwd, filePath), 'utf8')]
      } catch (err) {
        error = err
        return [filePath, '[ERROR_READING_FILE]']
      }
    }),
  )
  if (error) {
    console.warn('Failed to discover some project files:', error)
  }
  return projectFiles
}

/**
 * Auto-derives knowledge files from project files if knowledgeFiles is undefined
 */
function deriveKnowledgeFiles(
  projectFiles: Record<string, string>,
): Record<string, string> {
  const knowledgeFiles: Record<string, string> = {}
  for (const [filePath, fileContents] of Object.entries(projectFiles)) {
    const lowercasePathName = filePath.toLowerCase()
    if (
      lowercasePathName.endsWith('knowledge.md') ||
      lowercasePathName.endsWith('claude.md')
    ) {
      knowledgeFiles[filePath] = fileContents
    }
  }
  return knowledgeFiles
}

export function initialSessionState(
  options: InitialSessionStateOptions,
): Promise<SessionState>
export function initialSessionState(
  cwd: string,
  options?: Omit<InitialSessionStateOptions, 'cwd'>,
): Promise<SessionState>
export async function initialSessionState(
  arg1: string | InitialSessionStateOptions,
  arg2?: Omit<InitialSessionStateOptions, 'cwd'>,
): Promise<SessionState> {
  const options: InitialSessionStateOptions =
    typeof arg1 === 'string' ? { ...(arg2 ?? {}), cwd: arg1 } : arg1 ?? {}

  const cwd = options.cwd
  const agentDefinitions = options.agentDefinitions ?? []
  const customToolDefinitions = options.customToolDefinitions ?? []
  const maxAgentSteps = options.maxAgentSteps

  let projectFiles = options.projectFiles
  let knowledgeFiles = options.knowledgeFiles
  let fs: CodebuffFileSystem | undefined = options.fs

  if (!fs) {
    fs = (await import('fs')) as unknown as CodebuffFileSystem
  }

  // Auto-discover project files if not provided and cwd is available
  if (projectFiles === undefined && cwd) {
    projectFiles = discoverProjectFiles({ cwd, fs })
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
    gitChanges: {
      status: '',
      diff: '',
      diffCached: '',
      lastCommitMessages: '',
    },
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

  newRunState.sessionState.mainAgentState.messageHistory.push(message)

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

  newRunState.sessionState.mainAgentState.messageHistory = messages

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
