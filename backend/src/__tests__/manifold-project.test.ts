import { jest } from 'bun:test'
import path from 'path'
import fs from 'fs'
import { range } from 'lodash'
import { WebSocket } from 'ws'

import { ScoreTestContext } from './score-tests'
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
import { FileChanges } from 'common/actions'

projectTest('manifold project', async (getContext) => {
  const { currentWorkingDirectory } = getProjectFileContext()
  await runTerminalCommand(
    `cd ${currentWorkingDirectory}/backend/api && yarn compile`
  )

  const tests = [
    { description: 'test full file path', fn: testFullFilePath },
    { description: 'test delete comment', fn: testDeleteComment },
    {
      description: 'test delete comment without knowledge',
      fn: testDeleteCommentWithoutKnowledge,
    },
  ]

  // Run each test multiple times all in parallel
  const repeatCount = 3
  await Promise.all(
    tests.map(async ({ description, fn }) => {
      const scoreTestContext = getContext(description)
      await Promise.all(range(repeatCount).map(() => fn(scoreTestContext)))
    })
  )
})

const testFullFilePath = async ({ expectTrue }: ScoreTestContext) => {
  const fileContext = getProjectFileContext()
  const { changes } = await runMainPrompt(fileContext, [
    {
      role: 'user',
      content:
        'Can you add a console.log statement to components/like-button.ts with all the props?',
    },
  ])

  const filePathToPatch = Object.fromEntries(
    changes.map((patch) => [getFilePathFromPatch(patch), patch])
  )
  const filesChanged = Object.keys(filePathToPatch)

  expectTrue(
    'includes like-button.tsx file',
    filesChanged.includes('web/components/contract/like-button.tsx')
  )

  const likeButtonFile =
    filePathToPatch['web/components/contract/like-button.tsx']
  expectTrue(
    'like-button.tsx includes console.log',
    !!likeButtonFile && likeButtonFile.includes('console.log(')
  )
}

const testDeleteComment = async ({
  expectTrue,
  incrementScore,
}: ScoreTestContext) => {
  const fileContext = getProjectFileContext()
  const { changes } = await runMainPrompt(fileContext, [
    {
      role: 'user',
      content: 'Add an endpoint to delete a comment',
    },
  ])

  const filePathToPatch = Object.fromEntries(
    changes.map((patch) => [getFilePathFromPatch(patch), patch])
  )
  const filesChanged = Object.keys(filePathToPatch)
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

  const deleteCommentFile = filePathToPatch['backend/api/src/delete-comment.ts']
  expectTrue(
    'delete-comment.ts references comment_id',
    !!deleteCommentFile && deleteCommentFile.includes('comment_id')
  )
  expectTrue(
    'delete-comment.ts references isAdmin',
    !!deleteCommentFile && deleteCommentFile.includes('isAdmin')
  )

  await applyAndRevertChangesSequentially(
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
        `${errorFiles.join(', ')}: ${errorFiles.length} files with type errors`
      )
    }
  )
}

const testDeleteCommentWithoutKnowledge = async ({
  expectTrue,
  incrementScore,
}: ScoreTestContext) => {
  const fileContext = getProjectFileContext()
  fileContext.knowledgeFiles = {}

  const { changes } = await runMainPrompt(fileContext, [
    {
      role: 'user',
      content: 'Add an endpoint to delete a comment',
    },
  ])

  const filePathToPatch = Object.fromEntries(
    changes.map((patch) => [getFilePathFromPatch(patch), patch])
  )
  const filesChanged = Object.keys(filePathToPatch)

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

  const deleteCommentFile = filePathToPatch['backend/api/src/delete-comment.ts']
  expectTrue(
    'delete-comment.ts references comment_id',
    !!deleteCommentFile && deleteCommentFile.includes('comment_id')
  )
  expectTrue(
    'delete-comment.ts references isAdmin',
    !!deleteCommentFile && deleteCommentFile.includes('isAdmin')
  )

  await applyAndRevertChangesSequentially(
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
        `${errorFiles.join(', ')}: ${errorFiles.length} files with type errors`
      )
    }
  )
}

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
    (chunk: string) => {} //process.stdout.write(chunk)
  )
}

function extractErrorFiles(output: string): string[] {
  const lines = output.split('\n')
  return lines
    .filter((line) => line.includes(': error TS'))
    .map((line) => line.split('(')[0].trim())
}

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

const applyAndRevertChangesSequentially = (() => {
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
