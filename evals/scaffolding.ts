import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { runAgentStep } from '@codebuff/agent-runtime/run-agent-step'
import { assembleLocalAgentTemplates } from '@codebuff/agent-runtime/templates/agent-registry'
import { getFileTokenScores } from '@codebuff/code-map/parse'
import { API_KEY_ENV_VAR, TEST_USER_ID } from '@codebuff/common/old-constants'
import { clientToolCallSchema } from '@codebuff/common/tools/list'
import { generateCompactId } from '@codebuff/common/util/string'
import { getSystemInfo } from '@codebuff/common/util/system-info'
import { ToolHelpers } from '@codebuff/sdk'
import { blue } from 'picocolors'

import { EVALS_AGENT_RUNTIME_IMPL } from './impl/agent-runtime'
import {
  getAllFilePaths,
  getProjectFileTree,
} from '../common/src/project-file-tree'

import type { ClientToolCall } from '@codebuff/common/tools/list'
import type { AgentRuntimeScopedDeps } from '@codebuff/common/types/contracts/agent-runtime'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { ToolMessage } from '@codebuff/common/types/messages/codebuff-message'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentState,
  AgentTemplateType,
  SessionState,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'

const DEBUG_MODE = true

function readMockFile(projectRoot: string, filePath: string): string | null {
  const fullPath = path.join(projectRoot, filePath)
  try {
    return fs.readFileSync(fullPath, 'utf-8')
  } catch (error) {
    return null
  }
}

let toolCalls: ClientToolCall[] = []
let toolResults: ToolMessage[] = []
const defaultFs: CodebuffFileSystem = {
  ...(fs.promises as unknown as CodebuffFileSystem),
  exists: async (pathLike) => {
    try {
      await fs.promises.access(pathLike as fs.PathLike)
      return true
    } catch {
      return false
    }
  },
}
let projectRootForMocks: string | undefined

export function createFileReadingMock(projectRoot: string) {
  projectRootForMocks = projectRoot
}

function getActiveProjectRoot(fileContext?: ProjectFileContext) {
  return fileContext?.projectRoot ?? projectRootForMocks ?? process.cwd()
}

async function readFilesFromProject(params: {
  projectRoot: string
  filePaths: string[]
}) {
  const { projectRoot, filePaths } = params
  const files: Record<string, string | null> = {}
  for (const filePath of filePaths) {
    const fileContent = readMockFile(projectRoot, filePath)
    files[filePath] = fileContent
  }
  return files
}

async function executeToolCall(
  toolCall: ClientToolCall,
  projectRoot: string,
): Promise<ToolResultOutput[]> {
  switch (toolCall.toolName) {
    case 'write_file':
    case 'str_replace':
      return ToolHelpers.changeFile({
        parameters: toolCall.input,
        cwd: projectRoot,
        fs: defaultFs,
      })
    case 'run_terminal_command': {
      const resolvedCwd = path.resolve(
        projectRoot,
        (toolCall.input as { cwd?: string }).cwd ?? '.',
      )
      return ToolHelpers.runTerminalCommand({
        ...(toolCall.input as any),
        cwd: resolvedCwd,
      })
    }
    case 'code_search':
      return ToolHelpers.codeSearch({
        ...(toolCall.input as any),
        projectPath: projectRoot,
      })
    case 'list_directory':
      return ToolHelpers.listDirectory({
        directoryPath: (toolCall.input as { path: string }).path,
        projectPath: projectRoot,
        fs: defaultFs,
      })
    case 'glob':
      return ToolHelpers.glob({
        ...(toolCall.input as any),
        projectPath: projectRoot,
        fs: defaultFs,
      })
    case 'run_file_change_hooks':
      return ToolHelpers.runFileChangeHooks(toolCall.input as any)
    case 'browser_logs':
    case 'create_plan':
      return [
        {
          type: 'json',
          value: {
            message: `Tool ${toolCall.toolName} is a no-op in eval scaffolding.`,
          },
        },
      ]
    case 'ask_user':
      return [
        {
          type: 'json',
          value: {
            errorMessage: 'ask_user is not supported in eval scaffolding',
          },
        },
      ]
    default:
      return [
        {
          type: 'json',
          value: {
            errorMessage: 'Unsupported tool in eval scaffolding',
          },
        },
      ]
  }
}

export async function getProjectFileContext(
  projectPath: string,
): Promise<ProjectFileContext> {
  projectRootForMocks = projectPath
  const fileTree = await getProjectFileTree({
    projectRoot: projectPath,
    fs: fs.promises,
  })
  const allFilePaths = getAllFilePaths(fileTree)
  const knowledgeFilePaths = allFilePaths.filter((filePath) =>
    filePath.endsWith('knowledge.md'),
  )
  const knowledgeFiles: Record<string, string> = {}
  for (const filePath of knowledgeFilePaths) {
    const content = readMockFile(projectPath, filePath)
    if (content !== null) {
      knowledgeFiles[filePath] = content
    }
  }
  const fileTokenScores = (await getFileTokenScores(projectPath, allFilePaths))
    .tokenScores
  return {
    projectRoot: projectPath,
    cwd: projectPath,
    gitChanges: {
      status: '',
      diff: '',
      diffCached: '',
      lastCommitMessages: '',
    },
    changesSinceLastChat: {},
    systemInfo: getSystemInfo(),
    shellConfigFiles: {},
    knowledgeFiles,
    fileTokenScores,
    fileTree,
    agentTemplates: {},
    customToolDefinitions: {},
  }
}

