import { execSync } from 'child_process'
import path from 'path'

import { withTimeout } from '@codebuff/common/util/promise'
import { loadLocalAgents } from '@codebuff/npm-app/agents/load-agents'
import { CodebuffClient } from '../../sdk/src/client'
import { withTestRepo } from '../subagents/test-repo-utils'

import type { EvalCommitV2 } from './types'

export interface AgentStep {
  response: string
  toolCalls: any[]
  toolResults: any[]
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
  commit: EvalCommitV2
  repoUrl: string
  initCommand?: string
}): Promise<{
  diff: string
  contextFiles: Record<string, string>
  durationMs: number
  cost: number
  error?: string
  trace: AgentStep[]
}> {
  console.log(`[${commit.id}] Running agent ${agentId}...`)
  const startTime = Date.now()
  let diff = ''
  let contextFiles: Record<string, string> = {}
  let error: string | undefined
  let cost = 0
  const trace: AgentStep[] = []

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

        let responseText = ''
        let toolCalls: any[] = []
        let toolResults: any[] = []

        function flushStep() {
          if (
            responseText.length > 0 ||
            toolCalls.length > 0 ||
            toolResults.length > 0
          ) {
            trace.push({ response: responseText, toolCalls, toolResults })
            responseText = ''
            toolCalls = []
            toolResults = []
          }
        }

        const timeoutMs = 30 * 60 * 1000 // 30 minutes
        const result = await withTimeout(
          client.run({
            agent: agentId,
            prompt: commit.prompt,
            agentDefinitions: localAgentDefinitions,
            cwd: repoDir,
            handleEvent: (event) => {
              if (event.type === 'text') {
                if (toolResults.length > 0) {
                  flushStep()
                }
                responseText += event.text
              } else if (event.type === 'tool_call') {
                if (event.toolName === 'set_messages') {
                  return
                }
                toolCalls.push(event)
              } else if (event.type === 'tool_result') {
                toolResults.push(event)
              } else if (event.type === 'finish') {
                flushStep()
              } else if (event.type === 'error') {
                console.error(`[${agentId}] Error event:`, event.message)
              }
            },
          }),
          timeoutMs,
          `Agent ${agentId} timed out after ${timeoutMs / 1000} seconds`,
        )

        flushStep()
        cost = result.sessionState.mainAgentState.creditsUsed / 100

        execSync('git add .', { cwd: repoDir, stdio: 'ignore' })
        diff = execSync(`git diff ${commit.parentSha}`, {
          cwd: repoDir,
          encoding: 'utf-8',
        })

        const contextFilePaths = new Set<string>([
          ...commit.supplementalFiles,
          ...commit.fileDiffs.map((fd) => fd.path),
        ])
        for (const { status, path } of commit.fileDiffs) {
          if (status === 'added') {
            contextFilePaths.delete(path)
          }
        }

        for (const filePath of contextFilePaths) {
          try {
            const content = execSync(
              `git show ${commit.parentSha}:${JSON.stringify(filePath)}`,
              {
                cwd: repoDir,
                encoding: 'utf-8',
                maxBuffer: 10 * 1024 * 1024,
              },
            )
            contextFiles[filePath] = content
          } catch (error) {
            contextFiles[filePath] = ''
          }
        }
      },
    )
  } catch (e) {
    error = e instanceof Error ? `${e.message}\n${e.stack}` : String(e)
  }

  const durationMs = Date.now() - startTime

  return {
    diff,
    contextFiles,
    durationMs,
    cost,
    error,
    trace,
  }
}
