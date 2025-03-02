import { expect, test } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'

import { getProjectFileContext, loopMainPrompt } from './scaffolding'
import { getInitialAgentState } from 'common/types/agent-state'

export const runEvals = async (repoPath: string) => {
  const fileContext = await getProjectFileContext(repoPath)
  const initialAgentState = getInitialAgentState(fileContext)

  test(
    'should find correct file',
    async () => {
      const prompt =
        'Can you add a console.log statement to components/like-button.ts with all the props?'
      let { toolCalls } = await loopMainPrompt({
        agentState: initialAgentState,
        prompt,
        projectPath: repoPath,
        maxIterations: 20,
        stopCondition: (_, toolCalls) => {
          return toolCalls.some((call) => call.name === 'write_file')
        },
      })

      // Extract write_file tool calls
      const writeFileCalls = toolCalls.filter(
        (call) => call.name === 'write_file'
      )
      const changes = writeFileCalls.map((call) => call.parameters)

      const filePathToPatch = Object.fromEntries(
        changes.map((change) => [change.path, change.content])
      )
      const filesChanged = Object.keys(filePathToPatch)

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
    { timeout: 2 * 60_000 }
  )

  test(
    'should add delete comment endpoint',
    async () => {
      const prompt = 'Add an endpoint to delete a comment'
      await loopMainPrompt({
        agentState: initialAgentState,
        prompt,
        projectPath: repoPath,
        maxIterations: 20,
      })

      // Read the actual files from disk
      const deleteCommentPath = path.join(
        repoPath,
        'backend/api/src/delete-comment.ts'
      )
      const schemaPath = path.join(repoPath, 'common/src/api/schema.ts')
      const routesPath = path.join(repoPath, 'backend/api/src/routes.ts')

      // Check that the expected files exist
      expect(
        fs.existsSync(deleteCommentPath),
        'delete-comment.ts file exists'
      ).toBe(true)

      const deleteCommentContent = fs.readFileSync(deleteCommentPath, 'utf-8')

      expect(
        deleteCommentContent.includes('comment_id'),
        'delete-comment.ts references comment_id'
      ).toBe(true)

      expect(
        deleteCommentContent.includes('isAdminId'),
        'delete-comment.ts references isAdminId'
      ).toBe(true)

      // Check that the route is registered in routes.ts
      const routesContent = fs.readFileSync(routesPath, 'utf-8')
      expect(
        routesContent.includes("'delete-comment': deleteComment"),
        'routes.ts includes delete-comment handler'
      ).toBe(true)

      // Check that the schema includes the delete-comment endpoint
      const schemaContent = fs.readFileSync(schemaPath, 'utf-8')
      expect(
        schemaContent.includes("'delete-comment'"),
        'schema.ts includes delete-comment endpoint'
      ).toBe(true)
    },
    { timeout: 10 * 60_000 }
  )
}

/*
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
