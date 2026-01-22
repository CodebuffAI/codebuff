/**
 * Git operations for retrieving repository state.
 */

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { CodebuffSpawn } from '@codebuff/common/types/spawn'

const DEFAULT_GIT_TIMEOUT_MS = 10000 // 10 seconds

function childProcessToPromise(
  proc: ReturnType<CodebuffSpawn>,
  timeoutMs: number = DEFAULT_GIT_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timeoutId = setTimeout(() => {
      timedOut = true
      proc.kill()
      reject(new Error(`Git command timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code: number | null) => {
      clearTimeout(timeoutId)
      if (timedOut) return
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`Command exited with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      if (timedOut) return
      reject(err)
    })
  })
}

export async function getGitChanges(params: {
  cwd: string
  spawn: CodebuffSpawn
  logger: Logger
}): Promise<{
  status: string
  diff: string
  diffCached: string
  lastCommitMessages: string
}> {
  const { cwd, spawn, logger } = params

  const status = childProcessToPromise(spawn('git', ['status'], { cwd }))
    .then(({ stdout }) => stdout)
    .catch((error) => {
      logger.debug?.({ error }, 'Failed to get git status')
      return ''
    })

  const diff = childProcessToPromise(spawn('git', ['diff'], { cwd }))
    .then(({ stdout }) => stdout)
    .catch((error) => {
      logger.debug?.({ error }, 'Failed to get git diff')
      return ''
    })

  const diffCached = childProcessToPromise(
    spawn('git', ['diff', '--cached'], { cwd }),
  )
    .then(({ stdout }) => stdout)
    .catch((error) => {
      logger.debug?.({ error }, 'Failed to get git diff --cached')
      return ''
    })

  const lastCommitMessages = childProcessToPromise(
    spawn('git', ['log', '-n', '10', '--pretty=format:%s'], { cwd }),
  )
    .then(({ stdout }) => stdout.trim())
    .catch((error) => {
      logger.debug?.({ error }, 'Failed to get lastCommitMessages')
      return ''
    })

  return {
    status: await status,
    diff: await diff,
    diffCached: await diffCached,
    lastCommitMessages: await lastCommitMessages,
  }
}
