import fs from 'fs'
import {
  setProjectRoot,
  setWorkingDirectory,
} from '../../npm-app/src/project-files'
import { recreateShell } from '../../npm-app/src/terminal/base'
import { createFileReadingMock } from '../scaffolding'
import { setupTestEnvironmentVariables } from '../test-setup'
import { runSingleEval } from './run-git-evals'
import { EvalCommit, ModelConfig } from './types'

async function main() {
  const [
    evalCommitFilePath,
    projectPath,
    clientSessionId,
    fingerprintId,
    modelConfigStr,
  ] = process.argv.slice(2)

  if (
    !evalCommitFilePath ||
    !projectPath ||
    !clientSessionId ||
    !fingerprintId ||
    !modelConfigStr
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
  const modelConfig: ModelConfig = JSON.parse(modelConfigStr)

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
      fingerprintId,
      modelConfig
    )
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
    setTimeout(() => {
      process.exit(0)
    }, 2000)
  }
}

main()
