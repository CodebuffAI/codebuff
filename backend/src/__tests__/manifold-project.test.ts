import { jest } from 'bun:test'
import path from 'path'
import fs from 'fs'
import { WebSocket } from 'ws'

import * as mainPromptModule from '../main-prompt'
import * as websocketActionModule from '../websockets/websocket-action'
import { getFilePathFromPatch, ProjectFileContext } from 'common/util/file'
import { applyAndRevertChanges } from 'common/util/changes'
import { Message } from 'common/actions'
import {
  getProjectFileTree,
  getAllFilePaths,
} from 'common/src/project-file-tree'
import { EventEmitter } from 'events'
import { projectTest } from './score-tests'

function readMockFile(filePath: string): string | null {
  const fullPath = path.join(__dirname, '__mock-projects__/manifold', filePath)
  try {
    return fs.readFileSync(fullPath, 'utf-8')
  } catch (error) {
    return null
  }
}

function getProjectFileContext(): ProjectFileContext {
  const mockProjectRoot = path.join(__dirname, '__mock-projects__/manifold')
  const fileTree = getProjectFileTree(mockProjectRoot)
  const knowledgeFilePaths = getAllFilePaths(fileTree).filter((filePath) =>
    filePath.endsWith('knowledge.md')
  )
  const knowledgeFiles: Record<string, string> = {}
  for (const filePath of knowledgeFilePaths) {
    const content = readMockFile(filePath)
    if (content !== null) {
      knowledgeFiles[filePath] = content
    }
  }
  return {
    currentWorkingDirectory: mockProjectRoot,
    files: {},
    knowledgeFiles,
    exportedTokens: {},
    fileTree,
  }
}

const mockRequestFiles = jest.spyOn(websocketActionModule, 'requestFiles')

async function runMainPrompt(
  fileContext: ProjectFileContext,
  messages: Message[]
) {
  const mockWs = new EventEmitter() as WebSocket
  mockWs.send = jest.fn()
  mockWs.close = jest.fn()

  mockRequestFiles.mockImplementation((ws: WebSocket, filePaths: string[]) => {
    const files: Record<string, string | null> = {}
    for (const filePath of filePaths) {
      files[filePath] = readMockFile(filePath)
    }
    return Promise.resolve(files)
  })

  return await mainPromptModule.mainPrompt(
    mockWs,
    messages,
    fileContext,
    'test-user-id',
    (chunk: string) => process.stdout.write(chunk)
  )
}

function extractErrorFiles(output: string): string[] {
  const lines = output.split('\n')
  return lines
    .filter((line) => line.includes(': error TS'))
    .map((line) => line.split('(')[0].trim())
}

projectTest('manifold project', async ({ expectTrue, incrementScore }) => {
  const fileContext = getProjectFileContext()
  const { changes } = await runMainPrompt(fileContext, [
    {
      role: 'user',
      content: 'Add an endpoint to delete a comment',
    },
  ])

  expectTrue(
    'mockRequestFiles was called once',
    mockRequestFiles.mock.calls.length === 1
  )

  const filesChanged = changes.map(getFilePathFromPatch)
  expectTrue(
    'includes delete-comment.ts file',
    filesChanged.includes('backend/api/src/delete-comment.ts')
  )
  expectTrue(
    'includes app.ts file',
    filesChanged.includes('backend/api/src/app.ts')
  )
  expectTrue(
    'includes schema.ts file',
    filesChanged.includes('common/src/api/schema.ts')
  )

  await applyAndRevertChanges(
    fileContext.currentWorkingDirectory,
    changes,
    async () => {
      const compileResult = await runTerminalCommand(
        `cd ${fileContext.currentWorkingDirectory}/backend/api && yarn compile`
      )
      const errorFiles = extractErrorFiles(compileResult.stdout)
      const scoreChange = Math.max(3 - errorFiles.length, 0)
      incrementScore(
        scoreChange,
        3,
        `${errorFiles.length} files with type errors`
      )
    }
  )
})

async function runTerminalCommand(command: string) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>(
    (resolve) => {
      const { exec } = require('child_process')
      exec(command, (error: Error | null, stdout: string, stderr: string) => {
        resolve({
          stdout,
          stderr,
          exitCode: error && 'code' in error ? (error.code as number) : 0,
        })
      })
    }
  )
}
