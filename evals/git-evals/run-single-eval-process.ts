import fs from 'fs'

import {
  setProjectRoot,
  setWorkingDirectory,
} from '@codebuff/npm-app/project-files'
import { recreateShell } from '@codebuff/npm-app/terminal/run-command'

import { createFileReadingMock } from '../scaffolding'
import { setupTestEnvironmentVariables } from '../test-setup'
import { runSingleEval } from './run-git-evals'

import type { EvalCommit } from './types'

async function main() {
  // Set up signal handlers for graceful shutdown
  let shouldExit = false
  const signalHandler = (signal: string) => {
    console.log(`Child process received ${signal}, exiting gracefully...`)
    shouldExit = true
    process.exit(0)
  }

  process.on('SIGINT', () => signalHandler('SIGINT'))
  process.on('SIGTERM', () => signalHandler('SIGTERM'))

  const [
    evalCommitFilePath,
    projectPath,
    clientSessionId,
    fingerprintId,
    codingAgent,
    agent,
    promptWithAgent,
  ] = process.argv.slice(2)

  if (
    !evalCommitFilePath ||
    !projectPath ||
    !clientSessionId ||
    !fingerprintId ||
    !codingAgent ||
    !agent ||
    !promptWithAgent
  ) {
    console.error('Missing required arguments for single eval process')
    process.exit(1)
  }

  let evalCommit: EvalCommit
  try {
    const evalCommitStr = fs.readFileSync(evalCommitFilePath, 'utf-8')
    evalCommit = JSON.parse(evalCommitStr)
  } catch (error) {
    console.error('Failed to read evalCommit from file:', error)
    process.exit(1)
  }

  try {
    // Setup environment for this process
    setProjectRoot(projectPath)
    setupTestEnvironmentVariables()
    await createFileReadingMock(projectPath)
    recreateShell(projectPath)
    setWorkingDirectory(projectPath)

    // Check if we should exit early due to signal
    if (shouldExit) {
      process.exit(0)
    }

    const result = await runSingleEval(
      evalCommit,
      projectPath,
      clientSessionId,
      fingerprintId,
      codingAgent as any,
      agent,
      promptWithAgent === 'true',
    )

    // Check again after long-running operation
    if (shouldExit) {
      process.exit(0)
    }

    console.log('Final result:', { result })
    if (process.send) {
      process.send({ type: 'result', result })
    }
  } catch (error) {
    if (process.send) {
      process.send({
        type: 'error',
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      })
    }
  } finally {
    // Exit more quickly if signal received, otherwise wait briefly
    const exitDelay = shouldExit ? 100 : 2000
    setTimeout(() => {
      process.exit(0)
    }, exitDelay)
  }
}

main()
