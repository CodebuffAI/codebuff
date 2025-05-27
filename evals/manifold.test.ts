import { expect, test, describe, beforeEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'

import { PROMPT_PREFIX } from './constants'
import { loopMainPrompt } from './scaffolding'
import { setupTestEnvironment, createInitialAgentState } from './test-setup'

describe('manifold', async () => {
  // Set up the test environment once for all tests
  const { repoPath, commit, resetRepo } = await setupTestEnvironment('manifold')
  const initialAgentState = await createInitialAgentState(repoPath)

  // Reset repo before each test
  beforeEach(() => resetRepo(commit))

  test(
    'should find correct file',
    async () => {
      const prompt =
        PROMPT_PREFIX +
        'Can you add a console.log statement to components/like-button.ts with all the props?'
      let { toolCalls } = await loopMainPrompt({
        agentState: initialAgentState,
        prompt,
        projectPath: repoPath,
        maxIterations: 20,
        stopCondition: (_, toolCalls) => {
          return toolCalls.some((call) => call.name === 'write_file')
        },
        options: {
          costMode: 'normal'
        }
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
      const prompt = PROMPT_PREFIX + 'Add an endpoint to delete a comment'
      await loopMainPrompt({
        agentState: initialAgentState,
        prompt,
        projectPath: repoPath,
        maxIterations: 20,
        options: {
          costMode: 'normal'
        }
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
})
