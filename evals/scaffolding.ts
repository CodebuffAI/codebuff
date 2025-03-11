import { mock } from 'bun:test'
import path from 'path'
import fs from 'fs'
import { WebSocket } from 'ws'
import { execSync } from 'child_process'

import * as mainPromptModule from 'backend/main-prompt'
import { ProjectFileContext } from 'common/util/file'
import { applyAndRevertChanges } from 'common/util/changes'
import {
  getAllFilePaths,
  getProjectFileTree,
} from 'common/src/project-file-tree'
import { getFileTokenScores } from 'code-map/parse'
import { EventEmitter } from 'events'
import { FileChanges } from 'common/actions'
import { getSystemInfo } from 'npm-app/utils/system-info'
import { TEST_USER_ID } from 'common/constants'
import { AgentState, ToolResult } from 'common/src/types/agent-state'
import { generateCompactId } from 'common/util/string'
import { handleToolCall } from 'npm-app/tool-handlers'
import { ClientToolCall } from 'backend/tools'

const DEBUG_MODE = true

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
  const fileTokenScores = await getFileTokenScores(projectPath, allFilePaths)
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
  toolResults: ToolResult[]
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
    costMode: 'normal' as const,
    agentState,
    toolResults,
  }

  return await mainPromptModule.mainPrompt(
    mockWs,
    promptAction,
    TEST_USER_ID,
    'test-session-id',
    (chunk: string) => {
      if (DEBUG_MODE) {
        process.stdout.write(chunk)
      }
    }
  )
}

export async function runToolCalls(
  toolCalls: ClientToolCall[],
  projectPath: string
) {
  const toolResults: ToolResult[] = []
  for (const toolCall of toolCalls) {
    const toolResult = await handleToolCall(toolCall, projectPath)
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
}: {
  agentState: AgentState
  prompt: string
  projectPath: string
  maxIterations: number
  stopCondition?: (
    agentState: AgentState,
    toolCalls: ClientToolCall[]
  ) => boolean
}) {
  const startTime = Date.now()
  let currentAgentState = agentState
  let toolResults: ToolResult[] = []
  let toolCalls: ClientToolCall[] = []
  let iterations = 1
  for (; iterations < maxIterations; iterations++) {
    console.log('\nIteration', iterations)
    let {
      agentState: newAgentState,
      toolCalls: newToolCalls,
      toolResults: newToolResults,
    } = await runMainPrompt(
      currentAgentState,
      iterations === 1 ? prompt : undefined,
      toolResults
    )
    currentAgentState = newAgentState
    toolCalls = newToolCalls

    const stop = stopCondition && stopCondition(currentAgentState, toolCalls)
    if (stop) break

    toolResults = [
      ...newToolResults,
      ...(await runToolCalls(toolCalls, projectPath)),
    ]

    const containsHaltToolCall = toolCalls.some(
      (call) => call.name === 'end_turn'
    )

    if (containsHaltToolCall || stop) {
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
