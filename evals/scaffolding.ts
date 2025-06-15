import { execSync } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { mock } from 'bun:test'

import { mainPrompt } from '@codebuff/backend/main-prompt'
import { ClientToolCall } from '@codebuff/backend/tools'
import { getFileTokenScores } from '@codebuff/code-map'
import { FileChanges } from '@codebuff/common/actions'
import { TEST_USER_ID } from '@codebuff/common/constants'
import {
  getAllFilePaths,
  getProjectFileTree,
} from '@codebuff/common/project-file-tree'
import { AgentState, ToolResult } from '@codebuff/common/types/agent-state'
import { applyAndRevertChanges } from '@codebuff/common/util/changes'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { generateCompactId } from '@codebuff/common/util/string'
import { handleToolCall } from 'codebuff/tool-handlers'
import { getSystemInfo } from 'codebuff/utils/system-info'
import { blue } from 'picocolors'
import { WebSocket } from 'ws'

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

export function createFileReadingMock(projectRoot: string) {
  mock.module('backend/websockets/websocket-action', () => ({
    requestFiles: (ws: WebSocket, filePaths: string[]) => {
      const files: Record<string, string | null> = {}
      for (const filePath of filePaths) {
        files[filePath] = readMockFile(projectRoot, filePath)
      }
      return Promise.resolve(files)
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
    currentWorkingDirectory: projectPath,
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

export async function runMainPrompt(
  agentState: AgentState,
  prompt: string | undefined,
  toolResults: ToolResult[],
  sessionId: string,
  options: {
    costMode: 'lite' | 'normal' | 'max' | 'experimental'
  }
) {
  const mockWs = new EventEmitter() as WebSocket
  mockWs.send = mock()
  mockWs.close = mock()

  // Create a prompt action that matches the new structure
  const promptAction = {
    type: 'prompt' as const,
    promptId: generateCompactId(),
    prompt,
    fingerprintId: 'test-fingerprint-id',
    costMode: options.costMode,
    agentState,
    toolResults,
  }

  let fullResponse = ''

  const result = await mainPrompt(mockWs, promptAction, {
    userId: TEST_USER_ID,
    clientSessionId: sessionId,
    onResponseChunk: (chunk: string) => {
      if (DEBUG_MODE) {
        process.stdout.write(chunk)
      }
      fullResponse += chunk
    },
    selectedModel: undefined, // selectedModel
    readOnlyMode: false, // readOnlyMode = false for evals
  })

  return {
    ...result,
    fullResponse,
  }
}

export async function runToolCalls(toolCalls: ClientToolCall[]) {
  const toolResults: ToolResult[] = []
  for (const toolCall of toolCalls) {
    const toolResult = await handleToolCall(toolCall)
    toolResults.push(toolResult)
  }
  return toolResults
}

export async function loopMainPrompt({
  agentState,
  prompt,
  projectPath,
  maxIterations,
  stopCondition,
  options = {
    costMode: 'normal',
  },
}: {
  agentState: AgentState
  prompt: string
  projectPath: string
  maxIterations: number
  stopCondition?: (
    agentState: AgentState,
    toolCalls: ClientToolCall[]
  ) => boolean
  options: {
    costMode: 'lite' | 'normal' | 'max' | 'experimental'
  }
}) {
  console.log(blue(prompt))

  const startTime = Date.now()
  const sessionId = 'test-session-id-' + generateCompactId()
  let currentAgentState = agentState
  let toolResults: ToolResult[] = []
  let toolCalls: ClientToolCall[] = []
  let iterations = 1
  const steps: AgentStep[] = []

  for (; iterations < maxIterations; iterations++) {
    console.log('\nIteration', iterations)
    let {
      agentState: newAgentState,
      toolCalls: newToolCalls,
      toolResults: newToolResults,
      fullResponse,
    } = await runMainPrompt(
      currentAgentState,
      iterations === 1 ? prompt : undefined,
      toolResults,
      sessionId,
      options
    )
    currentAgentState = newAgentState
    toolCalls = newToolCalls

    const stop = stopCondition && stopCondition(currentAgentState, toolCalls)
    if (stop) break

    toolResults = [
      ...newToolResults,
      ...(await runToolCalls(newToolCalls)),
    ].filter((tool) => tool.name !== 'end_turn')

    steps.push({
      response: fullResponse,
      toolCalls: newToolCalls,
      toolResults: newToolResults,
    })

    const containsEndTurn = toolCalls.some((call) => call.name === 'end_turn')

    if (containsEndTurn || toolResults.length === 0) {
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
    toolCalls,
    toolResults,
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
  runMainPrompt,
  runToolCalls,
  loopMainPrompt,
  extractErrorFiles,
  applyAndRevertChangesSequentially,
  resetRepoToCommit,
}
