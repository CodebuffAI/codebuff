import * as fs from 'fs'
import * as path from 'path'

import { describe, expect, test } from 'bun:test'

import { PROMPT_PREFIX } from './constants'
import { loopMainPrompt } from './scaffolding'
import { passesSweBenchTests } from './swe-bench-eval'
import { SWE_BENCH_IDS } from './swe-bench-ids'
import {
  createInitialAgentState,
  ensureTestRepos,
  setupTestEnvironment,
  TEST_REPOS_DIR,
} from './test-setup'

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

  Object.entries(SWE_BENCH_IDS).forEach(([repoName, instanceIds]) => {
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
              options: {
                costMode: 'normal'
              }
            })
            expect(await passesSweBenchTests(instanceId, repoPath)).toBeTruthy()
          },
          { timeout: 10 * 60 * 60 * 1000 } // 10 hours
        )
      )
    })
  })
})
