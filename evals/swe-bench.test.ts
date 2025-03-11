import { expect, test, describe } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'

import { loopMainPrompt } from './scaffolding'
import {
  setupTestEnvironment,
  createInitialAgentState,
  ensureTestRepos,
  TEST_REPOS_DIR,
} from './test-setup'
import { passesSweBenchTests } from './swe-bench-eval'
import { PROMPT_PREFIX } from './constants'

const REPO_AND_INSTANCE_IDS = {
  matplotlib: ['matplotlib__matplotlib-25442', 'matplotlib__matplotlib-23299'],
  pylint: [
    'pylint-dev__pylint-5859',
    'pylint-dev__pylint-6506',
    'pylint-dev__pylint-7080',
    'pylint-dev__pylint-7114',
    'pylint-dev__pylint-7228',
    'pylint-dev__pylint-7993',
  ],
}
const LITE_DATASET_PATH = path.join(
  TEST_REPOS_DIR,
  'codebuff-swe-bench',
  'princeton-nlp--SWE-bench_Lite.json'
)

describe('SWE-Bench', async () => {
  await ensureTestRepos()
  const sweBenchLiteList = JSON.parse(
    fs.readFileSync(LITE_DATASET_PATH, 'utf-8')
  ) as Record<string, any>[]

  const sweBenchLiteDataset = sweBenchLiteList.reduce(
    (accumulator, instance) => {
      accumulator[instance['instance_id']] = instance
      return accumulator
    },
    {} as Record<
      string,
      {
        instance_id: string
        base_commit: string
        problem_statement: string
      }
    >
  )

  Object.entries(REPO_AND_INSTANCE_IDS).forEach(([repoName, instanceIds]) => {
    describe(repoName, async () => {
      instanceIds.forEach((instanceId) =>
        test(
          instanceId,
          async () => {
            const { repoPath, resetRepo } = await setupTestEnvironment(repoName)
            const initialAgentState = await createInitialAgentState(repoPath)
            resetRepo(sweBenchLiteDataset[instanceId].base_commit)

            const prompt =
              PROMPT_PREFIX + sweBenchLiteDataset[instanceId].problem_statement
            await loopMainPrompt({
              agentState: initialAgentState,
              prompt,
              projectPath: repoPath,
              maxIterations: 100,
            })
            expect(passesSweBenchTests(instanceId, repoPath)).toBeTruthy()
          },
          { timeout: 10 * 60 * 60 * 1000 } // 10 hours
        )
      )
    })
  })
})
