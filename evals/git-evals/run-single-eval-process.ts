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

    const result = await runSingleEval(
      evalCommit,
      projectPath,
      clientSessionId,
      fingerprintId
    )
    if (process.send) {
      process.send({ type: 'result', result })
      console.log({ result }, 'Sent result to parent process')
    } else {
      console.log({ result }, 'No parent process to send result to')
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
      console.log({ error }, 'Sent error to parent process')
    } else {
      console.log({ error }, 'No parent process to send error to')
    }
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

main()
