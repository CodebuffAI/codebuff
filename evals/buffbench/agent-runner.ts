import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

import { withTimeout } from '@codebuff/common/util/promise'
import { CodebuffClient } from '../../sdk/src/client'
import { withTestRepo } from '../subagents/test-repo-utils'

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { EvalCommitV2 } from './types'

export type AgentStep = PrintModeEvent

const DEBUG_ERROR = true

export async function runAgentOnCommit({
  client,
  agentId,
  commit,
  repoUrl,
  initCommand,
  localAgentDefinitions,
}: {
  client: CodebuffClient
  agentId: string
  commit: EvalCommitV2
  repoUrl: string
  initCommand?: string
  localAgentDefinitions: any[]
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
        const timeoutMs = 30 * 60 * 1000 // 30 minutes
        const result = await withTimeout(
          client.run({
            agent: agentId,
            prompt: commit.prompt,
            agentDefinitions: localAgentDefinitions,
            cwd: repoDir,
            handleEvent: (event) => {
              if (
                (event.type === 'tool_call' || event.type === 'tool_result') &&
                event.toolName === 'set_messages'
              ) {
                return
              }
              if (event.type === 'error') {
                console.error(
                  `[${commit.id}:${agentId}] Error event:`,
                  event.message,
                )
                if (DEBUG_ERROR && !event.message.startsWith('Invalid JSON')) {
                  // Save errors in a file, but not tool calls with invalid json.
                  fs.writeFileSync(
                    path.join(
                      __dirname,
                      `${commit.id}-${agentId}-error-${Math.random().toString(36).substring(2, 6)}.json`,
                    ),
                    JSON.stringify(
                      {
                        error: event.message,
                        trace: trace,
                      },
                      null,
                      2,
                    ),
                  )
                }
              }
              trace.push(event)
            },
          }),
          timeoutMs,
          `Agent ${agentId} timed out after ${timeoutMs / 1000} seconds`,
        )
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
