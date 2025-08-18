import * as os from 'os'

import { type CustomToolDefinition } from './custom-tool'
import { getFileTokenScores } from '../../packages/code-map/src/parse'
import { getInitialSessionState } from '../../common/src/types/session-state'

import type { ServerAction } from '../../common/src/actions'
import type { AgentDefinition } from '../../common/src/templates/initial-agents-dir/types/agent-definition'
import type { CodebuffMessage } from '../../common/src/types/message'
import type { SessionState } from '../../common/src/types/session-state'
import type {
  CustomToolDefinitions,
  FileTreeNode,
} from '../../common/src/util/file'

export type RunState = {
  sessionState: SessionState
  toolResults: ServerAction<'prompt-response'>['toolResults']
}

export async function initialSessionState(
  cwd: string,
  options: {
    projectFiles?: Record<string, string>
    knowledgeFiles?: Record<string, string>
    agentDefinitions?: AgentDefinition[]
    customToolDefinitions?: CustomToolDefinition[]
    maxAgentSteps?: number
  },
) {
  const { projectFiles = {}, agentDefinitions = [] } = options
  let { knowledgeFiles } = options

  if (knowledgeFiles === undefined) {
    knowledgeFiles = {}
    for (const [filePath, fileContents] of Object.entries(projectFiles)) {
      if (filePath in projectFiles) {
        continue
      }
      const lowercasePathName = filePath.toLowerCase()
      if (
        !lowercasePathName.endsWith('knowledge.md') &&
        !lowercasePathName.endsWith('claude.md')
      ) {
        continue
      }

      knowledgeFiles[filePath] = fileContents
    }
  }

  // Process agentDefinitions array and convert handleSteps functions to strings
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

  const processedCustomToolDefinitions: Record<
    string,
    Pick<CustomToolDefinition, keyof NonNullable<CustomToolDefinitions>[string]>
  > = Object.fromEntries(
    (options.customToolDefinitions ?? []).map((toolDefinition) => [
      toolDefinition.toolName,
      {
        inputJsonSchema: toolDefinition.inputJsonSchema,
        description: toolDefinition.description,
        endsAgentStep: toolDefinition.endsAgentStep,
        exampleInputs: toolDefinition.exampleInputs,
      },
    ]),
  )

  // Generate file tree and token scores from projectFiles
  const filePaths = Object.keys(projectFiles).sort()

  // Build hierarchical file tree with directories
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

  const initialState = getInitialSessionState({
    projectRoot: cwd,
    cwd,
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

  if (options.maxAgentSteps) {
    initialState.mainAgentState.stepsRemaining = options.maxAgentSteps
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
}: {
  cwd: string
  projectFiles?: Record<string, string>
  knowledgeFiles?: Record<string, string>
  agentDefinitions?: AgentDefinition[]
  customToolDefinitions?: CustomToolDefinition[]
  maxAgentSteps?: number
}): Promise<RunState> {
  return {
    sessionState: await initialSessionState(cwd, {
      projectFiles,
      knowledgeFiles,
      agentDefinitions,
      customToolDefinitions,
      maxAgentSteps,
    }),
    toolResults: [],
  }
}

export function withAdditionalMessage({
  runState,
  message,
}: {
  runState: RunState
  message: CodebuffMessage
}): RunState {
  // Deep copy
  const newRunState = JSON.parse(JSON.stringify(runState)) as typeof runState

  newRunState.sessionState.mainAgentState.messageHistory.push(message)

  return newRunState
}

export function withMessageHistory({
  runState,
  messages,
}: {
  runState: RunState
  messages: CodebuffMessage[]
}): RunState {
  // Deep copy
  const newRunState = JSON.parse(JSON.stringify(runState)) as typeof runState

  newRunState.sessionState.mainAgentState.messageHistory = messages

  return newRunState
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
