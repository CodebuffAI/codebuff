import * as os from 'os'

import { type CustomToolDefinition } from './custom-tool'
import { getInitialSessionState } from '../../common/src/types/session-state'

import type { ServerAction } from '../../common/src/actions'
import type { AgentDefinition } from '../../common/src/templates/initial-agents-dir/types/agent-definition'
import type { CodebuffMessage } from '../../common/src/types/message'
import type { SessionState } from '../../common/src/types/session-state'
import type { CustomToolDefinitions } from '../../common/src/util/file'

export type RunState = {
  sessionState: SessionState
  toolResults: ServerAction<'prompt-response'>['toolResults']
}

export function initialSessionState(
  cwd: string,
  options: {
    // TODO: Parse projectFiles into fileTree, fileTokenScores, tokenCallers
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

  const initialState = getInitialSessionState({
    projectRoot: cwd,
    cwd,
    fileTree: [],
    fileTokenScores: {},
    tokenCallers: {},
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

export function generateInitialRunState({
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
}): RunState {
  return {
    sessionState: initialSessionState(cwd, {
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
