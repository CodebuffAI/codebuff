import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { promisify } from 'util'
import { exec } from 'child_process'

const execAsync = promisify(exec)

import { withTimeout } from '@codebuff/common/util/promise'
import { CodebuffClient } from '@codebuff/sdk'
import { withTestRepo } from '../subagents/test-repo-utils'

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { EvalCommitV2, FinalCheckOutput } from './types'

export type AgentStep = PrintModeEvent

const DEBUG_ERROR = true

export async function runAgentOnCommit({
  client,
  agentId,
  commit,
  repoUrl,
  initCommand,
  env,
  localAgentDefinitions,
  printEvents,
  finalCheckCommands,
}: {
  client: CodebuffClient
  agentId: string
  commit: EvalCommitV2
  repoUrl: string
  initCommand?: string
  env?: Record<string, string>
  localAgentDefinitions: any[]
  printEvents: boolean
  finalCheckCommands?: string[]
}): Promise<{
  diff: string
  contextFiles: Record<string, string>
  durationMs: number
  cost: number
  error?: string
  trace: AgentStep[]
  finalCheckOutputs?: FinalCheckOutput[]
}> {
  console.log(`[${commit.id}] Running agent ${agentId}...`)
  const startTime = Date.now()
  let diff = ''
  let contextFiles: Record<string, string> = {}
  let error: string | undefined
  let cost = 0
  const trace: AgentStep[] = []
  let finalCheckOutputs: FinalCheckOutput[] | undefined

  try {
    const timeoutMs = 60 * 60 * 1000 // 60 minutes
    await withTimeout(
      withTestRepo(
        {
          repoUrl,
          parentSha: commit.parentSha,
          initCommand,
          env,
        },
        async (repoDir) => {
          const maxAgentSteps = 40
          const result = await client.run({
            agent: agentId,
            prompt: commit.prompt,
            agentDefinitions: localAgentDefinitions,
            cwd: repoDir,
            env,
            maxAgentSteps,
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
              } else if (printEvents) {
                console.log(
                  `[${commit.id}:${agentId}]`,
                  JSON.stringify(event, null, 2),
                )
              }
              trace.push(event)
            },
          })
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

          // Run final check commands if specified
          if (finalCheckCommands && finalCheckCommands.length > 0) {
            console.log(
              `[${commit.id}] Running ${finalCheckCommands.length} final check commands...`,
            )
            finalCheckOutputs = await runFinalCheckCommands(
              finalCheckCommands,
              repoDir,
              env,
            )
          }
        },
      ),
      timeoutMs,
      `Agent ${agentId} timed out after ${timeoutMs / 1000} seconds`,
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
    finalCheckOutputs,
  }
}

async function runFinalCheckCommands(
  commands: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<FinalCheckOutput[]> {
  const results: FinalCheckOutput[] = []

  for (const command of commands) {
    console.log(`  Running: ${command}`)
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: { ...process.env, ...env },
      })
      results.push({
        command,
        exitCode: 0,
        stdout,
        stderr,
      })
      console.log(`  ✓ Command succeeded: ${command}`)
    } catch (error: any) {
      // Command failed, but we still capture the output
      results.push({
        command,
        exitCode: error.code || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
      })
      console.log(`  ✗ Command failed (exit ${error.code}): ${command}`)
    }
  }

  return results
}
