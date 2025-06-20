import { beforeEach, describe, expect, test } from 'bun:test'

import { PROMPT_PREFIX } from './constants'
import { loopMainPrompt } from './scaffolding'
import { createInitialAgentState, setupTestEnvironment } from './test-setup'

describe('pglite-demo', async () => {
  // Set up the test environment once for all tests
  const { repoPath, commit, resetRepo } =
    await setupTestEnvironment('pglite-demo')
  const initialAgentState = await createInitialAgentState(repoPath)

  // Reset repo before each test
  beforeEach(() => resetRepo(commit))

  test(
    'should find correct file',
    async () => {
      const prompt =
        PROMPT_PREFIX + 'Can you add a console.log statement to the main page?'
      let { toolCalls } = await loopMainPrompt({
        agentState: initialAgentState,
        prompt,
        projectPath: repoPath,
        maxIterations: 20,
        stopCondition: (_, toolCalls) => {
          return toolCalls.some((call) => call.toolName === 'write_file')
        },
        options: {
          costMode: 'normal',
        },
      })

      // Extract write_file tool calls
      const writeFileCalls = toolCalls.filter(
        (call) => call.toolName === 'write_file'
      )
      const changes = writeFileCalls.map((call) => call.args)

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
