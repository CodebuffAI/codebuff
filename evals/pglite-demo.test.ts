import { expect, test, describe, beforeEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'

import { loopMainPrompt } from './scaffolding'
import { setupTestEnvironment, createInitialAgentState } from './test-setup'

describe('pglite-demo', async () => {
  // Set up the test environment once for all tests
  const { repoPath, resetRepo } = await setupTestEnvironment('pglite-demo')
  const initialAgentState = await createInitialAgentState(repoPath)

  // Reset repo before each test
  beforeEach(resetRepo)

  test(
    'should find correct file',
    async () => {
      const prompt = 'Can you add a console.log statement to the main page?'
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

      const expectedPath = 'app/page.tsx'
      expect(filesChanged, 'includes app/page.tsx file').toEqual([expectedPath])

      const appPage = filePathToPatch[expectedPath]
      expect(
        !!appPage && appPage.includes('console.log('),
        'app/page.tsx includes console.log'
      ).toBe(true)
    },
    { timeout: 2 * 60_000 }
  )
})
