import { execSync } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'

import { mock } from 'bun:test'
import { CodebuffMessage } from 'common/types/message'
import { SessionState, ToolResult } from 'common/types/session-state'
import { blue } from 'picocolors'
import { WebSocket } from 'ws'
import * as mainPromptModule from '../backend/src/main-prompt'
import { ClientToolCall, CodebuffToolCall } from '../backend/src/tools'
import { FileChanges } from '../common/src/actions'
import { TEST_USER_ID } from '../common/src/constants'
import {
  getAllFilePaths,
  getProjectFileTree,
} from '../common/src/project-file-tree'
import { applyAndRevertChanges } from '../common/src/util/changes'
import { ProjectFileContext } from '../common/src/util/file'
import { generateCompactId } from '../common/src/util/string'
import { handleToolCall } from '../npm-app/src/tool-handlers'
import { getSystemInfo } from '../npm-app/src/utils/system-info'
import { getFileTokenScores } from '../packages/code-map/parse'
import { ModelConfig } from './git-evals/types'

const DEBUG_MODE = true

export type AgentStep = {
  response: CodebuffMessage[]
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

export async function runMainPrompt(
  sessionState: SessionState,
  prompt: string | undefined,
  toolResults: ToolResult[],
  sessionId: string,
  options: {
    costMode: 'lite' | 'normal' | 'max' | 'experimental'
    modelConfig: ModelConfig
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
    sessionState,
    toolResults,
  }

  let fullResponse: CodebuffMessage[] = []
  let textBuffer = ''
  function flushTextBuffer() {
    if (textBuffer) {
      fullResponse.push({ role: 'assistant', content: textBuffer })
      textBuffer = ''
    }
  }

  const result = await mainPromptModule.mainPrompt(mockWs, promptAction, {
    userId: TEST_USER_ID,
    clientSessionId: sessionId,
    onResponseChunk: (chunk: string | CodebuffToolCall) => {
      if (DEBUG_MODE) {
        if (typeof chunk === 'string') {
          process.stdout.write(chunk)
        } else {
          console.log(chunk)
        }
      }
      if (typeof chunk === 'string') {
        textBuffer += chunk
      } else {
        flushTextBuffer()
        fullResponse.push({
          role: 'assistant',
          content: [{ type: 'tool-call', ...chunk }],
        })
      }
    },
    selectedModel: undefined,
    readOnlyMode: false, // readOnlyMode = false for evals
    modelConfig: options.modelConfig,
  })
  flushTextBuffer()

  return {
    ...result,
    fullResponse,
  }
}

export async function runToolCalls(
  toolCalls: ClientToolCall[]
): Promise<CodebuffMessage[]> {
  const callsAndResults: CodebuffMessage[] = []
  for (const toolCall of toolCalls) {
    const toolResult = await handleToolCall(toolCall)
    callsAndResults.push(
      { role: 'assistant', content: [{ type: 'tool-call', ...toolCall }] },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            result: toolResult,
          },
        ],
      }
    )
  }
  return callsAndResults
}

export async function loopMainPrompt({
  sessionState,
  prompt,
  projectPath,
  maxIterations,
  stopCondition,
  options = {
    costMode: 'normal',
    modelConfig: {},
  },
}: {
  sessionState: SessionState
  prompt: string
  projectPath: string
  maxIterations: number
  stopCondition?: (
    sessionState: SessionState,
    toolCalls: ClientToolCall[]
  ) => boolean
  options: {
    costMode: 'lite' | 'normal' | 'max' | 'experimental'
    modelConfig: ModelConfig
  }
}) {
  console.log(blue(prompt))

  const startTime = Date.now()
  const sessionId = 'test-session-id-' + generateCompactId()
  let currentSessionState = sessionState
  let toolResults: ToolResult[] = []
  let toolCalls: ClientToolCall[] = []
  let iterations = 1
  const steps: AgentStep[] = []

  for (; iterations < maxIterations; iterations++) {
    console.log('\nIteration', iterations)
    if (iterations === 1) {
      currentSessionState.mainAgentState.stepsRemaining = maxIterations
    }
    let {
      sessionState: newSessionState,
      toolCalls: newToolCalls,
      toolResults: newToolResults,
      fullResponse,
    } = await runMainPrompt(
      currentSessionState,
      iterations === 1 ? prompt : undefined,
      toolResults,
      sessionId,
      options
    )
    currentSessionState = newSessionState
    toolCalls = newToolCalls

    const stop = stopCondition && stopCondition(currentSessionState, toolCalls)
    if (stop) break

    const toolCallMessages = await runToolCalls(newToolCalls)
    currentSessionState.mainAgentState.messageHistory.push(...toolCallMessages)

    steps.push({
      response: [...fullResponse, ...toolCallMessages],
      toolCalls: newToolCalls,
      toolResults: newToolResults,
    })

    const containsEndTurn = toolCalls.some(
      (call) => call.toolName === 'end_turn'
    )

    if (
      containsEndTurn ||
      (toolCalls.length === 0 &&
        typeof fullResponse[fullResponse.length - 1]?.content === 'string')
    ) {
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
    sessionState: currentSessionState,
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
