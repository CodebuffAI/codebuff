import * as os from 'os'

import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { cloneDeep } from 'lodash'

import { loadLocalAgents } from './agents/load-agents'
import { computeProjectIndex } from './impl/file-tree-builder'
import { getGitChanges } from './impl/git-operations'
import { deriveKnowledgeFiles, loadUserKnowledgeFile } from './impl/knowledge-files'
import { discoverProjectFiles } from './impl/project-discovery'
import {
  processAgentDefinitions,
  processCustomToolDefinitions,
} from './impl/session-state-processors'

// Re-export for SDK consumers
export {
  KNOWLEDGE_FILE_NAMES,
  PRIMARY_KNOWLEDGE_FILE_NAME,
  isKnowledgeFile,
} from '@codebuff/common/constants/knowledge'

// Re-export for backward compatibility (these are tested individually)
export {
  selectHighestPriorityKnowledgeFile,
  loadUserKnowledgeFile,
  selectKnowledgeFilePaths,
} from './impl/knowledge-files'

import type { CustomToolDefinition } from './custom-tool'
import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type {
  AgentOutput,
  SessionState,
} from '@codebuff/common/types/session-state'
import type { CodebuffSpawn } from '@codebuff/common/types/spawn'
import type { FileTreeNode } from '@codebuff/common/util/file'
import type * as fsType from 'fs'

export type RunState = {
  sessionState?: SessionState
  output: AgentOutput
}

export type InitialSessionStateOptions = {
  cwd?: string
  projectFiles?: Record<string, string>
  knowledgeFiles?: Record<string, string>
  userKnowledgeFiles?: Record<string, string>
  agentDefinitions?: AgentDefinition[]
  customToolDefinitions?: CustomToolDefinition[]
  maxAgentSteps?: number
  fs?: CodebuffFileSystem
  spawn?: CodebuffSpawn
  logger?: Logger
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
    userKnowledgeFiles: providedUserKnowledgeFiles,
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

  // Auto-discover project files if not provided
  if (projectFiles === undefined && cwd) {
    projectFiles = await discoverProjectFiles({ cwd, fs, logger })
  }
  if (knowledgeFiles === undefined) {
    knowledgeFiles = projectFiles ? deriveKnowledgeFiles(projectFiles) : {}
  }

  // Process agent templates
  let processedAgentTemplates: Record<string, unknown> = {}
  if (agentDefinitions && agentDefinitions.length > 0) {
    processedAgentTemplates = processAgentDefinitions(agentDefinitions, logger)
  } else {
    processedAgentTemplates = await loadLocalAgents({ verbose: false })
  }
  const processedCustomToolDefinitions =
    processCustomToolDefinitions(customToolDefinitions)

  // Generate file tree and token scores
  let fileTree: FileTreeNode[] = []
  let fileTokenScores: Record<string, Record<string, number>> = {}
  let tokenCallers: Record<string, Record<string, string[]>> = {}

  if (cwd && projectFiles) {
    const result = await computeProjectIndex(cwd, projectFiles, logger)
    fileTree = result.fileTree
    fileTokenScores = result.fileTokenScores
    tokenCallers = result.tokenCallers
  }

  // Gather git changes
  const gitChanges = cwd
    ? await getGitChanges({ cwd, spawn, logger })
    : {
        status: '',
        diff: '',
        diffCached: '',
        lastCommitMessages: '',
      }

  // Load user knowledge file from home directory (highest priority only)
  const homeKnowledgeFiles = await loadUserKnowledgeFile({ fs, logger })
  const userKnowledgeFiles = {
    ...homeKnowledgeFiles,
    ...providedUserKnowledgeFiles,
  }

  const initialState = getInitialSessionState({
    projectRoot: cwd ?? process.cwd(),
    cwd: cwd ?? process.cwd(),
    fileTree,
    fileTokenScores,
    tokenCallers,
    knowledgeFiles,
    userKnowledgeFiles,
    agentTemplates: processedAgentTemplates,
    customToolDefinitions: processedCustomToolDefinitions,
    gitChanges,
    changesSinceLastChat: {},
    shellConfigFiles: {},
    systemInfo: {
      platform: process.platform,
      shell: 'bash',
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
  userKnowledgeFiles,
  agentDefinitions,
  customToolDefinitions,
  maxAgentSteps,
  fs,
}: {
  cwd: string
  projectFiles?: Record<string, string>
  knowledgeFiles?: Record<string, string>
  userKnowledgeFiles?: Record<string, string>
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
      userKnowledgeFiles,
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
  const newRunState = cloneDeep(runState)

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
  const sessionState = cloneDeep(baseSessionState)

  if (overrides.maxAgentSteps !== undefined) {
    sessionState.mainAgentState.stepsRemaining = overrides.maxAgentSteps
  }

  if (overrides.projectFiles !== undefined) {
    if (cwd) {
      const { fileTree, fileTokenScores, tokenCallers } =
        await computeProjectIndex(cwd, overrides.projectFiles)
      sessionState.fileContext.fileTree = fileTree
      sessionState.fileContext.fileTokenScores = fileTokenScores
      sessionState.fileContext.tokenCallers = tokenCallers
    } else {
      sessionState.fileContext.fileTree = []
      sessionState.fileContext.fileTokenScores = {}
      sessionState.fileContext.tokenCallers = {}
    }

    if (overrides.knowledgeFiles === undefined) {
      sessionState.fileContext.knowledgeFiles = deriveKnowledgeFiles(
        overrides.projectFiles,
      )
    }
  }

  if (overrides.knowledgeFiles !== undefined) {
    sessionState.fileContext.knowledgeFiles = overrides.knowledgeFiles
  }

  if (overrides.agentDefinitions !== undefined) {
    const processedAgentTemplates = processAgentDefinitions(
      overrides.agentDefinitions,
      // Note: no logger available in this context - consider adding to params if needed
    )
    sessionState.fileContext.agentTemplates = {
      ...sessionState.fileContext.agentTemplates,
      ...processedAgentTemplates,
    }
  }

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
