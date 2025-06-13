import {
  setProjectRoot,
  setWorkingDirectory,
} from '../../npm-app/src/project-files'
import { recreateShell } from '../../npm-app/src/terminal/base'
import { createFileReadingMock } from '../scaffolding'
import { setupTestEnvironmentVariables } from '../test-setup'
import { runSingleEval } from './run-git-evals'
import { EvalCommit } from './types'

async function main() {
  const [evalCommitStr, projectPath, clientSessionId, fingerprintId] =
    process.argv.slice(2)

  if (!evalCommitStr || !projectPath || !clientSessionId || !fingerprintId) {
    console.error('Missing required arguments for single eval process')
    process.exit(1)
  }

  const evalCommit: EvalCommit = JSON.parse(evalCommitStr)

  try {
    // Setup environment for this process
    setupTestEnvironmentVariables()
    createFileReadingMock(projectPath)
    recreateShell(projectPath, true)
    setProjectRoot(projectPath)
    setWorkingDirectory(projectPath)

    console.log({ send: process.send }, 'asdf')
    if (process.send) {
      const e = new Error('test error asdf')
      process.send({
        type: 'error',
        error: { message: e.message, stack: e.stack },
      })
    }
    process.exit(1)

    const result = await runSingleEval(
      evalCommit,
      projectPath,
      clientSessionId,
      fingerprintId
    )
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
    process.exit(0)
  }
}

main()
