import { runAgentStep } from '@codebuff/backend/run-agent-step'
import { ClientToolCall } from '@codebuff/backend/tools'
import { getFileTokenScores } from '@codebuff/code-map/parse'
import { FileChanges } from '@codebuff/common/actions'
import { TEST_USER_ID } from '@codebuff/common/constants'
import {
  AgentState,
  AgentTemplateType,
  SessionState,
  ToolResult,
} from '@codebuff/common/types/session-state'
import { applyAndRevertChanges } from '@codebuff/common/util/changes'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { generateCompactId } from '@codebuff/common/util/string'
import { handleToolCall } from '@codebuff/npm-app/tool-handlers'
import { getSystemInfo } from '@codebuff/npm-app/utils/system-info'
import { mock } from 'bun:test'
import { execSync } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { blue } from 'picocolors'
import { ServerWebSocket } from 'bun'
import {
  getAllFilePaths,
  getProjectFileTree,
} from '../common/src/project-file-tree'

const DEBUG_MODE = true

export type AgentStep = {
  response: string
  toolCalls: ClientToolCall[]
  toolResults: ToolResult[]
}

function readMockFile(projectRoot: string, filePath: string): string | null {
  const fullPath = path.join(projectRoot, filePath)
  try {
    return fs.readFileSync(fullPath, 'utf-8')
  } catch (error) {
    return null
  }
}

let toolCalls: ClientToolCall[] = []
let toolResults: ToolResult[] = []
export function createFileReadingMock(projectRoot: string) {
  mock.module('backend/websockets/websocket-action', () => ({
    requestFiles: (ws: ServerWebSocket<unknown>, filePaths: string[]) => {
      const files: Record<string, string | null> = {}
      for (const filePath of filePaths) {
        files[filePath] = readMockFile(projectRoot, filePath)
      }
      return Promise.resolve(files)
    },
    requestToolCall: async (
      ws: ServerWebSocket<unknown>,
      toolName: string,
      args: Record<string, any>,
      timeout: number = 30_000
    ) => {
      // Execute the tool call using existing tool handlers
      const toolCall = {
        toolCallId: generateCompactId(),
        toolName,
        args,
      }
      toolCalls.push(toolCall as ClientToolCall)
      try {
        const toolResult = await handleToolCall(toolCall as any)
        toolResults.push({
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          result: toolResult.result,
        })

        // Send successful response back to backend
        return {
          success: true,
          result: toolResult.result,
        }
      } catch (error) {
        // Send error response back to backend
        const resultString =
          error instanceof Error ? error.message : String(error)
        toolResults.push({
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          result: resultString,
        })
        return {
          success: false,
          error: resultString,
        }
      }
    },
  }))
}

export async function getProjectFileContext(
  projectPath: string
): Promise<ProjectFileContext> {
  const fileTree = getProjectFileTree(projectPath)
  const allFilePaths = getAllFilePaths(fileTree)
  const knowledgeFilePaths = allFilePaths.filter((filePath) =>
    filePath.endsWith('knowledge.md')
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
    fileVersions: [],
    systemInfo: getSystemInfo(),
    shellConfigFiles: {},
    knowledgeFiles,
    fileTokenScores,
    fileTree,
  }
}

export async function runAgentStepScaffolding(
  agentState: AgentState,
  fileContext: ProjectFileContext,
  prompt: string | undefined,
  sessionId: string,
  agentType: AgentTemplateType
) {
  const mockWs = new EventEmitter() as any as ServerWebSocket<unknown>
  mockWs.send = mock()
  mockWs.close = mock()

  let fullResponse = ''

  const result = await runAgentStep(mockWs, {
    userId: TEST_USER_ID,
    userInputId: generateCompactId(),
    clientSessionId: sessionId,
    fingerprintId: 'test-fingerprint-id',
    onResponseChunk: (chunk: string) => {
      if (DEBUG_MODE) {
        process.stdout.write(chunk)
      }
      fullResponse += chunk
    },
    agentType,
    fileContext,
    agentState,
    prompt,
    params: undefined,
    assistantMessage: undefined,
    assistantPrefix: undefined,
  })

  return {
    ...result,
    fullResponse,
  }
}

export async function runToolCalls(toolCalls: ClientToolCall[]) {
  const toolResults: ToolResult[] = []
  for (const toolCall of toolCalls) {
    if (
      toolCall.toolName === 'spawn_agents' ||
      toolCall.toolName === 'update_report'
    ) {
      // should never happen
      continue
    }
    const toolResult = await handleToolCall(toolCall)
    toolResults.push(toolResult)
  }
  return toolResults
}

export async function loopMainPrompt({
  sessionState,
  prompt,
  projectPath,
  maxIterations,
  stopCondition,
  agentType,
}: {
  sessionState: SessionState
  prompt: string
  projectPath: string
  maxIterations: number
  stopCondition?: (sessionState: AgentState) => boolean
  agentType: AgentTemplateType
}) {
  console.log(blue(prompt))

  const startTime = Date.now()
  const sessionId = 'test-session-id-' + generateCompactId()
  let currentAgentState = sessionState.mainAgentState
  let iterations = 1
  const steps: AgentStep[] = []

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
      agentType
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
    'seconds'
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

export const applyAndRevertChangesSequentially = (() => {
  const queue: Array<() => Promise<void>> = []
  let isProcessing = false

  const processQueue = async () => {
    if (isProcessing || queue.length === 0) return
    isProcessing = true
    const nextOperation = queue.shift()
    if (nextOperation) {
      await nextOperation()
    }
    isProcessing = false
    processQueue()
  }

  return async (
    projectRoot: string,
    changes: FileChanges,
    onApply: () => Promise<void>
  ) => {
    return new Promise<void>((resolve, reject) => {
      queue.push(async () => {
        try {
          await applyAndRevertChanges(projectRoot, changes, onApply)
          resolve()
        } catch (error) {
          reject(error)
        }
      })
      processQueue()
    })
  }
})()

export function resetRepoToCommit(projectPath: string, commit: string) {
  console.log(`Resetting repository at ${projectPath} to commit ${commit}...`)
  try {
    execSync(
      `cd ${projectPath} && git reset --hard ${commit} && git clean -fd`,
      {
        timeout: 30_000,
      }
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
  applyAndRevertChangesSequentially,
  resetRepoToCommit,
}
