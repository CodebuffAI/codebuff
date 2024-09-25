import { mock } from 'bun:test'
import path from 'path'
import fs from 'fs'
import { range } from 'lodash'
import { WebSocket } from 'ws'

import { ScoreTestContext } from './score-tests'
import * as mainPromptModule from 'backend/main-prompt'
import { ProjectFileContext } from 'common/util/file'
import { applyAndRevertChanges } from 'common/util/changes'
import { Message } from 'common/actions'
import {
  getProjectFileTree,
  getAllFilePaths,
} from 'common/src/project-file-tree'
import { getFileTokenScores } from 'code-map/parse'
import { EventEmitter } from 'events'
import { FileChanges } from 'common/actions'
import { projectTest } from './score-tests'

const DEBUG_MODE = true
const mockProjectRoot = path.join(__dirname, '../__mock-projects__/manifold')

projectTest('manifold project', async (getContext) => {
  const { currentWorkingDirectory } = await getProjectFileContext()
  await runTerminalCommand(
    `cd ${currentWorkingDirectory}/backend/api && yarn compile`
  )

  const tests = [
    { description: 'test full file path', fn: testFullFilePath },
    // { description: 'test delete comment', fn: testDeleteComment },
    // {
    //   description: 'test delete comment without knowledge',
    //   fn: testDeleteCommentWithoutKnowledge,
    // },
  ]

  // Run each test multiple times all in parallel
  const repeatCount = 2
  await Promise.all(
    tests.map(async ({ description, fn }) => {
      const scoreTestContext = getContext(description)
      await Promise.all(range(repeatCount).map(() => fn(scoreTestContext)))
    })
  )
})

const testFullFilePath = async ({ expectTrue }: ScoreTestContext) => {
  const fileContext = await getProjectFileContext()
  const { changes } = await runMainPrompt(fileContext, [
    {
      role: 'user',
      content:
        'Can you add a console.log statement to components/like-button.ts with all the props?',
    },
  ])

  console.log('changes', changes)
  const filePathToPatch = Object.fromEntries(
    changes.map((change) => [change.filePath, change.content])
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
  const fileContext = await getProjectFileContext()
  const { changes } = await runMainPrompt(fileContext, [
    {
      role: 'user',
      content: 'Add an endpoint to delete a comment',
    },
  ])

  const filePathToPatch = Object.fromEntries(
    changes.map((change) => [change.filePath, change.content])
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
  const fileContext = await getProjectFileContext()
  fileContext.knowledgeFiles = {}

  const { changes } = await runMainPrompt(fileContext, [
    {
      role: 'user',
      content: 'Add an endpoint to delete a comment',
    },
  ])

  const filePathToPatch = Object.fromEntries(
    changes.map((change) => [change.filePath, change.content])
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

mock.module('backend/websockets/websocket-action', () => ({
  requestFiles: (ws: WebSocket, filePaths: string[]) => {
    const files: Record<string, string | null> = {}
    for (const filePath of filePaths) {
      files[filePath] = readMockFile(filePath)
    }
    return Promise.resolve(files)
  },
}))

function readMockFile(filePath: string): string | null {
  const fullPath = path.join(mockProjectRoot, filePath)
  try {
    return fs.readFileSync(fullPath, 'utf-8')
  } catch (error) {
    return null
  }
}

async function getProjectFileContext(): Promise<ProjectFileContext> {
  const fileTree = getProjectFileTree(mockProjectRoot)
  const allFilePaths = getAllFilePaths(fileTree)
  const knowledgeFilePaths = allFilePaths.filter((filePath) =>
    filePath.endsWith('knowledge.md')
  )
  const knowledgeFiles: Record<string, string> = {}
  for (const filePath of knowledgeFilePaths) {
    const content = readMockFile(filePath)
    if (content !== null) {
      knowledgeFiles[filePath] = content
    }
  }
  const fileTokenScores = await getFileTokenScores(
    mockProjectRoot,
    allFilePaths
  )
  return {
    currentWorkingDirectory: mockProjectRoot,
    gitChanges: {
      status: '',
      diff: '',
      diffCached: '',
      lastCommitMessages: '',
    },
    changesSinceLastChat: {},
    files: {},
    knowledgeFiles,
    fileTokenScores,
    fileTree,
  }
}

async function runMainPrompt(
  fileContext: ProjectFileContext,
  messages: Message[]
) {
  const mockWs = new EventEmitter() as WebSocket
  mockWs.send = mock()
  mockWs.close = mock()

  return await mainPromptModule.mainPrompt(
    mockWs,
    messages,
    fileContext,
    'test-user-id',
    (chunk: string) => {
      if (DEBUG_MODE) {
        process.stdout.write(chunk)
      }
    }
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