export async function runAgentStepScaffolding(
  agentState: AgentState,
  fileContext: ProjectFileContext,
  prompt: string | undefined,
  sessionId: string,
  agentType: AgentTemplateType,
) {
  let fullResponse = ''
  const projectRoot = getActiveProjectRoot(fileContext)
  const { agentTemplates: localAgentTemplates } = assembleLocalAgentTemplates({
    fileContext,
    logger: console,
  })

  const agentRuntimeScopedImpl: AgentRuntimeScopedDeps = {
    handleStepsLogChunk: () => {},
    requestToolCall: async ({ toolName, input }) => {
      const parsedToolCall = clientToolCallSchema.parse({ toolName, input })
      const toolCall: ClientToolCall = {
        ...(parsedToolCall as ClientToolCall),
        toolCallId: generateCompactId(),
      }
      toolCalls.push(toolCall)
      const output = await executeToolCall(toolCall, projectRoot)
      toolResults.push({
        role: 'tool',
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        content: output,
      })
      return { output }
    },
    requestMcpToolData: async () => [],
    requestFiles: ({ filePaths }) =>
      readFilesFromProject({ projectRoot, filePaths }),
    requestOptionalFile: async ({ filePath }) => {
      const files = await readFilesFromProject({
        projectRoot,
        filePaths: [filePath],
      })
      return files[filePath] ?? null
    },
    sendSubagentChunk: () => {},
    sendAction: () => {},
    apiKey: process.env[API_KEY_ENV_VAR] ?? '',
  }
  const result = await runAgentStep({
    ...EVALS_AGENT_RUNTIME_IMPL,
    ...agentRuntimeScopedImpl,

    additionalToolDefinitions: () => Promise.resolve({}),
    agentState,
    agentType,
    ancestorRunIds: [],
    clientSessionId: sessionId,
    fileContext,
    fingerprintId: 'test-fingerprint-id',
    localAgentTemplates,
    onResponseChunk: (chunk: string | PrintModeEvent) => {
      if (typeof chunk !== 'string') {
        return
      }
      if (DEBUG_MODE) {
        process.stdout.write(chunk)
      }
      fullResponse += chunk
    },
    prompt,
    repoId: undefined,
    repoUrl: undefined,
    runId: 'test-run-id',
    signal: new AbortController().signal,
    spawnParams: undefined,
    system: 'Test system prompt',
    tools: {},
    userId: TEST_USER_ID,
    userInputId: generateCompactId(),
  })

  return {
    ...result,
    fullResponse,
  }
}

export async function runToolCalls(toolCalls: ClientToolCall[]) {
  const toolResults: ToolMessage[] = []
  for (const toolCall of toolCalls) {
    const toolCallId = toolCall.toolCallId ?? generateCompactId()
    const output = await executeToolCall(
      { ...toolCall, toolCallId } as ClientToolCall,
      getActiveProjectRoot(),
    )
    toolResults.push({
      role: 'tool',
      toolName: toolCall.toolName,
      toolCallId,
      content: output,
    })
  }
  return toolResults
}

export async function loopMainPrompt({
  sessionState,
  prompt,
  maxIterations,
  stopCondition,
  agentType,
}: {
  sessionState: SessionState
  prompt: string
  maxIterations: number
  stopCondition?: (sessionState: AgentState) => boolean
  agentType: AgentTemplateType
}) {
  console.log(blue(prompt))

  const startTime = Date.now()
  const sessionId = 'test-session-id-' + generateCompactId()
  let currentAgentState = sessionState.mainAgentState
  let iterations = 1
  const steps: any[] = []

  for (; iterations < maxIterations; iterations++) {
    console.log('\nIteration', iterations)
    let {
      agentState: newAgentState,
      fullResponse,
      shouldEndTurn,
    } = await runAgentStepScaffolding(
      currentAgentState,
      sessionState.fileContext,
      iterations === 1 ? prompt : undefined,
      sessionId,
      agentType,
    )
    currentAgentState = newAgentState

    const stop = stopCondition && stopCondition(currentAgentState)
    if (stop) break

    steps.push({
      response: fullResponse,
      toolCalls,
      toolResults,
    })

    toolCalls = []
    toolResults = []

    if (shouldEndTurn) {
      break
    }
  }

  console.log('Main loop finished!')
  console.log('  - iterations', iterations)
  console.log(
    '  - took',
    ((Date.now() - startTime) / 1000).toFixed(2),
    'seconds',
  )

  return {
    agentState: currentAgentState,
    iterations: iterations - 1,
    steps,
    duration: Date.now() - startTime,
  }
}

export function extractErrorFiles(output: string): string[] {
  const lines = output.split('\n')
  return lines
    .filter((line) => line.includes(': error TS'))
    .map((line) => line.split('(')[0].trim())
}

export function resetRepoToCommit(projectPath: string, commit: string) {
  console.log(`Resetting repository at ${projectPath} to commit ${commit}...`)
  try {
    execSync(
      `cd ${projectPath} && git reset --hard ${commit} && git clean -fd`,
      {
        timeout: 30_000,
      },
    )
    console.log('Repository reset successful')
  } catch (error) {
    console.error('Error resetting repository:', error)
    throw error
  }
}

export default {
  createFileReadingMock,
  getProjectFileContext,
  runAgentStepScaffolding,
  runToolCalls,
  loopMainPrompt,
  extractErrorFiles,
  resetRepoToCommit,
}
