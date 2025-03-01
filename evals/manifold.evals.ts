import { expect, test } from 'bun:test'

import {
  createFileReadingMock,
  getProjectFileContext,
  runMainPrompt,
  runToolCalls,
} from './scaffolding'
import { getInitialAgentState } from 'common/types/agent-state'
import { handleToolCall } from 'npm-app/tool-handlers'
import { recreateShell } from 'npm-app/utils/terminal'

export const runEvals = async (repoPath: string) => {
  createFileReadingMock(repoPath)
  recreateShell(repoPath)

  // Compile the api.
  await handleToolCall(
    {
      name: 'run_terminal_command',
      parameters: { command: 'cd backend/api && yarn compile' },
      id: '1',
    },
    repoPath
  )

  const fileContext = await getProjectFileContext(repoPath)
  const initialAgentState = getInitialAgentState(fileContext)

  test(
    'should find correct file',
    async () => {
      const prompt =
        'Can you add a console.log statement to components/like-button.ts with all the props?'
      let { agentState, toolCalls } = await runMainPrompt(
        initialAgentState,
        prompt,
        []
      )

      const containsCompleteToolCall = toolCalls.some(
        (call) => call.name === 'complete'
      )

      if (!containsCompleteToolCall) {
        const toolResults = await runToolCalls(toolCalls, repoPath)
        console.log('toolResults', toolResults)
        ;({ agentState, toolCalls } = await runMainPrompt(
          agentState,
          undefined,
          toolResults
        ))
      }
      // Extract write_file tool calls
      const writeFileCalls = toolCalls.filter(
        (call) => call.name === 'write_file'
      )
      const changes = writeFileCalls.map((call) => call.parameters)

      const filePathToPatch = Object.fromEntries(
        changes.map((change) => [change.path, change.content])
      )
      const filesChanged = Object.keys(filePathToPatch)

      console.log('filesChanged', filesChanged)

      const expectedPath = 'web/components/contract/react-button.tsx'
      expect(filesChanged, 'includes like-button.tsx file').toEqual([
        expectedPath,
      ])

      const likeButtonPatch = filePathToPatch[expectedPath]
      expect(
        !!likeButtonPatch && likeButtonPatch.includes('console.log('),
        'like-button.tsx includes console.log'
      ).toBe(true)
    },
    { timeout: 120_000 }
  )
}

/*
const testDeleteComment = async ({
  expectTrue,
  incrementScore,
}: ScoreTestContext) => {
  const fileContext = await getProjectFileContext()
  const { toolCalls } = await runMainPrompt(fileContext, [
    {
      role: 'user',
      content: 'Add an endpoint to delete a comment',
    },
  ])

  // Extract write_file tool calls
  const writeFileCalls = toolCalls.filter((call) => call.name === 'write_file')
  const changes = writeFileCalls.map((call) => ({
    path: call.parameters.path,
    content: call.parameters.content,
  }))

  const filePathToPatch = Object.fromEntries(
    changes.map((change) => [change.path, change.content])
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
    changes as any,
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

  const { toolCalls } = await runMainPrompt(fileContext, [
    {
      role: 'user',
      content: 'Add an endpoint to delete a comment',
    },
  ])

  // Extract write_file tool calls
  const writeFileCalls = toolCalls.filter((call) => call.name === 'write_file')
  const changes = writeFileCalls.map((call) => ({
    path: call.parameters.path,
    content: call.parameters.content,
  }))

  const filePathToPatch = Object.fromEntries(
    changes.map((change) => [change.path, change.content])
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
    changes as any,
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
*/
