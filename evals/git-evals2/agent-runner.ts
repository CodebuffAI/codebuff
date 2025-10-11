import { execSync } from 'child_process'
import path from 'path'

import { loadLocalAgents } from '@codebuff/npm-app/agents/load-agents'
import { CodebuffClient } from '../../sdk/src/client'
import { withTestRepo } from '../subagents/test-repo-utils'

import type { EvalCommit } from './types'

export interface AgentRunResult {
  diff: string
  durationMs: number
  cost: number
  error?: string
}

export async function runAgentOnCommit({
  client,
  agentId,
  commit,
  repoUrl,
  initCommand,
}: {
  client: CodebuffClient
  agentId: string
  commit: EvalCommit
  repoUrl: string
  initCommand?: string
}): Promise<AgentRunResult> {
  const startTime = Date.now()
  let diff = ''
  let error: string | undefined
  let cost = 0

  try {
    await withTestRepo(
      {
        repoUrl,
        parentSha: commit.parentSha,
        initCommand,
      },
      async (repoDir) => {
        const agentsPath = path.join(__dirname, '../../.agents')
        const localAgentDefinitions = Object.values(
          await loadLocalAgents({ agentsPath }),
        )

        const result = await client.run({
          agent: agentId,
          prompt: commit.spec,
          agentDefinitions: localAgentDefinitions,
          cwd: repoDir,
        })

        cost = result.sessionState.mainAgentState.creditsUsed / 100

        execSync('git add .', { cwd: repoDir, stdio: 'ignore' })
        diff = execSync('git diff HEAD', {
          cwd: repoDir,
          encoding: 'utf-8',
        })
      },
    )
  } catch (e) {
    error = e instanceof Error ? `${e.message}\n${e.stack}` : String(e)
  }

  const durationMs = Date.now() - startTime

  return {
    diff,
    durationMs,
    cost,
    error,
  }
}
